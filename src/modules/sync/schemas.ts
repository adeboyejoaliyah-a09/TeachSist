import { z } from "zod";

const commonChange = {
  change_id: z.string().uuid(),
  base_version: z.number().int().nonnegative(),
};

const classId = z.string().uuid();

export const pushChangeSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...commonChange,
      operation: z.literal("upsert"),
      record: z
        .object({
          id: classId,
          name: z.string().trim().min(1).max(120),
          grade_level: z.string().trim().max(80).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commonChange,
      operation: z.literal("delete"),
      record: z.object({ id: classId }).strict(),
    })
    .strict(),
]);

export const pushBodySchema = z
  .object({
    changes: z.array(pushChangeSchema).min(1).max(100),
  })
  .strict();

export type PushChange = z.infer<typeof pushChangeSchema>;

export const classRecordSchema = z.object({
  id: classId,
  name: z.string(),
  grade_level: z.string().nullable(),
  version: z.number().int().positive(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});

export type ClassRecord = z.infer<typeof classRecordSchema>;

export const pushResultSchema = z.discriminatedUnion("status", [
  z.object({
    change_id: z.string().uuid(),
    status: z.literal("accepted"),
    record: classRecordSchema,
    conflict: z
      .object({
        base_version: z.number().int().nonnegative(),
        current_version: z.number().int().positive(),
        losing_record: classRecordSchema,
      })
      .optional(),
    replayed: z.boolean().optional(),
  }),
  z.object({
    change_id: z.string().uuid(),
    status: z.literal("rejected"),
    reason: z.enum(["not_found", "id_conflict"]),
    message: z.string(),
    replayed: z.boolean().optional(),
  }),
]);

export type PushResult = z.infer<typeof pushResultSchema>;

export const invalidChangeResultSchema = z.object({
  index: z.number().int().nonnegative(),
  status: z.literal("rejected"),
  reason: z.literal("invalid_change"),
  message: z.string(),
  details: z.array(z.unknown()),
});

export const temporarilyUnavailableResultSchema = z.object({
  index: z.number().int().nonnegative(),
  change_id: z.string().uuid(),
  status: z.literal("rejected"),
  reason: z.literal("temporarily_unavailable"),
  retryable: z.literal(true),
  message: z.string(),
});

export const pushResponseSchema = z.object({
  results: z.array(
    z.union([
      pushResultSchema,
      invalidChangeResultSchema,
      temporarilyUnavailableResultSchema,
    ]),
  ),
});

export const pullResponseSchema = z.object({
  changes: z.array(
    z.object({
      change_id: z.string().uuid(),
      entity: z.literal("classes"),
      operation: z.enum(["upsert", "delete"]),
      record: classRecordSchema,
    }),
  ),
  next_cursor: z.string(),
  has_more: z.boolean(),
});
