# Working on this repository (humans and AI agents)

Read `docs/engineering-rules.md` before changing code, and `docs/architecture.md` for how the system fits together.

Essentials:
- Web: every route is static (SSG); data loads client-side through `src/features/<name>/api.ts`. Routes in `src/app` stay thin.
- API: thin controllers, rules in services and `src/domain`, ownership checks on every query, transactions for multi-record writes.
- Jobs run on Postgres (no Redis). Handlers must be idempotent.
- Run before finishing: `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build`.
- Never edit a released migration; add a new one.
