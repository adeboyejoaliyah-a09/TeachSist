import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { AppConfig } from "./config/env.js";
import { createAuthenticate } from "./middleware/authenticate.js";
import { errorHandler } from "./lib/error-handler.js";
import type { TeacherRepository } from "./modules/teachers/teacher.repository.js";
import { createSyncRouter } from "./modules/sync/routes.js";
import type { SyncRepository } from "./modules/sync/repository.js";
import { getOpenApiDocument } from "./openapi.js";
import { z } from "zod";

const teacherProfileSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["teacher", "school_admin"]),
  plan: z.string(),
  school_id: z.string().uuid().nullable(),
});

export interface AppDependencies {
  config: AppConfig;
  teachers: TeacherRepository;
  sync: SyncRepository;
  authenticate?: RequestHandler;
  ready?: () => Promise<void>;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const authenticate =
    dependencies.authenticate ?? createAuthenticate(dependencies.config);

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        callback(
          null,
          origin === undefined ||
            dependencies.config.CORS_ORIGINS.includes(origin),
        );
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_request, response) => {
        response.status(429).json({
          error: { code: "RATE_LIMITED", message: "Too many requests" },
        });
      },
    }),
  );

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.get("/ready", async (_request, response) => {
    try {
      await dependencies.ready?.();
      response.json({ status: "ready" });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "readiness_check_failed",
          request_id: response.locals.requestId,
          error_name: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      response.status(503).json({
        error: { code: "NOT_READY", message: "The service is not ready" },
      });
    }
  });

  const api = express.Router();
  api.use(authenticate);
  api.get("/openapi.json", (_request, response) => {
    response.json(getOpenApiDocument());
  });
  api.get("/me", async (_request, response, next) => {
    try {
      const profile = await dependencies.teachers.getOrCreateProfile(
        response.locals.teacherId,
      );
      const output = teacherProfileSchema.safeParse(profile);
      if (!output.success) {
        next(
          new Error("Teacher profile repository returned an invalid response"),
        );
        return;
      }
      response.json({ data: output.data });
    } catch (error) {
      next(error);
    }
  });
  api.use(
    "/sync",
    createSyncRouter(dependencies.sync, dependencies.config.SYNC_CURSOR_SECRET),
  );
  app.use("/api/v1", api);
  app.use(errorHandler);

  return app;
}
