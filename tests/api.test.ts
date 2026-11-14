import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { RequestHandler } from "express";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import {
  type PullPage,
  type PulledChange,
  type SyncRepository,
} from "../src/modules/sync/repository.js";
import type {
  ClassRecord,
  PushChange,
  PushResult,
} from "../src/modules/sync/schemas.js";
import type {
  TeacherProfile,
  TeacherRepository,
} from "../src/modules/teachers/teacher.repository.js";
import { createServer, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { encodeCursor } from "../src/modules/sync/cursor.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgresql://test:test@localhost:5432/teachaura",
  SUPABASE_URL: "https://test.supabase.co",
  CORS_ORIGINS: ["http://localhost:3001"],
  SYNC_CURSOR_SECRET: "a-secure-test-secret-that-is-at-least-32-characters",
};
const teacherId = "9c32e58c-431c-4bd0-9c89-46a162299192";

class MemorySyncRepository implements SyncRepository {
  private readonly receipts = new Map<string, PushResult>();
  private readonly records = new Map<string, ClassRecord>();
  private readonly ownerByRecord = new Map<string, string>();
  private readonly log: Array<{
    sequence: number;
    ownerId: string;
    change: PulledChange | null;
  }> = [];
  private sequence = 0;

  async applyChange(ownerId: string, change: PushChange): Promise<PushResult> {
    const receiptKey = `${ownerId}:${change.change_id}`;
    const receipt = this.receipts.get(receiptKey);
    if (receipt) return { ...receipt, replayed: true };

    const owner = this.ownerByRecord.get(change.record.id);
    let result: PushResult;
    if (owner && owner !== ownerId) {
      result = {
        change_id: change.change_id,
        status: "rejected",
        reason: "id_conflict",
        message: "A class with this id already exists.",
      };
    } else {
      const current = this.records.get(change.record.id);
      if (!current && change.operation === "delete") {
        result = {
          change_id: change.change_id,
          status: "rejected",
          reason: "not_found",
          message: "The class does not exist or is not accessible.",
        };
      } else if (!current && change.base_version !== 0) {
        result = {
          change_id: change.change_id,
          status: "rejected",
          reason: "not_found",
          message: "The class does not exist at the supplied base version.",
        };
      } else {
        const now = new Date().toISOString();
        const conflict = current && current.version !== change.base_version;
        const record = {
          id: change.record.id,
          name:
            change.operation === "upsert"
              ? change.record.name
              : (current?.name ?? ""),
          grade_level:
            change.operation === "upsert"
              ? (change.record.grade_level ?? null)
              : (current?.grade_level ?? null),
          version: (current?.version ?? 0) + 1,
          created_at: current?.created_at ?? now,
          updated_at: now,
          deleted_at: change.operation === "delete" ? now : null,
        };
        this.records.set(change.record.id, record);
        this.ownerByRecord.set(change.record.id, ownerId);
        result = {
          change_id: change.change_id,
          status: "accepted",
          record,
          ...(conflict && current
            ? {
                conflict: {
                  base_version: change.base_version,
                  current_version: current.version,
                  losing_record: current,
                },
              }
            : {}),
        };
      }
    }

    this.receipts.set(receiptKey, result);
    this.sequence += 1;
    this.log.push({
      sequence: this.sequence,
      ownerId,
      change:
        result.status === "accepted"
          ? {
              change_id: change.change_id,
              entity: "classes",
              operation: change.operation,
              record: result.record,
            }
          : null,
    });
    return result;
  }

  async pullChanges(
    ownerId: string,
    afterSequence: string,
    limit: number,
  ): Promise<PullPage> {
    const eligible = this.log
      .filter(
        (entry) =>
          entry.ownerId === ownerId && entry.sequence > Number(afterSequence),
      )
      .slice(0, limit);
    return {
      changes: eligible.flatMap((entry) =>
        entry.change ? [entry.change] : [],
      ),
      nextSequence: eligible.at(-1)?.sequence.toString() ?? afterSequence,
      hasMore:
        this.log.filter(
          (entry) =>
            entry.ownerId === ownerId && entry.sequence > Number(afterSequence),
        ).length > limit,
    };
  }
}

