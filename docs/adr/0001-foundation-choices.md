# ADR 0001: Foundation choices

- **Status:** Accepted
- **Context:** The first backend slice needs durable PostgreSQL storage, offline sync, and authentication compatible with Supabase.
- **Decision:** Use Prisma migrations for the relational schema, verify Supabase access tokens against the project's JWKS endpoint, and persist accepted and rejected sync receipts in PostgreSQL. Protect tenant rows with PostgreSQL RLS driven by a transaction-local teacher context. Use a single `default` teacher plan until pricing is decided.
- **Consequences:** Sync is auditable and retries are idempotent; database work must run inside a transaction that sets the authenticated teacher context. Supabase projects using legacy shared-secret JWT signing must move to asymmetric signing keys for JWKS verification.
