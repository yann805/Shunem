# Shunem Backend — Environment, Deployment & Frontend Handoff Guide

This guide walks through obtaining every `.env` value, applying the database,
deploying the NestJS backend, and then building/connecting the Flutter frontend.

Current repo status:
- `npm run build` passes (`nest build` -> `dist/`).
- `.env` still contains placeholders for all secrets.
- There are **no migration files** in `prisma/` yet — only `prisma/schema.prisma`.

---

## 0. Priority: what actually blocks deployment

| Variable | Needed for backend deploy? | Used by |
|---|---|---|
| `DATABASE_URL` | **Yes** | Prisma (`prisma/schema.prisma`) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **Yes** | `src/auth/auth.module.ts`, guards |
| `GOOGLE_CLIENT_ID` | **Yes** (login) | `src/auth/auth.service.ts` |
| `NODE_ENV`, `PORT`, `CORS_ORIGIN` | **Yes** | `src/main.ts` |
| `SERVICE_FEE_PERCENT` | Yes (booking fees) | `src/bookings/bookings.service.ts:27` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | No (backend does not read them) | Flutter app |
| `SUPABASE_SERVICE_ROLE_KEY` | No (not used yet) | reserved for server-side storage/notifications |
| `MTN_MOMO_*`, `ORANGE_MONEY_*`, `PAYMENT_CALLBACK_URL` | No, can deploy without | payments no-op when blank (`payments.service.ts:153,181`) |
| `FIREBASE_*` | No, not implemented | reserved (comment only in `notifications.service.ts:38`) |

Minimum to boot + login:
`DATABASE_URL`, both JWT secrets, `GOOGLE_CLIENT_ID`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`.

---

## Step 1 — Supabase: `DATABASE_URL`, `SUPABASE_*`

1. Go to https://supabase.com -> **New project**. Choose a region near Cameroon
   (e.g. `eu-central-1` / `eu-west-3`). Save the database password.
2. **Project Settings -> API**:
   - `SUPABASE_URL` = **Project URL** (`https://<project-ref>.supabase.co`)
   - `SUPABASE_ANON_KEY` = **anon / public** key (legacy JWT `eyJ...`)
   - `SUPABASE_SERVICE_ROLE_KEY` = **service_role** key — server-only, never ship
     it to Flutter.
3. **Project Settings -> Database -> Connection string -> URI**:
   - Long-running Node host (Render/Railway/VM): use **Session pooler** (port
     `5432`) or **Direct**.
   - Serverless (Vercel/Netlify functions): use **Transaction pooler** (port
     `6543`) and append `?pgbouncer=true&connection_limit=1`.
   - Username is `postgres.<project-ref>`, not `postgres`.
   - URL-encode special characters in the password (`@` -> `%40`, etc.).
   - Add `?sslmode=require` if not already present.
4. **Enable Realtime**: Database -> Replication -> enable for the `notifications`
   table (the Flutter app subscribes to it).
5. **Storage**: create a bucket for property media/documents (e.g.
   `property-media`) and set policies (public read or signed URLs).
6. Create the schema. Since there are no migrations yet, use `db push` the first
   time:
   ```bash
   cd shunem_backend
   npx prisma generate
   npx prisma db push      # use a direct/session connection URL, not 6543
   ```
   Then apply RLS. Easiest via Supabase **SQL Editor**: paste `sql/rls.sql`. Or:
   ```bash
   psql "$DATABASE_URL" -f sql/rls.sql
   ```
7. Create the first Super Admin (there is no public admin signup). In Supabase SQL
   Editor:
   ```sql
   insert into users (id, email, role, permissions)
   values (gen_random_uuid(), 'you@shunem.cm', 'super_admin', '{}');
   ```

---

## Step 2 — Google OAuth: `GOOGLE_CLIENT_ID`

1. https://console.cloud.google.com -> create/select a project.
2. **APIs & Services -> OAuth consent screen**: External, fill app name/support
   email, add scopes `email`, `profile`, `openid`. Add test users while in
   testing mode.
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**:
   - Create a **Web application** client. Copy its Client ID -> this is
     `GOOGLE_CLIENT_ID`.
   - Create an **Android** client (package name, e.g. `cm.shunem.app`, plus
     release SHA-1/SHA-256) and an **iOS** client (bundle ID) for the Flutter app.
4. In Flutter, pass the **Web** client ID as `serverClientId` to `google_sign_in`.
   The ID token audience must equal `GOOGLE_CLIENT_ID`, because the backend
   verifies a single audience (`auth.service.ts:69`).
5. No client secret is needed by this backend.

Get the production Android fingerprint:
```bash
keytool -list -v -keystore ~/upload-keystore.jks -alias upload
```

---

## Step 3 — JWT secrets

Generate two independent 64-byte secrets:
```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
```
Keep `JWT_ACCESS_TTL=15m` and `JWT_REFRESH_TTL=30d`.

---

## Step 4 — Mobile Money (optional for first deploy)

Leaving these blank is safe: `initiate()` still creates a payment row and skips
provider calls (`payments.service.ts:153,181`).

### MTN MoMo

1. Register at https://momodeveloper.mtn.com -> subscribe to the **Collections**
   product -> copy the **Subscription Key** (`MTN_MOMO_SUBSCRIPTION_KEY`).
2. Create an API user against sandbox:
   ```bash
   UUID=$(uuidgen)
   curl -X POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser \
     -H "X-Reference-Id: $UUID" \
     -H "Ocp-Apim-Subscription-Key: <SUBSCRIPTION_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"providerCallbackHost":"api.shunem.cm"}'

   curl -X POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/$UUID/apikey \
     -H "Ocp-Apim-Subscription-Key: <SUBSCRIPTION_KEY>"
   ```
   - `MTN_MOMO_API_USER` = `$UUID`
   - `MTN_MOMO_API_KEY` = key returned by the second call
   - `MTN_MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com`
     (production access is requested through MTN)
   - Note: `X-Target-Environment` is hardcoded to `mtncameroon` in
     `payments.service.ts:167`.