const testAuth: RequestHandler = (_request, response, next) => {
  response.locals.teacherId = teacherId;
  next();
};

function authenticateAs(id: string): RequestHandler {
  return (_request, response, next) => {
    response.locals.teacherId = id;
    next();
  };
}

function makeApp(
  authenticate = testAuth,
  syncRepository: SyncRepository = new MemorySyncRepository(),
) {
  const teachers: TeacherRepository = {
    getOrCreateProfile: vi.fn(async (id): Promise<TeacherProfile> => ({
      id,
      role: "teacher",
      plan: "default",
      school_id: null,
    })),
  };
  const sync = syncRepository;
  return {
    app: createApp({ config, teachers, sync, authenticate }),
    sync,
    teachers,
  };
}

describe("API routes", () => {
  it("keeps health public and protects API routes", async () => {
    const { app } = makeApp();
    await request(app).get("/health").expect(200, { status: "ok" });

    const protectedApp = createApp({
      config,
      teachers: { getOrCreateProfile: vi.fn() },
      sync: new MemorySyncRepository(),
      authenticate: (_request, response) => {
        response.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "A bearer token is required",
          },
        });
      },
    });
    await request(protectedApp).get("/api/v1/me").expect(401);
  });

  it("returns a teacher profile resolved only from the authenticated identity", async () => {
    const { app, teachers } = makeApp();
    const response = await request(app).get("/api/v1/me").expect(200);
    expect(response.body.data).toEqual({
      id: teacherId,
      role: "teacher",
      plan: "default",
      school_id: null,
    });
    expect(teachers.getOrCreateProfile).toHaveBeenCalledWith(teacherId);
  });

  it("accepts, idempotently replays, conflicts and soft-deletes class changes", async () => {
    const { app } = makeApp();
    const classId = randomUUID();
    const firstChange = randomUUID();
    const create = {
      change_id: firstChange,
      base_version: 0,
      operation: "upsert" as const,
      record: { id: classId, name: "Primary 4", grade_level: "Primary 4" },
    };

    const created = await request(app)
      .post("/api/v1/sync/push")
      .send({ changes: [create] })
      .expect(200);
    expect(created.body.results[0].status).toBe("accepted");
    expect(created.body.results[0].record.version).toBe(1);

    const replay = await request(app)
      .post("/api/v1/sync/push")
      .send({ changes: [create] })
      .expect(200);
    expect(replay.body.results[0]).toMatchObject({
      change_id: firstChange,
      status: "accepted",
      replayed: true,
      record: { version: 1 },
    });

    const staleWrite = await request(app)
      .post("/api/v1/sync/push")
      .send({
        changes: [
          {
            change_id: randomUUID(),
            base_version: 0,
            operation: "upsert",
            record: { id: classId, name: "Updated Primary 4" },
          },
        ],
      })
      .expect(200);
    expect(staleWrite.body.results[0]).toMatchObject({
      status: "accepted",
      record: { version: 2, name: "Updated Primary 4" },
      conflict: { current_version: 1, losing_record: { name: "Primary 4" } },
    });

    const deleted = await request(app)
      .post("/api/v1/sync/push")
      .send({
        changes: [
          {
            change_id: randomUUID(),
            base_version: 2,
            operation: "delete",
            record: { id: classId },
          },
        ],
      })
      .expect(200);
    expect(deleted.body.results[0]).toMatchObject({
      status: "accepted",
      record: { version: 3 },
    });
    expect(deleted.body.results[0].record.deleted_at).toBeTruthy();
  });

  it("validates push batches and binds pull cursors to their teacher", async () => {
    const { app } = makeApp();
    await request(app)
      .post("/api/v1/sync/push")
      .send({ changes: [{ operation: "upsert" }] })
      .expect(400);

    const pull = await request(app).get("/api/v1/sync/pull").expect(200);
    expect(pull.body).toMatchObject({ changes: [], has_more: false });
    await request(app)
      .get(
        `/api/v1/sync/pull?cursor=${encodeURIComponent(pull.body.next_cursor)}`,
      )
      .expect(200);
    const otherOwnerCursor = encodeCursor(
      randomUUID(),
      "0",
      config.SYNC_CURSOR_SECRET,
    );
    await request(app)
      .get(`/api/v1/sync/pull?cursor=${encodeURIComponent(otherOwnerCursor)}`)
      .expect(400);
  });

  it("reports an invalid item without failing valid changes in the same batch", async () => {
    const { app } = makeApp();
    const response = await request(app)
      .post("/api/v1/sync/push")
      .send({
        changes: [
          { operation: "upsert" },
          {
            change_id: randomUUID(),
            base_version: 0,
            operation: "upsert",
            record: { id: randomUUID(), name: "Primary 2" },
          },
        ],
      })
      .expect(200);
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0]).toMatchObject({
      index: 0,
      status: "rejected",
      reason: "invalid_change",
    });
    expect(response.body.results[1].status).toBe("accepted");
  });

  it("isolates class changes between authenticated teachers", async () => {
    const sharedRepository = new MemorySyncRepository();
    const { app: firstTeacherApp } = makeApp(testAuth, sharedRepository);
    const otherTeacherId = randomUUID();
    const { app: otherTeacherApp } = makeApp(
      authenticateAs(otherTeacherId),
      sharedRepository,
    );
    const classId = randomUUID();

    await request(firstTeacherApp)
      .post("/api/v1/sync/push")
      .send({
        changes: [
          {
            change_id: randomUUID(),
            base_version: 0,
            operation: "upsert",
            record: { id: classId, name: "Private class" },
          },
        ],
      })
      .expect(200);
    const unauthorizedWrite = await request(otherTeacherApp)
      .post("/api/v1/sync/push")
      .send({
        changes: [
          {
            change_id: randomUUID(),
            base_version: 0,
            operation: "upsert",
            record: { id: classId, name: "Changed by another teacher" },
          },
        ],
      })
      .expect(200);
    expect(unauthorizedWrite.body.results[0]).toMatchObject({
      status: "rejected",
      reason: "id_conflict",
    });
    expect(unauthorizedWrite.body.results[0].record).toBeUndefined();
    await request(otherTeacherApp)
      .get("/api/v1/sync/pull")
      .expect(200)
      .expect(({ body }) => expect(body.changes).toEqual([]));
  });
});

