# Deployment runbook: single VM (Cloudflare Pages + Oracle Always Free or any Docker host)

> No credit card? Use [deployment-free.md](deployment-free.md) (Render + Supabase) instead.

```
Browser ──► Cloudflare Pages (static web app + /api/v1 proxy function)
                 │  adds X-Origin-Secret + client IP
                 ▼
        Oracle VM :443  Caddy (Let's Encrypt TLS) ──► API (NestJS) ──► Postgres 16
                                                       └─ jobs, reminders, push      └─ nightly backups
```

* Only ports 80/443 are open on the VM. The API answers **only** requests carrying the Pages proxy's secret (everything else gets 404); `/health` stays open for uptime checks.
* Without a domain, the API uses a free `sslip.io` name for the VM's IP (e.g. `141-147-1-2.sslip.io`) and the web app uses `*.pages.dev`. With a domain later, change `API_HOST`/`APP_URL` and redeploy.
* Uploaded photos are stored on the VM (`STORAGE_DRIVER=local`) and included in the nightly backup. Switching to R2 later only needs env vars.

## First deployment (about 45 minutes)

### 1. Create the server (Oracle Cloud, you)
1. Sign up at cloud.oracle.com (Always Free; a card is used for verification only). Pick a home region close to your users (e.g. Mumbai or Hyderabad).
2. **Compute → Instances → Create instance**: image **Ubuntu 24.04**, shape **VM.Standard.A1.Flex** (Ampere ARM) with **2 OCPU / 12 GB** (free up to 4/24). Add your SSH public key (or let Oracle generate one and download it).
3. **Networking → the instance's subnet → Security list → Add ingress rules**: TCP **80** and **443** from `0.0.0.0/0`.
4. Note the instance's **public IP**.

### 2. Create the Pages project and secrets (your Mac)
```bash
cd ~/Documents/accountability
npm install
npx wrangler@4 login                                             # browser login to Cloudflare
npx wrangler@4 pages project create accountability --production-branch main
# → note the URL it prints, e.g. https://accountability.pages.dev (or accountability-xyz.pages.dev)
./deploy/make-env.sh                                              # asks for that URL, the VM IP and your email
```
`make-env.sh` writes `deploy/.env.production` with strong random secrets (database, JWT, storage signing, origin lock) and Web Push keys. Keep a copy in your password manager; never commit it.

### 3. Prepare the server and deploy the API
```bash
scp -i ~/.ssh/<key> deploy/setup-vm.sh ubuntu@<ip>:~
ssh -i ~/.ssh/<key> ubuntu@<ip> 'bash setup-vm.sh'               # Docker, firewall, updates, swap
./deploy/push.sh ubuntu@<ip> ~/.ssh/<key>                        # copy code → build → migrate → start → health check
```
Check: `curl https://<ip-with-dashes>.sslip.io/health` → `{"status":"ok",…}` (the first certificate can take a minute).

### 4. Publish the web app
```bash
./deploy/deploy-web.sh accountability
```
Sets the Pages secrets `API_ORIGIN` and `ORIGIN_SECRET`, builds and uploads. Open the printed URL.

### 5. Create the first admin
```bash
ssh -i ~/.ssh/<key> ubuntu@<ip> 'bash ~/accountability/deploy/admin.sh you@example.com "Your Name"'
```
Sign in at `/login` → **Admin → Mentors → Invite mentor**.

### 6. Uptime monitoring (recommended)
Create a free monitor at uptimerobot.com (or Better Stack) on `https://<api-host>/health` and on the web URL, alerting your email/phone.

## Routine operations

| Task | Command |
|---|---|
| Deploy a new API version | `./deploy/push.sh ubuntu@<ip> <key>` (builds a new image, applies migrations, health-checks) |
| Deploy the web app | `./deploy/deploy-web.sh` |
| Logs | `ssh … 'cd accountability/deploy && docker compose -f docker-compose.prod.yml logs -f --tail 100 api'` |
| Status | `ssh … 'cd accountability/deploy && docker compose -f docker-compose.prod.yml ps'` |
| Backups | Nightly at 03:15 UTC into the `backups` volume (14 days), plus to R2 if `BACKUP_BUCKET` is set. Run now: `docker compose … exec backup backup.sh` |
| Restore | `docker compose … stop api && docker compose … exec backup restore.sh /backups/db-<stamp>.dump && docker compose … start api` |
| Rollback the API | `docker images accountability-api` → `RELEASE=<previous tag> docker compose … up -d api` (migrations are forward-only; a rollback must be compatible with the current schema) |
| Rotate the origin secret | edit `ORIGIN_SECRET` in `deploy/.env.production`, `push.sh`, then `deploy-web.sh` |

## Pre-flight checklist (every release)

- [ ] `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build` green; E2E green
- [ ] New migrations reviewed (forward-only, no destructive change without a manual step)
- [ ] A fresh backup exists (`ls` the backups volume) before deploying a migration
- [ ] After deploy: `/health` is `ok`, sign-in works, the mentor board loads, a check-in submits
- [ ] Rollback trigger: `/health` degraded for > 5 minutes, or error rate visibly up in logs → roll back the API image

## Optional upgrades
* **Own domain**: add it to Cloudflare, attach it to the Pages project, set `APP_URL`, and either point `api.<domain>` at the VM (set `API_HOST`) or switch to a Cloudflare Tunnel (no open ports).
* **R2 for photos and off-site backups**: create buckets + an R2 API token, set `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `BACKUP_BUCKET`, add a CORS rule on the photo bucket (origin = `APP_URL`, methods PUT/GET, header Content-Type), then `push.sh`.
* **GitHub**: push the repo to get CI (lint, tests, E2E, image build) on every change.
