# API

Base path `/api/v1` (health is at `/health`). Interactive OpenAPI docs: `http://localhost:4000/docs` (disabled in production unless `SWAGGER_ENABLED=true`).

**Auth:** session cookie `acc_session` set by `/auth/register` and `/auth/login`. Browser mutations must send `X-Requested-With: accountability-web`.

**Envelope:** `{ "success": true, "data": … }` or `{ "success": false, "error": { "code": "TASK_NOT_FOUND", "message": "Task could not be found.", "details"?: […] } }`.

| Method & path | Purpose |
|---|---|
| `POST /auth/register` | `{name,email,password,timezone}` → sets cookie |
| `POST /auth/login` · `POST /auth/logout` · `POST /auth/logout-all` · `GET /auth/me` | session |
| `PATCH /users/me` · `POST /users/me/onboarded` | name, timezone, checkInTime, restDays |
| `GET /dashboard` | aggregated dashboard (also performs lazy catch-up) |
| `GET /goals?status=` · `POST /goals` · `GET/PATCH/DELETE /goals/:id` | goal CRUD; `POST /goals` accepts `commitments[]`, `checkInTime`, `progressCommitmentIndex`, `activate` |
| `POST /goals/:id/activate · /pause · /resume · /complete` | lifecycle; complete requires `{confirm:true}` |
| `GET/POST /goals/:goalId/commitments` · `PATCH/DELETE /commitments/:id` · `POST /commitments/:id/pause · /resume` | commitments (returns `warnings[]`) |
| `GET /tasks/today` · `GET /tasks?date=YYYY-MM-DD` · `GET /task-occurrences/:id` | occurrences |
| `PATCH /task-occurrences/:id` `{actualValue}` | record progress |
| `POST /task-occurrences/:id/complete · /partial · /miss · /reset` | status changes |
| `GET /checkins/today` · `POST /checkins` · `GET /checkins/history` | check-in (one per date; resubmission updates it) |
| `POST /evidence/uploads` `{taskOccurrenceId, contentType, size, thumbnailContentType?, thumbnailSize?}` | signed upload URL(s); the browser PUTs bytes straight to storage |
| `POST /evidence` `{taskOccurrenceId, type: IMAGE|FILE, uploadKey, thumbnailKey?}` or `{type: URL|TEXT, url?, description}` | confirm an upload (size + magic bytes verified) or add link/note |
| `GET /task-occurrences/:id/evidence` · `DELETE /evidence/:id` | list (with signed view URLs) / soft delete |
| `GET /analytics/today · /week?date= · /month?month=YYYY-MM · /day/:date · /goal/:goalId` | deterministic analytics |
| `GET /notifications` · `PATCH /notifications/:id/read` · `POST /notifications/read-all` · `GET/PATCH /notification-preferences` | notifications |
| `GET /auth/invite?token=` · `POST /auth/accept-invite` `{token,password,timezone,name?}` | mentor invite preview / accept (public, rate-limited; sets cookie) |
| `GET /push/public-key` · `POST /me/push-subscriptions` · `DELETE /me/push-subscriptions` | Web Push (any role) |
| **Client (USER)** | |
| `GET /me/mentors` · `POST /me/mentor/choose` `{mentorId, message?}` | mentor directory (best match first, spots left) · choose or switch mentor (starts ACTIVE immediately) |
| `GET /me/mentor` · `POST /me/mentor/accept · /decline · /stop` · `PUT /me/mentor/whatsapp` `{optIn, phone?}` | consent, stop sharing, WhatsApp opt-in |
| `GET /me/mentor-updates` · `GET /me/sessions` · `GET /me/actions` · `PATCH /me/actions/:id` `{status}` | shared summaries/reports/messages, upcoming calls, own action items |
| **Mentor (MENTOR; ADMIN read access)** — every per-client route requires an ACTIVE assignment | |
| `GET/PATCH /mentor/profile` `{headline?, bio?, focusAreas?, languages?, acceptingClients?}` | the mentor's directory profile (MENTOR) |
| `GET /mentor/clients` (board, MENTOR) · `GET /mentor/my-day` (MENTOR) | board with status rules · today's work |
| `GET /mentor/clients/:id` · `/day/:date` · `/week?date=` · `/timeline?before=` · `PUT /mentor/clients/:id/reviewed` `{reviewed}` | client page (read-only) |
| `GET/POST /mentor/clients/:id/notes?q=&tag=&archived=` · `GET/PATCH /mentor/notes/:id` · `GET /mentor/notes/:id/history` · `PUT /mentor/notes/:id/pin · /archive` | notes (author-only edits, versioned) |
| `GET/POST /mentor/clients/:id/actions` · `PATCH /mentor/actions/:id` | action items |
| `GET/POST /mentor/sessions?from=&to=&clientId=` · `GET/PATCH /mentor/sessions/:id` · `GET /mentor/sessions/:id/note` | sessions (weekly repeat, reminders 5/15/60 min) |
| `GET /mentor/prep?sessionId=|clientId=` | prep sheet with rule-based talking points |
| `GET /mentor/nudge-templates` · `GET/POST /mentor/clients/:id/nudges` · `GET/POST /mentor/clients/:id/rules` · `PATCH /mentor/rules/:id` · `GET /mentor/clients/:id/whatsapp-link?text=` | nudges (3/day, quiet 22:00–07:00 client time) and automatic rules |
| `GET /mentor/clients/:id/reports` · `POST …/reports/refresh` `{weekStart}` · `PATCH /mentor/reports/:id` `{mentorComment?, share?}` | weekly reports |
| **Admin (ADMIN)** | |
| `GET /admin/overview` · `GET /admin/mentors` · `GET /admin/mentors/:id/activity` · `PATCH /admin/mentors/:id/capacity` | programme overview, mentor load and activity |
| `POST /admin/mentors/invite` · `GET /admin/invites` · `POST /admin/invites/:id/revoke` | invite-only mentor accounts |
| `GET /admin/clients?filter=all|unassigned|pending|attention&q=` · `GET /admin/clients/:id/assignments` | clients and assignment history |
| `POST /admin/assignments` `{clientId, mentorId, note?, overrideCapacity?}` · `POST /admin/assignments/:id/end` | assign / reassign / unassign |
| `POST /admin/users/:id/active` `{active}` · `GET /admin/audit?userId=&actorId=&action=&before=` · `GET /admin/people` | deactivate (signs out everywhere), audit log |
| `GET /health` | `{status, database, jobs, lastTickAt, deadJobs}` (503 if the DB is down or the scheduler stopped ticking) |