describe("Supabase JWT verification", () => {
  let jwksServer: Server;
  let supabaseUrl: string;
  let token: string;
  let invalidAudienceToken: string;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-key";
    jwk.use = "sig";
    jwk.alg = "RS256";
    jwksServer = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) =>
      jwksServer.listen(0, "127.0.0.1", resolve),
    );
    const address = jwksServer.address();
    if (!address || typeof address === "string")
      throw new Error("JWKS test server failed to start");
    supabaseUrl = `http://127.0.0.1:${address.port}`;
    const issuer = `${supabaseUrl}/auth/v1`;
    const now = Math.floor(Date.now() / 1000);
    token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject(teacherId)
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(privateKey);
    invalidAudienceToken = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject(teacherId)
      .setIssuer(issuer)
      .setAudience("anon")
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(privateKey);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      jwksServer.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("accepts a correctly signed Supabase token and rejects an incorrect audience", async () => {
    const jwtConfig = { ...config, SUPABASE_URL: supabaseUrl };
    const securedApp = createApp({
      config: jwtConfig,
      teachers: {
        getOrCreateProfile: async (id) => ({
          id,
          role: "teacher",
          plan: "default",
          school_id: null,
        }),
      },
      sync: new MemorySyncRepository(),
    });

    await request(securedApp)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(securedApp)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${invalidAudienceToken}`)
      .expect(401);
  });
});
