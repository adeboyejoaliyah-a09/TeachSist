# Class sync protocol (v1)

The first sync slice supports the `classes` entity only. Every request is authenticated with a Supabase access token; the server derives `owner_id` from the verified JWT subject and ignores client-supplied ownership fields.

## Push changes

`POST /api/v1/sync/push`

Send 1-100 changes in outbox order. `change_id` is a client-generated UUID and idempotency key. For a new class, use `base_version: 0`; each accepted write increments the server-owned version. Timestamps, owner, and version are assigned by the server. An invalid item is reported as a per-item rejection and does not prevent later valid items in the batch from being processed. Top-level payload errors (including an empty or oversized batch) return HTTP 400.

```json
{
  "changes": [
    {
      "change_id": "4d027e20-f88f-4330-9d26-e42202b64349",
      "base_version": 0,
      "operation": "upsert",
      "record": {
        "id": "fd7f35dd-820b-468a-9605-3cb6fe4f18ce",
        "name": "Primary 4",
        "grade_level": "Primary 4"
      }
    },
    {
      "change_id": "4cf608dc-c32a-42e6-a739-69329b9c9b57",
      "base_version": 1,
      "operation": "delete",
      "record": { "id": "fd7f35dd-820b-468a-9605-3cb6fe4f18ce" }
    }
  ]
}
```

The response contains one result per change, in request order. Accepted results include the canonical record. If `base_version` is stale, the server applies the incoming change as the latest server-time write, increments the version, and includes a `conflict` object with the stale base, displaced version, and its snapshot. The sync log retains each accepted snapshot, so the displaced value remains retrievable. Rejected changes include a stable reason. Replaying a `change_id` returns its original result with `replayed: true`; rejected attempts are also recorded to prevent an idempotency key from later changing meaning.

```json
{
  "results": [
    {
      "change_id": "4d027e20-f88f-4330-9d26-e42202b64349",
      "status": "accepted",
      "record": {
        "id": "fd7f35dd-820b-468a-9605-3cb6fe4f18ce",
        "name": "Primary 4",
        "grade_level": "Primary 4",
        "version": 1,
        "created_at": "2026-11-14T10:00:00.000Z",
        "updated_at": "2026-11-14T10:00:00.000Z",
        "deleted_at": null
      }
    }
  ]
}
```

Deletes set `deleted_at`; synced rows are not hard-deleted. A later upsert can restore a tombstoned class and will receive a new version.

## Pull changes

`GET /api/v1/sync/pull?cursor=<opaque>&limit=50`

Omit the cursor for the first page. Cursors are signed and scoped to the authenticated teacher; clients must treat them as opaque. `limit` is optional, from 1 to 100. Only accepted changes appear in the pull feed; rejected outcomes are available to the originating push request. A cursor advances through the teacher's sync log, including rejected receipts, so rejected rows do not block later pages.

```json
{
  "changes": [
    {
      "change_id": "4d027e20-f88f-4330-9d26-e42202b64349",
      "entity": "classes",
      "operation": "upsert",
      "record": {
        "id": "fd7f35dd-820b-468a-9605-3cb6fe4f18ce",
        "name": "Primary 4",
        "grade_level": "Primary 4",
        "version": 1,
        "created_at": "2026-11-14T10:00:00.000Z",
        "updated_at": "2026-11-14T10:00:00.000Z",
        "deleted_at": null
      }
    }
  ],
  "next_cursor": "<opaque signed cursor>",
  "has_more": false
}
```

Clients should apply pull changes by record id and version, persist the returned cursor only after applying the page, and retain local edits until a push result is accepted or explicitly resolved. A cursor from another teacher or a modified cursor receives `400 INVALID_CURSOR`.

## Errors and ownership

Errors use `{ "error": { "code": "...", "message": "...", "details": ... } }`. Request validation errors return HTTP 400; absent or invalid tokens return 401. Cross-teacher reads and writes are blocked by transaction-scoped PostgreSQL row-level security as well as repository ownership checks. Database operations set the teacher context only from the verified token subject.

Apply migrations with `npm run db:deploy` in deployed environments. The initial `classes` protocol does not sync subjects or other tables.
