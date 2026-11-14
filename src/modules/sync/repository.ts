import { Prisma, type PrismaClient } from "@prisma/client";
import {
  pushResultSchema,
  type ClassRecord,
  type PushChange,
  type PushResult,
} from "./schemas.js";

export interface PulledChange {
  change_id: string;
  entity: "classes";
  operation: "upsert" | "delete";
  record: ClassRecord;
}

export interface PullPage {
  changes: PulledChange[];
  nextSequence: string;
  hasMore: boolean;
}

export interface SyncRepository {
  applyChange(ownerId: string, change: PushChange): Promise<PushResult>;
  pullChanges(
    ownerId: string,
    afterSequence: string,
    limit: number,
  ): Promise<PullPage>;
}

interface ClassSnapshot {
  id: string;
  name: string;
  gradeLevel: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function toRecord(row: ClassSnapshot) {
  return {
    id: row.id,
    name: row.name,
    grade_level: row.gradeLevel,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function toJson(value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseStoredResult(value: Prisma.JsonValue): PushResult {
  return pushResultSchema.parse(value);
}

export class PrismaSyncRepository implements SyncRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async applyChange(ownerId: string, change: PushChange): Promise<PushResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT set_config('app.teacher_id', ${ownerId}, true)`;
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ownerId}:${change.change_id}`}, 0))`;

        const previous = await transaction.syncChange.findUnique({
          where: { ownerId_changeId: { ownerId, changeId: change.change_id } },
          select: { result: true },
        });
        if (previous) {
          return { ...parseStoredResult(previous.result), replayed: true };
        }

        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${change.record.id}, 1))`;
        const current = await transaction.schoolClass.findUnique({
          where: { id: change.record.id },
        });
        const now = new Date();
        let result: PushResult;

        if (!current && change.operation === "delete") {
          result = {
            change_id: change.change_id,
            status: "rejected",
            reason: "not_found",
            message: "The class does not exist or is not accessible.",
          };
        } else if (current && current.ownerId !== ownerId) {
          result = {
            change_id: change.change_id,
            status: "rejected",
            reason: "id_conflict",
            message: "A class with this id already exists.",
          };
        } else {
          if (!current && change.base_version !== 0) {
            result = {
              change_id: change.change_id,
              status: "rejected",
              reason: "not_found",
              message: "The class does not exist at the supplied base version.",
            };
          } else {
            const conflict =
              current !== null && change.base_version !== current.version;
            let updated: ClassSnapshot;
            if (change.operation === "delete") {
              if (!current)
                throw new Error(
                  "Cannot delete a class without an existing row",
                );
              updated = await transaction.schoolClass.update({
                where: { id: current.id },
                data: {
                  deletedAt: now,
                  version: current.version + 1,
                  updatedAt: now,
                },
              });
            } else if (current) {
              updated = await transaction.schoolClass.update({
                where: { id: current.id },
                data: {
                  name: change.record.name,
                  gradeLevel: change.record.grade_level ?? null,
                  deletedAt: null,
                  version: current.version + 1,
                  updatedAt: now,
                },
              });
            } else {
              updated = await transaction.schoolClass.create({
                data: {
                  id: change.record.id,
                  ownerId,
                  name: change.record.name,
                  gradeLevel: change.record.grade_level ?? null,
                  version: 1,
                  createdAt: now,
                  updatedAt: now,
                },
              });
            }
            const record = toRecord(updated);
            result = {
              change_id: change.change_id,
              status: "accepted",
              record,
              ...(conflict && current
                ? {
                    conflict: {
                      base_version: change.base_version,
                      current_version: current.version,
                      losing_record: toRecord(current),
                    },
                  }
                : {}),
            };
          }
        }

        await transaction.syncChange.create({
          data: {
            ownerId,
            changeId: change.change_id,
            entityType: "classes",
            entityId: change.record.id,
            operation: change.operation,
            status: result.status,
            result: toJson(result),
          },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return this.saveIdConflict(ownerId, change);
      }
      throw error;
    }
  }

  private async saveIdConflict(
    ownerId: string,
    change: PushChange,
  ): Promise<PushResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT set_config('app.teacher_id', ${ownerId}, true)`;
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ownerId}:${change.change_id}`}, 0))`;
      const previous = await transaction.syncChange.findUnique({
        where: { ownerId_changeId: { ownerId, changeId: change.change_id } },
        select: { result: true },
      });
      if (previous) {
        return { ...parseStoredResult(previous.result), replayed: true };
      }

      const result: PushResult = {
        change_id: change.change_id,
        status: "rejected",
        reason: "id_conflict",
        message: "A class with this id already exists.",
      };
      await transaction.syncChange.create({
        data: {
          ownerId,
          changeId: change.change_id,
          entityType: "classes",
          entityId: change.record.id,
          operation: change.operation,
          status: "rejected",
          result: toJson(result),
        },
      });
      return result;
    });
  }

  async pullChanges(
    ownerId: string,
    afterSequence: string,
    limit: number,
  ): Promise<PullPage> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT set_config('app.teacher_id', ${ownerId}, true)`;
      const rows = await transaction.syncChange.findMany({
        where: { ownerId, sequence: { gt: BigInt(afterSequence) } },
        orderBy: { sequence: "asc" },
        take: limit + 1,
        select: {
          sequence: true,
          changeId: true,
          operation: true,
          status: true,
          result: true,
        },
      });
      const page = rows.slice(0, limit);
      const changes: PulledChange[] = page.flatMap((row) => {
        if (row.status !== "accepted") return [];
        const result = parseStoredResult(row.result);
        if (result.status !== "accepted") return [];
        return [
          {
            change_id: row.changeId,
            entity: "classes",
            operation: row.operation,
            record: result.record,
          },
        ];
      });
      return {
        changes,
        nextSequence: page.at(-1)?.sequence.toString() ?? afterSequence,
        hasMore: rows.length > limit,
      };
    });
  }
}
