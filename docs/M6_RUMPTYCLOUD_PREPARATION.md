# Managed service preparation — no deployment performed

Use the existing Dockerfile's `web` and `api` targets. Worker uses the API target with command `node --import tsx apps/worker/src/index.ts`. Run `scripts/migrate.ts` once before starting the new API/worker; migrations are transactional and checksum-verified. Keep PostgreSQL private with durable storage/backups; never publish its port or credentials. Use existing credits only; verify availability and obtain deployment authorization before provisioning anything.

Services:

- Web: Next.js, managed HTTPS; API_INTERNAL_URL points to the private API service. Set this at build time because Next rewrites are built into the artifact; use Docker build argument `API_INTERNAL_URL` (local default `http://api:3001`) for provider-specific private DNS before deployment.
- API: Fastify on internal port 3001, exact HTTPS `PUBLIC_ORIGIN`, `AUTH_ALLOW_INSECURE_LOCALHOST=false`, `NEAR_NETWORK=testnet`; private PG connection. Existing host-only Secure/HttpOnly/SameSite cookies and origin/CSRF checks remain mandatory.
- Worker: independent persistent process, internal port 3002 for `/health` and `/ready`; no public ingress, signer keys or agent credentials. Reads durable intents even when new submissions are disabled. A database outage fails readiness, not liveness; RPC outage retains UNKNOWN and retries only read reconciliation.
- PostgreSQL: apply migrations through 005, restrict network to API/worker/migration job. Set `PGSSLMODE=verify-full` and, when required, mount the provider public CA and set `PGSSLROOTCERT` to its path. API, worker and migration job enforce certificate verification; do not disable certificate validation.

The local Compose worker has no published host port, drops capabilities, runs non-root and excludes `.env`, `.local`, Git metadata and credentials from the image. Existing HTTPS override and PostgreSQL named volume remain intact. Hosted service names, exact HTTPS domain, private database TLS configuration, health routing, resource quotas and temporary shutdown/backup plan remain provider-specific deployment prerequisites. This document is preparation, not a claim of a deployed or production-approved service.