### Orange Money

1. https://developer.orange.com -> create app -> subscribe to **Orange Money Web
   Payment** (Cameroon) -> copy Client ID/Secret.
2. `ORANGE_MONEY_BASE_URL=https://api.orange.com`. Production requires Orange
   approval.

### Callback URL

- Set `PAYMENT_CALLBACK_URL` to the deployed public HTTPS URL. Because of
  `src/main.ts:39`, the webhook is **`/payments/webhook`**, *not*
  `/api/v1/payments/webhook` (README section 9 is inconsistent). Confirm in
  Swagger before configuring MTN/Orange dashboards.
- The handler currently trusts the payload without provider-signature
  verification. Add webhook signature/secret validation before real money goes
  live.

---

## Step 5 — Firebase (defer)

These variables are unused in code today. When FCM is implemented:

1. Firebase Console -> Project settings -> **Service accounts -> Generate new
   private key**.
2. From the JSON:
   - `project_id` -> `FIREBASE_PROJECT_ID`
   - `client_email` -> `FIREBASE_CLIENT_EMAIL`
   - `private_key` -> `FIREBASE_PRIVATE_KEY` (keep the `\n` escapes and the
     surrounding quotes)
3. Skip for now unless you are implementing push notifications.

---

## Step 6 — Deploy the backend

Pick a Node host (Render/Railway/Fly/VM). Example with **Render**:

- **Environment:** Node 20
- **Build command:** `npm install && npx prisma generate && npm run build`
- **Start command:** `node dist/main`
- **Health check path:** `/api/v1/properties`
- **Env vars** (set in the host dashboard, never upload `.env`):
  ```dotenv
  NODE_ENV=production
  PORT=4000
  CORS_ORIGIN=https://admin.shunem.cm,http://localhost:3000
  DATABASE_URL=postgresql://postgres.<ref>:<pw>@...pooler.supabase.com:5432/postgres?sslmode=require
  JWT_ACCESS_SECRET=...
  JWT_REFRESH_SECRET=...
  JWT_ACCESS_TTL=15m
  JWT_REFRESH_TTL=30d
  GOOGLE_CLIENT_ID=...apps.googleusercontent.com
  SUPABASE_URL=https://<ref>.supabase.co
  SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  SERVICE_FEE_PERCENT=3

  # payments later:
  MTN_MOMO_API_USER=
  MTN_MOMO_API_KEY=
  MTN_MOMO_SUBSCRIPTION_KEY=
  MTN_MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com
  ORANGE_MONEY_CLIENT_ID=
  ORANGE_MONEY_CLIENT_SECRET=
  ORANGE_MONEY_BASE_URL=https://api.orange.com
  PAYMENT_CALLBACK_URL=https://<your-api-domain>/payments/webhook
  ```
- **Schema on release:** run `npx prisma db push` once against the production DB
  (from your machine or a one-off job), then apply `sql/rls.sql`. Later, switch
  to committed migrations:
  ```bash
  npx prisma migrate dev --name init   # locally, creates prisma/migrations/
  # commit prisma/migrations/, then in pre-deploy:
  npx prisma migrate deploy
  ```
- **HTTPS:** terminate TLS at the platform/proxy. Helmet is already enabled.
- **Domain:** point e.g. `api.shunem.cm` at the host, then use it everywhere.

Smoke test after deploy:
```bash
curl https://api.shunem.cm/api/v1/properties
curl -I https://api.shunem.cm/docs
```
Open `/docs`, call `POST /api/v1/auth/google` with a real Google ID token (from
Flutter/logcat), and confirm you get `access_token` + `user`.

---

## Step 7 — Build the frontend and connect

Only start this once the backend URL and `/docs` are live.

```bash
flutter run \
  --dart-define=API_BASE_URL=https://api.shunem.cm/api/v1 \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key> \
  --dart-define=GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

Release builds:
```bash
flutter build appbundle --dart-define=API_BASE_URL=https://api.shunem.cm/api/v1 ...
flutter build web     --dart-define=API_BASE_URL=https://api.shunem.cm/api/v1 ...
```

Then:

1. Add the deployed Flutter **web** origin to `CORS_ORIGIN` on the backend and
   redeploy. Mobile apps do not send `Origin`, but Flutter Web does.
2. Add production Android SHA-1/SHA-256 and iOS bundle ID to the Google OAuth
   clients.
3. Log in with the email you inserted as `super_admin`; the Google flow upserts
   and adopts that role.
4. Do **not** embed `SUPABASE_SERVICE_ROLE_KEY`, JWT secrets, or payment secrets
   in the Flutter app — only `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `GOOGLE_CLIENT_ID`, and `API_BASE_URL`.

Recommended order:

**Supabase + DB -> JWT + Google -> deploy backend -> smoke test -> Flutter
production config -> CORS update -> real-device test -> payments credentials
last.**

---

## Security checklist (SRS §112-115)

- [ ] `.env` never committed (already gitignored)
- [ ] JWT secrets are strong random strings, rotated periodically
- [ ] Supabase `service_role` key is server-only (never in Flutter)
- [ ] RLS policies applied (`sql/rls.sql`)
- [ ] Rate limiting on `/auth/*` and `/properties` (SRS §111)
- [ ] HTTPS only; HSTS via helmet
- [ ] Payment webhook signature verification before production money flows
