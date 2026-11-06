# Shunem — Exact Environment Setup (Backend vs Flutter)

This file tells you exactly:

1. What to collect from each dashboard.
2. Which values go in the **backend `.env`**.
3. Which values go in the **Flutter app** (`--dart-define`).
4. The correct order to do everything.

Rule of thumb:

- **Backend** gets secrets: database URL, JWT secrets, service/secret keys, payment keys.
- **Flutter** gets only public values: API URL, Supabase URL, publishable/anon key, Google Web client ID.
- **Never** put a secret (`sb_secret_...`, `service_role`, JWT secrets, DB URL) in Flutter.

---

## Quick mapping (new Supabase key names)

The Supabase dashboard may show framework-specific names. Rename them like this:

| Dashboard name | Use as | Where |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_URL` | Backend `.env` (optional now) + Flutter |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) | `SUPABASE_ANON_KEY` | Backend `.env` (optional now) + Flutter |
| Secret key (`sb_secret_...`) or legacy `service_role` | `SUPABASE_SERVICE_ROLE_KEY` | **Backend only** |

If your Flutter `supabase_flutter` version rejects `sb_publishable_...`, get the
legacy `anon` key from **Project Settings -> API Keys -> Legacy API keys** and use
that as `SUPABASE_ANON_KEY`.

---

## Variable ownership table

| Value | Backend `.env` | Flutter `--dart-define` |
|---|---|---|
| Supabase project URL | `SUPABASE_URL` — optional (backend does not read it yet) | `SUPABASE_URL` — **required** |
| Supabase publishable/anon key | `SUPABASE_ANON_KEY` — optional (not read yet) | `SUPABASE_ANON_KEY` — **required** |
| Supabase secret/service_role key | `SUPABASE_SERVICE_ROLE_KEY` — server only (not used yet) | **NEVER** |
| Postgres connection string | `DATABASE_URL` — **required** | **NEVER** |
| JWT access secret | `JWT_ACCESS_SECRET` — **required** | **NEVER** |
| JWT refresh secret | `JWT_REFRESH_SECRET` — **required** | **NEVER** |
| Google **Web** client ID | `GOOGLE_CLIENT_ID` — **required** | `GOOGLE_CLIENT_ID` — **required** |
| Google Android/iOS client IDs | not needed | platform files (see Step 4) |
| Deployed API base URL | not needed | `API_BASE_URL` — **required** |
| MTN / Orange credentials | backend only — optional now | **NEVER** |
| Firebase service account | backend only — not implemented yet | not needed |

---

## Ordered steps

### Step 1 — Create the Supabase project and collect values

1. https://supabase.com -> **New project**. Save the database password.
2. Open **Project Settings -> API** (or **API Keys**):
   - Copy **Project URL** -> this is `SUPABASE_URL`.
   - Copy **publishable key** (`sb_publishable_...`) or legacy **anon** key ->
     this is `SUPABASE_ANON_KEY`.
   - Open **Secret keys** -> reveal/create -> copy `sb_secret_...` -> this is
     `SUPABASE_SERVICE_ROLE_KEY` (backend only).
3. Open **Project Settings -> Database -> Connection string -> URI**:
   - Long-running Node host -> **Session pooler** (port `5432`) or **Direct**.
   - Serverless -> **Transaction pooler** (port `6543`) plus
     `?pgbouncer=true&connection_limit=1`.
   - Username is `postgres.<project-ref>`.
   - URL-encode special characters in the password (`@` -> `%40`).
   - Keep `?sslmode=require`.
   - This whole string is `DATABASE_URL` (backend only).
4. **Database -> Replication**: enable Realtime for the `notifications` table.
5. **Storage**: create a bucket for property media (e.g. `property-media`).

### Step 2 — Google OAuth

1. https://console.cloud.google.com -> create/select a project.
2. **APIs & Services -> OAuth consent screen**: External, add `email`, `profile`,
   `openid`. Add test users while in testing.
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**:
   - Create a **Web application** client -> copy the Client ID. This is
     `GOOGLE_CLIENT_ID` for both backend and Flutter.
   - Create an **Android** client (package name + release SHA-1/SHA-256).
   - Create an **iOS** client (bundle ID).
4. The Android/iOS client IDs do **not** go in `.env`. They are configured in the
   Flutter project (`google-services.json`, `Info.plist`, or `google_sign_in`
   setup). Flutter must pass the **Web** client ID as `serverClientId`.

Get the Android release fingerprint:
```bash
keytool -list -v -keystore ~/upload-keystore.jks -alias upload
```

### Step 3 — Generate JWT secrets

Run once:
```bash
openssl rand -base64 48   # -> JWT_ACCESS_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET
```
Put both in the backend `.env` only.

### Step 4 — Fill the backend `.env`

File: `/home/yann/SHUNEM/shunem-backend/shunem_backend/.env`

Minimum required now:
```dotenv
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://localhost:8080

