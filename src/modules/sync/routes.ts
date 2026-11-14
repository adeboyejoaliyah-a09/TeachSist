import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.js";
import type { SyncRepository } from "./repository.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import {
  pullResponseSchema,
  pushChangeSchema,
  pushResponseSchema,
} from "./schemas.js";

const pullQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export function createSyncRouter(
  repository: SyncRepository,
  cursorSecret: string,
): Router {
  const router = Router();

  router.post("/push", async (request, response, next) => {
    const body = z
      .object({
        changes: z.array(z.unknown()).min(1).max(100),
      })
      .strict()
      .safeParse(request.body);
    if (!body.success) {
      next(
        new HttpError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed",
          body.error.issues,
        ),
      );
      return;
    }

    const results: Array<Record<string, unknown>> = [];
    for (const [index, rawChange] of body.data.changes.entries()) {
      const parsed = pushChangeSchema.safeParse(rawChange);
      if (!parsed.success) {
        results.push({
          index,
          status: "rejected",
          reason: "invalid_change",
          message: "This change did not match the sync schema.",
          details: parsed.error.issues,
        });
        continue;
      }

      try {
        results.push(
          await repository.applyChange(response.locals.teacherId, parsed.data),
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "sync_change_failed",
            request_id: response.locals.requestId,
            change_index: index,
            error_name: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        results.push({
          index,
          change_id: parsed.data.change_id,
          status: "rejected",
          reason: "temporarily_unavailable",
          retryable: true,
          message:
            "The change could not be processed. Retry it with the same change_id.",
        });
      }
    }
    const output = pushResponseSchema.safeParse({ results });
    if (!output.success) {
      next(new Error("Sync push produced an invalid response"));
      return;
    }
    response.json(output.data);
  });

  router.get("/pull", async (request, response, next) => {
    const query = pullQuerySchema.safeParse(request.query);
    if (!query.success) {
      next(
        new HttpError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed",
          query.error.issues,
        ),
      );
      return;
    }

    try {
      const ownerId = response.locals.teacherId;
      const afterSequence = decodeCursor(
        query.data.cursor,
        ownerId,
        cursorSecret,
      );
      const page = await repository.pullChanges(
        ownerId,
        afterSequence,
        query.data.limit,
      );
      const output = pullResponseSchema.safeParse({
        changes: page.changes,
        next_cursor: encodeCursor(ownerId, page.nextSequence, cursorSecret),
        has_more: page.hasMore,
      });
      if (!output.success) {
        next(new Error("Sync pull produced an invalid response"));
        return;
      }
      response.json(output.data);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
