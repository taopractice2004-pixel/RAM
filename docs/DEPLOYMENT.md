# Deploying the RAM System (free tier)

Goal: a permanent public HTTPS link a colleague can open in any browser, with no
installation on their side and nothing running on your machine.

| Piece | Host | Cost | Card required |
|---|---|---|---|
| Postgres | [Neon](https://neon.tech) | Free, no expiry | No |
| Backend API | [Render](https://render.com) Web Service (Docker) | Free | No |
| Frontend SPA | Render Static Site | Free | No |

> Render's own free Postgres is **deleted after 30 days**, which is why the
> database lives on Neon instead. `render.yaml` deliberately does not define one.

---

## 1. Push the branch

Render deploys from GitHub, not from your local disk.

```bash
git push -u origin deploy-branch
```

## 2. Create the database (Neon)

1. Sign up at neon.tech and create a project (any name, any region).
2. On the project dashboard, copy the connection string. **Choose the direct /
   unpooled one**, not the pooled one — it looks like:
   ```
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   The backend is a single long-running process with its own Prisma connection
   pool, so it does not need Neon's PgBouncer layer. The pooled string would also
   break `prisma migrate deploy`.
3. Keep this string handy for the next two steps.

## 3. Deploy both services (Render)

1. Sign up at render.com and connect your GitHub account.
2. **New → Blueprint**, pick this repo, and set the branch to **`deploy-branch`**.
   Render reads `render.yaml` and proposes `ram-backend` and `ram-frontend`.
3. It will prompt for the values marked `sync: false`:
   - `DATABASE_URL` → the Neon string from step 2.
   - `VITE_API_URL` → leave blank for now (you don't know the backend URL yet).
   `JWT_SECRET` is generated automatically — do not reuse the dev value.
4. Apply. The backend builds from `backend/Dockerfile` and, on boot, runs
   `npx prisma migrate deploy`, creating all tables in Neon.
5. When the backend is live, copy its URL from the Render dashboard — usually
   `https://ram-backend.onrender.com`, with a random suffix if that name is taken.

## 4. Point the frontend at the backend

Vite inlines `VITE_API_URL` into the JS bundle **at build time**, so this must be
set before the frontend build, and the frontend must be rebuilt if it changes.

1. Render dashboard → `ram-frontend` → Environment.
2. Set `VITE_API_URL` to the backend URL from step 3 **plus `/api`**:
   ```
   https://ram-backend.onrender.com/api
   ```
3. Manual Deploy → Deploy latest commit.

To confirm it took effect, the built bundle should contain the URL:
```bash
grep -o "https://ram-backend.onrender.com/api" frontend/dist/assets/index-*.js
```

## 5. Seed the demo data (one time, from your laptop)

The tables exist but are empty. This is the only step that runs locally, and only
once — afterwards your machine is not involved.

```bash
cd backend
npm install
```

PowerShell:
```powershell
$env:DATABASE_URL="<neon connection string>"; npm run seed
```

Bash:
```bash
DATABASE_URL="<neon connection string>" npm run seed
```

This creates 3 portfolios, 8 users, 12 resources and 4 projects.

## 6. Share

Send the **frontend** URL (`https://ram-frontend.onrender.com`) plus a login from
the table in `README.md` — password for all seeded accounts is `Password123!`:

| Email | Role |
|---|---|
| admin@ram.com | ADMIN — full access |
| rmg@ram.com | RMG |
| delivery.fin@ram.com | DELIVERY (Financial Services only) |
| hr@ram.com | HR |

They need no installation. Any browser, any network.

---

## Known limitations of the free tier

**Cold starts.** Render free web services sleep after ~15 minutes without
traffic. The first request after an idle period takes **roughly 50 seconds**
while the backend wakes up; the login page (a static site) loads instantly, so
it looks like the login button is hanging. Warn your colleague, or open the app
yourself a minute before they start.

**Background jobs pause while asleep.** `backend/src/jobs/scheduler.ts` registers
 allocation transitions and bench-aging alerts every 15 minutes. These do not run
 while the service is sleeping. Date-driven state changes catch up
on the first tick after the service wakes. If a demo needs them on demand, add an
admin-triggered endpoint that calls `processAllocationTransitions()` directly.

**Neon autosuspend.** The free database suspends after ~5 minutes idle and
resumes in well under a second. Not noticeable in practice.

---

## What changed for deployment, and why local dev is unaffected

- **`render.yaml`** (new) — blueprint for both services.
- **`backend/Dockerfile`** — includes demo data files used by local development. Resource imports are uploaded through the Admin interface; no scheduled resource sheet import is required.
- **`backend/data/`** (new) — copies of the demo CSVs, needed because the Docker
  build context is `./backend` and the originals sit at the repo root.

Local development is unchanged. `docker-compose.yml` mounts `./data` over
`/app/data` for demo fixtures, and the frontend still builds with
`VITE_API_URL=/api` behind the nginx proxy:

```bash
docker compose up -d --build
docker compose exec backend npm run seed
```

Note that `backend/data/` and the root `data/` are now separate copies. If you
change a demo CSV that the deployed app should see, update both.