DATABASE_URL=postgresql://postgres.<ref>:<password>@...pooler.supabase.com:5432/postgres?sslmode=require

GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com

JWT_ACCESS_SECRET=<openssl output 1>
JWT_REFRESH_SECRET=<openssl output 2>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

SERVICE_FEE_PERCENT=3
```

Optional now (backend does not read them yet, but harmless to keep):
```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

Defer until payments go live:
```dotenv
MTN_MOMO_API_USER=
MTN_MOMO_API_KEY=
MTN_MOMO_SUBSCRIPTION_KEY=
MTN_MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com
ORANGE_MONEY_CLIENT_ID=
ORANGE_MONEY_CLIENT_SECRET=
ORANGE_MONEY_BASE_URL=https://api.orange.com
PAYMENT_CALLBACK_URL=https://<your-api-domain>/payments/webhook
```

Defer until FCM is implemented (currently unused):
```dotenv
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

### Step 5 — Install, create the schema, apply RLS

Run from the inner project folder:
```bash
cd /home/yann/SHUNEM/shunem-backend/shunem_backend
npm install
npx prisma generate
npx prisma db push        # use direct/session connection, not port 6543
npm run build
```

Apply RLS — easiest in Supabase **SQL Editor**: paste `sql/rls.sql`.
Or:
```bash
psql "$DATABASE_URL" -f sql/rls.sql
```

Create the first Super Admin in Supabase SQL Editor:
```sql
insert into users (id, email, role, permissions)
values (gen_random_uuid(), 'you@shunem.cm', 'super_admin', '{}');
```

Test locally:
```bash
npm run start:dev
# open http://localhost:4000/docs
```

### Step 6 — Deploy the backend

Example Render settings:

- Node 20
- Build: `npm install && npx prisma generate && npm run build`
- Start: `node dist/main`
- Health check: `/api/v1/properties`
- Copy the same backend `.env` values into the host's environment settings
  (do not upload `.env`).
- Set `NODE_ENV=production` and `CORS_ORIGIN` to the real frontend origin(s).
- Point a domain, e.g. `api.shunem.cm`.
- Run `npx prisma db push` once against the production DB, then apply RLS.

Verify:
```bash
curl https://api.shunem.cm/api/v1/properties
curl -I https://api.shunem.cm/docs
```

### Step 7 — Put the public values in the Flutter app

Flutter gets **only** these four values:

- `API_BASE_URL` — deployed backend, e.g. `https://api.shunem.cm/api/v1`
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — publishable/anon key
- `GOOGLE_CLIENT_ID` — the **Web** client ID

Run:
```bash
flutter run \
  --dart-define=API_BASE_URL=https://api.shunem.cm/api/v1 \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=sb_publishable_... \
  --dart-define=GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

Release:
```bash
flutter build appbundle \
  --dart-define=API_BASE_URL=https://api.shunem.cm/api/v1 \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=sb_publishable_... \
  --dart-define=GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com

flutter build web \
  --dart-define=API_BASE_URL=https://api.shunem.cm/api/v1 \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=sb_publishable_... \
  --dart-define=GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

Also configure the Flutter project with the Android/iOS OAuth clients and pass
the **Web** client ID as `serverClientId` to `google_sign_in`.

### Step 8 — Close the CORS loop

After the Flutter **web** app is deployed, add its origin to backend
`CORS_ORIGIN` and redeploy:

```dotenv
CORS_ORIGIN=https://admin.shunem.cm,http://localhost:3000
```

Mobile apps do not send `Origin`, but Flutter Web does.

### Step 9 — Later: payments, then Firebase

- Fill `MTN_MOMO_*` and `ORANGE_MONEY_*` when sandbox/production access is ready.
- Set the provider webhook to `https://<api-domain>/payments/webhook`
  (note: **not** `/api/v1/payments/webhook` — see `src/main.ts:39`).
- Add webhook signature verification before accepting real money.
- Fill `FIREBASE_*` only when FCM push is implemented.

---

## Final checklist

- [ ] Supabase project created and DB password saved
- [ ] `SUPABASE_URL`, publishable key, secret key copied
- [ ] `DATABASE_URL` (pooler, URL-encoded, `sslmode=require`) in backend `.env`
- [ ] JWT access + refresh secrets generated and in backend `.env`
- [ ] Google Web client ID in backend `.env` and Flutter
- [ ] `npx prisma db push` completed
- [ ] `sql/rls.sql` applied
- [ ] Super Admin row inserted
- [ ] Backend deployed, `/docs` reachable
- [ ] Flutter run with the four `--dart-define` public values
- [ ] `CORS_ORIGIN` includes the deployed Flutter Web origin
- [ ] No secret key or DB URL in Flutter