Deviation from the spec’s path list: evidence for an occurrence is `GET /task-occurrences/:id/evidence` (evidence attaches to an occurrence, not a recurring task); goal `activate`/`resume` and task `reset`/`logout-all` were added.

## Common error codes

`VALIDATION_ERROR`, `UNAUTHENTICATED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`, `EMAIL_IN_USE`, `CSRF_REJECTED`, `RATE_LIMITED`, `*_NOT_FOUND`, `GOAL_READ_ONLY`, `INVALID_GOAL_TRANSITION`, `PLAN_LIMIT_REACHED`, `INVALID_RECURRENCE`, `INVALID_PARTIAL`, `INVALID_COMPLETION`, `OCCURRENCE_LOCKED`, `OCCURRENCE_SKIPPED`, `CHECKIN_CLOSED`, `INVALID_CHECKIN_ITEM`, `INVALID_FILE`, `UPLOAD_NOT_FOUND`, `UPLOAD_INCOMPLETE`, `EVIDENCE_LIMIT`, `STORAGE_QUOTA`, `PAYLOAD_TOO_LARGE`, `LINK_EXPIRED`, `FORBIDDEN`, `INVITE_INVALID`, `ALREADY_ASSIGNED`, `ASSIGNMENT_CONFLICT`, `MENTOR_AT_CAPACITY`, `ASSIGNMENT_ALREADY_ENDED`, `NOTE_EMPTY`, `NOTE_CHANGED`, `SESSION_NOTE_EXISTS`, `SESSION_IN_PAST`, `SESSION_CLOSED`, `QUIET_HOURS`, `NUDGE_LIMIT`, `NUDGE_TOO_LONG`, `TOO_MANY_RULES`, `INVALID_RULE`, `PHONE_REQUIRED`, `CANNOT_DEACTIVATE_SELF`, `MENTOR_NOT_ACCEPTING`.

Every error body also carries `requestId` (same as the `X-Request-Id` response header) for support and log lookup.
