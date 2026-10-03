# Engineering rules

These rules keep the codebase consistent as it grows. **Bold** rules are enforced automatically (lint, types, tests, CI); the rest are checked in review.

## Web (apps/web)

### Rendering
1. **Every route is pre-rendered (SSG). `next build` emits a static site (`output: 'export'`).** No server-side rendering, no middleware, no `cookies()`/`headers()` in pages — they break the static build.
2. Signed-in data is fetched in the browser with TanStack Query. Private, per-user pages have no SEO value; skeletons cover the first paint.
3. Dynamic ids go in the query string (`/app/goals/detail?id=…`), not in `[id]` segments, so a page can be pre-built once.
4. Components that read `useSearchParams()` are wrapped in `<Suspense>` by their route.
5. The browser only calls its own origin (`/api/v1/*`). Dev uses a Next rewrite; production uses the Cloudflare Pages Function. Never call the API host directly from the browser.

### Structure
6. **`src/app/**` = routes only.** A `page.tsx` is a server component that exports `metadata` and renders one feature component. No data fetching, no business logic. *(lint: `no-restricted-imports`)*
7. **`src/components/ui/**` = design system.** Presentational, prop-driven, accessible, no data fetching, no feature imports. *(lint)*
8. **`src/features/<name>/` owns a screen or domain:** `api.ts` (queries + mutations), components, pure model files, and an `index.ts` that is its public API. **Features import each other only through `@/features/<name>`.** *(lint)*
9. **Network access only through `src/lib/api.ts`.** *(lint: `fetch` is banned elsewhere)*
10. Query keys come from `src/lib/query-keys.ts`. A mutation invalidates every key it can make stale.
11. Pure logic (reducers, payload builders, formatting) lives in plain `.ts` files without React, so it is unit-tested directly.

### Components
12. Components take the narrowest props they need (`week`, not the whole dashboard). Over ~150 lines → split.
13. **All forms use React Hook Form + Zod**; field errors render through `<Field>` with `aria-describedby`.
14. Use the shared primitives: `Button loading`, `Segmented` (single choice), `ToggleChip` (multi-select), `ConfirmDialog`, `PageSkeleton`, `EmptyState`/`ErrorState`/`InlineAlert`. Don't hand-roll their markup.
15. Every screen has loading (skeleton), empty, error-with-retry and success states.
16. Optimistic UI only for safe, reversible state (mark-as-read). Task status shows a saving state and only changes on server confirmation (spec §50).
17. Heavy libraries load lazily (`next/dynamic`), e.g. charts.

### Accessibility (WCAG 2.2 AA)
18. Interactive elements are real `button`/`a`/`input`; custom widgets follow the WAI-ARIA pattern (radio group = roving tabindex + arrow keys). **Covered by component tests.**
19. Every icon-only control has an `aria-label`; decorative icons have `aria-hidden`.
20. Tap targets ≥ 44 px; colour is never the only signal; respect `prefers-reduced-motion`.

### Security
21. No `dangerouslySetInnerHTML`. Post-login redirects go through `safeNext()`.
22. Security headers come from `security-headers.mjs` (dev server and `out/_headers`).
23. Images are compressed and stripped of EXIF on the device before upload.

## API (apps/api)

24. **Controllers are thin:** validate the DTO (`class-validator`, whitelist + forbid unknown fields), call one service method, return.
25. Business rules live in services; pure rules live in `src/domain` (no I/O) with unit tests.
26. **Every query that touches user data is scoped by the authenticated user** (`where: { id, userId }` or a relation filter). A foreign id returns 404, never 403 — no existence leaks. **Covered by the authorization test suite.**
27. Multi-record mutations run in `prisma.tx()`; an audit log row is written in the same transaction for important actions.
28. History is immutable: never update past occurrences, completions or daily results except through the domain services.
29. Errors are thrown as `AppError(code, message, status)`; codes are stable, messages are human and non-shaming. No stack traces or SQL in responses.
30. Background work goes through the Postgres job queue. **Handlers must be idempotent** (dedupe keys, unique constraints); jobs retry with backoff and land in `DEAD` after `maxAttempts`.
31. Times are stored in UTC; "today" is always computed with the user's IANA timezone via `src/domain/dates.ts`. Never `new Date().getDate()` for business logic.
32. Files never pass through the API in production: signed upload URL → browser PUT → confirm with size + magic-byte checks on the stored object.
33. Logs are structured JSON with the request id; never log passwords, tokens, signed URLs or reflections.
34. Schema changes ship as a new Prisma migration; existing migrations are never edited once released. Destructive migrations need a manual step.

### Mentoring

34a. **Mentor/admin code reaches a client's data only through `MentorAccessService`** (`client()` for reads, `assignedMentor()` for actions). It re-checks role + ACTIVE assignment on every request; anything else is a 404.
34b. **Clients never receive private mentor data.** Client endpoints return only what is explicitly shared (summaries, shared reports, nudges, their own action items and sessions). Private reflections are redacted server-side for mentors.
34c. **Every mentor/admin write is audited**, and anything sent to a person goes through `NotificationsService.createOnce` with a deterministic dedupe key (so retries never double-send).

## Testing & CI

35. **CI runs lint → typecheck → unit (API + web) → integration (real Postgres) → build → E2E (against the static build).** All must pass to merge.
36. New domain rules get unit tests; new endpoints get an integration test including an "other user" case; new interactive components get a component test.
37. E2E covers the core loop on mobile and desktop viewports.

## Definition of done for a change

- [ ] Lint, types and all tests pass locally
- [ ] Loading, empty, error and success states handled
- [ ] Keyboard and screen-reader usable
- [ ] Ownership checks + integration test for any new endpoint
- [ ] Migration added (if schema changed) and docs updated
