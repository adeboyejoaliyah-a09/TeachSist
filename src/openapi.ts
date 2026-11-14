import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  pullResponseSchema,
  pushBodySchema,
  pushResponseSchema,
} from "./modules/sync/schemas.js";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

const jsonResponse = (description: string, schema: z.ZodType) => ({
  description,
  content: { "application/json": { schema } },
});

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  responses: {
    200: jsonResponse(
      "Service is running",
      z.object({ status: z.literal("ok") }),
    ),
  },
});
registry.registerPath({
  method: "get",
  path: "/ready",
  tags: ["Health"],
  responses: {
    200: jsonResponse(
      "Service is ready",
      z.object({ status: z.literal("ready") }),
    ),
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/me",
  tags: ["Teacher"],
  security: [{ BearerAuth: [] }],
  responses: {
    200: jsonResponse(
      "Authenticated teacher profile",
      z.object({
        data: z.object({
          id: z.string().uuid(),
          role: z.enum(["teacher", "school_admin"]),
          plan: z.string(),
          school_id: z.string().uuid().nullable(),
        }),
      }),
    ),
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/sync/push",
  tags: ["Sync"],
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: pushBodySchema } },
    },
  },
  responses: {
    200: jsonResponse("Per-change sync results", pushResponseSchema),
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/sync/pull",
  tags: ["Sync"],
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  },
  responses: {
    200: jsonResponse("Changes after the supplied cursor", pullResponseSchema),
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);

export function getOpenApiDocument() {
  return generator.generateDocument({
    openapi: "3.0.0",
    info: { title: "TeachAura API", version: "1.0.0" },
    servers: [{ url: "/" }],
  });
}
