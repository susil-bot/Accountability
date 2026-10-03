# Free cloud deployment — no credit card (Render + Supabase + Cloudflare Pages)

```
Browser ──► Cloudflare Pages  (web app + /api/v1 proxy, adds X-Origin-Secret)
                 ▼
           Render free web service (Docker: the API, jobs, reminders, push)
                 ▼                                   ▼
           Supabase Postgres (schema "app")    Supabase Storage (private bucket, via the API)
UptimeRobot pings /health/live every 5 min (keeps Render awake + alerts) · GitHub Actions: CI + nightly encrypted backup
```

| Service | What it runs | Free limits that matter |
|---|---|---|
| GitHub | Code, CI, nightly backup | Private repos and Actions minutes are free |
| Render (Free) | API container | 512 MB RAM, 750 instance hours/month (enough for one service 24/7). **Sleeps after 15 min without traffic** — the UptimeRobot ping prevents it |
| Supabase (Free) | Postgres + photo storage | 500 MB database, 1 GB files, 5 GB egress; pauses after 7 days without activity (the API's scheduler keeps it active) |
| Cloudflare Pages | Web app + proxy | Static requests unlimited; the proxy function counts toward 100,000 requests/day |
| UptimeRobot (Free) | Keep-alive + alerts | 5-minute checks |

None of these need a card. When the app grows, the first upgrade worth paying for is Render Starter (no sleeping).

## 1. GitHub — put the code online (10 min)
1. Create a free account at github.com and a **private** repository named `accountability` (no README).
2. On your Mac:
   ```bash
   cd ~/Documents/accountability
   git init -b main && git add . && git commit -m "Initial release"
   git remote add origin https://github.com/<your-username>/accountability.git
   git push -u origin main          # sign in when asked
   ```
   `.gitignore` already keeps `.env`, `deploy/.env.production` and `node_modules` out of git.

## 2. Supabase — database and photo storage (10 min)
1. supabase.com → **Sign in with GitHub** → **New project**: name `accountability`, generate a strong database password (save it), region **Southeast Asia (Singapore)**.
2. **Project Settings → Data API** → turn **off** "Enable Data API" (the app doesn't use it; this closes Supabase's automatic REST access).
3. **Connect** (top bar) → **Session pooler** → copy the URI, put your password in place of `[YOUR-PASSWORD]`, and add `?schema=app&sslmode=require&connection_limit=5` at the end. This is your **DATABASE_URL**.
4. **Storage → New bucket** → name `evidence`, **Public bucket: off**.
5. **Project Settings → Storage → S3 Connection** → enable, copy the **Endpoint** and **Region**, then **New access key** → copy the **Access key ID** and **Secret access key**.

## 3. Cloudflare Pages project and app secrets (5 min, on your Mac)
```bash
npx wrangler@4 login
npx wrangler@4 pages project create accountability --production-branch main
# note the address it prints, e.g. https://accountability.pages.dev
./deploy/make-env.sh --cloud
```
It asks for that address, your Render address (keep the default unless Render gives you another name) and your email, then prints the values for Render.

## 4. Render — the API (15 min, mostly waiting)
1. render.com → **Sign in with GitHub** → **New → Blueprint** → choose the `accountability` repository. Render reads `render.yaml`.
2. Fill in the values it asks for:
   | Key | Value |
   |---|---|
   | DATABASE_URL | from step 2.3 |
   | APP_URL, ORIGIN_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT | printed by `make-env.sh --cloud` |
   | S3_ENDPOINT, S3_REGION, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY | from step 2.5 |
3. **Apply**. The first build takes 5–10 minutes. In **Logs** you should see `migrations_done` then `api_started`.
4. Open `https://<your-service>.onrender.com/health` → `{"status":"ok",…}`. If Render named the service differently, update `API_HOST` in `deploy/.env.production`.

## 5. Publish the web app (3 min)
```bash
./deploy/deploy-web.sh accountability
```
Then open your `pages.dev` address.

## 6. First admin (2 min)
```bash
./deploy/admin-remote.sh you@example.com "Your Name"     # asks for DATABASE_URL and a password
```
Sign in → **Admin → Mentors → Invite mentor**.

## 7. Keep-alive, alerts and backups (10 min)
* **UptimeRobot** (free): add an HTTP monitor for `https://<your-service>.onrender.com/health/live` every **5 minutes** (keeps the server awake), and a keyword monitor for `"status":"ok"` on `/health` (alerts you if the database or scheduler has a problem).
* **GitHub → Settings → Secrets and variables → Actions**: add `DATABASE_URL` (same as Render) and `BACKUP_PASSPHRASE` (a long random string — store it in your password manager). Then **Actions → nightly-backup → Run workflow** once to check it. Backups are encrypted and kept 14 days.

## Everyday operations
| Task | How |
|---|---|
| Deploy API changes | `git push` — Render rebuilds automatically, applies migrations on start, and switches over when healthy |
| Deploy web changes | `./deploy/deploy-web.sh` |
| Logs | Render → service → Logs |
| Roll back the API | Render → service → Events → pick an earlier deploy → **Rollback** (migrations are forward-only) |
| Restore a backup | see the comment at the top of `.github/workflows/backup.yml` |
| Rotate the origin secret | `./deploy/make-env.sh --cloud` again (delete the old file first), update ORIGIN_SECRET in Render, then `./deploy/deploy-web.sh` |

Self-hosting on one VM instead (Oracle, any VPS): see [deployment.md](deployment.md).
