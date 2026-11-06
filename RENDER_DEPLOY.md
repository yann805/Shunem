# Deploy Shunem Backend to Render — Step-by-Step

Follow these steps in order. Do not paste secrets into this file.

Project path:
```
/home/yann/SHUNEM/shunem-backend/shunem_backend
```

Already prepared:
- `.env` cleaned (valid `GOOGLE_CLIENT_ID`, no duplicates, Firebase email fixed)
- `Dockerfile` and `.dockerignore` added
- `render.yaml` added
- `prisma validate` and `npm run build` pass

Only `DATABASE_URL` is still missing.

---

## Step 1 — Get the Supabase `DATABASE_URL`

1. Open your Supabase project: https://supabase.com/dashboard/project/fjavhinqcfpihmqzqdob
2. Go to **Project Settings -> Database**.
3. Under **Connection string**, select **URI** and choose **Session pooler** (port `5432`).
   - Use Session pooler because Render runs a long-lived Node process.
4. Replace `[YOUR-PASSWORD]` with your database password.
   - If the password contains special characters, URL-encode them:
     `@` -> `%40`, `#` -> `%23`, `%` -> `%25`, `/` -> `%2F`, `?` -> `%3F`.
   - If you forgot the password: **Database -> Reset database password** first, then copy the new URI.
5. The final string looks like:
   ```dotenv
   DATABASE_URL=postgresql://postgres.fjavhinqcfpihmqzqdob:YOUR_PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```

## Step 2 — Put it in the backend `.env`

Open:
```
/home/yann/SHUNEM/shunem-backend/shunem_backend/.env
```

Replace the placeholder line:
```dotenv
DATABASE_URL=postgresql://postgres.fjavhinqcfpihmqzqdob:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

with your real URI. Save the file.

Verify it loads:
```bash
cd /home/yann/SHUNEM/shunem-backend/shunem_backend
node -e "require('dotenv').config(); const u=new URL(process.env.DATABASE_URL); console.log('DB host:',u.host,'| user:',u.username)"
```
You should see a `pooler.supabase.com` host and `postgres.<ref>` user.

## Step 3 — Create the database schema and RLS

Run from the project folder:
```bash
cd /home/yann/SHUNEM/shunem-backend/shunem_backend
npx prisma db push
```

Then apply RLS:
```bash
npx prisma db execute --file sql/rls.sql --schema prisma/schema.prisma
```

If `db execute` fails, open **Supabase -> SQL Editor**, paste the contents of
`sql/rls.sql`, and run it.

### Create the first Super Admin

In **Supabase -> SQL Editor**, run:
```sql
insert into users (id, email, role, permissions, phone, city, language)
values (
  gen_random_uuid(),
  'you@shunem.cm',
  'super_admin',
  '{}',
  '+237600000000',
  'Douala',
  'en'
);
```
Change email/phone/city to your real values. Use the same email you will sign in
with via Google (the auth flow upserts by email and adopts this role).

### Verify schema

In Supabase **Table Editor**, confirm tables exist: `users`, `properties`,
`bookings`, `payments`, `notifications`, etc.

## Step 4 — Initialize Git and push to GitHub

Render deploys from a Git repository.

1. Create a new repository on https://github.com/new (private is fine).
   Do not initialize it with a README.
2. In the project folder:
   ```bash
   cd /home/yann/SHUNEM/shunem-backend/shunem_backend
   git init
   git add .
   git status   # confirm .env and *firebase-adminsdk*.json are NOT listed
   git commit -m "chore: deployable Shunem backend"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. If `git status` shows `.env` or the Firebase service-account JSON, stop and
   remove it from staging before committing:
   ```bash
   git rm --cached .env
   git rm --cached shunem-*-firebase-adminsdk-*.json
   ```
   `.gitignore` already covers these patterns.

## Step 5 — Deploy on Render

1. Create an account at https://render.com and connect your GitHub.
2. Dashboard -> **New +** -> **Blueprint**.
3. Select the repository you just pushed. Render will detect `render.yaml`.
4. Apply the blueprint. Render creates a Docker web service named `shunem-api`.
5. When prompted, fill the environment variables marked `sync: false`. Copy the
   values from your local `.env`:
   - `DATABASE_URL`
   - `GOOGLE_CLIENT_ID`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Deploy. Wait for the build to finish.

Render notes:
- Free tier sleeps after inactivity; the first request may take ~30-60s.
- Render supplies `PORT` automatically; the app reads it (`src/main.ts:51`).
- The health check is `/api/v1/properties`.

## Step 6 — Verify the deployment

Replace `<service>` with your Render URL, e.g.
`https://shunem-api.onrender.com`.

```bash
curl https://<service>.onrender.com/api/v1/properties
curl -I https://<service>.onrender.com/docs
```

Expected:
- `/api/v1/properties` returns `200` with a JSON list (empty is fine).
- `/docs` returns `200` and shows Swagger.
- `POST /api/v1/auth/google` accepts a real Google ID token and returns
  `{ access_token, refresh_token, user }`.

Check Render logs for:
```
Shunem API running on http://localhost:<port>/api/v1
```

## Step 7 — Update production settings

1. **CORS**: once the Flutter Web admin is deployed, update `CORS_ORIGIN` in
   Render to include its origin, then redeploy:
   ```dotenv
   CORS_ORIGIN=https://admin.shunem.cm,http://localhost:3000
   ```
2. **Domain**: Render -> Settings -> Custom Domain, add e.g. `api.shunem.cm`.
   Then update DNS as Render instructs.
3. **Payments** (later): add `MTN_MOMO_*`, `ORANGE_MONEY_*`, and
   `PAYMENT_CALLBACK_URL=https://api.shunem.cm/payments/webhook`.
   Note the webhook path is **`/payments/webhook`**, not
   `/api/v1/payments/webhook` (see `src/main.ts:39`).
4. **Firebase** (later, after FCM is implemented): add `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

---

## What to give the Flutter app after this

```bash
flutter run \
  --dart-define=API_BASE_URL=https://<service>.onrender.com/api/v1 \
  --dart-define=SUPABASE_URL=https://fjavhinqcfpihmqzqdob.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<publishable-key> \
  --dart-define=GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

Never put `DATABASE_URL`, JWT secrets, `SUPABASE_SERVICE_ROLE_KEY`, or payment
secrets in the Flutter app.

---

## Troubleshooting

- **`prisma db push` P1001 / can't reach database**: you used the direct host
  but your network is IPv4-only. Use the **Session pooler** URI instead.
- **P1000 authentication failed**: wrong or unencoded DB password. Reset it in
  Supabase and re-copy the URI.
- **Render health check fails**: open Render logs. Usually a bad/missing
  `DATABASE_URL`, or the app is binding to the wrong port. Do not set `PORT`
  manually in Render; Render injects it.
- **`/api/v1/properties` returns 500**: schema not pushed. Run Step 3.
- **Google login fails**: `GOOGLE_CLIENT_ID` must be the **Web** client ID and
  must match the `serverClientId` used by Flutter.
- **CORS error on Flutter Web**: add the web origin to `CORS_ORIGIN` and
  redeploy.
