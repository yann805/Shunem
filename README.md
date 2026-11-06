# Shunem — Resting Place · Backend API

**NestJS + Prisma + PostgreSQL/Supabase** backend for the Shunem enterprise
real-estate marketplace & intermediation platform. Implements the Product SRS
(`ShumenProduct.docx`) and Senior Development Requirements (`ShumenTechnical.docx`).

> The enterprise is the **mandatory intermediary** between seekers and owners.
> This API enforces every critical business rule server-side (SRS §77):
> location privacy, mediation, payment verification, RBAC, zero-trust.

---

## 1. Architecture

```
src/
├── main.ts                         # bootstrap: helmet, CORS, validation, Swagger, /api/v1 prefix
├── app.module.ts                   # global guards: JwtAuthGuard → RolesGuard → PermissionsGuard
├── common/
│   ├── prisma/                     # PrismaService (PostgreSQL/Supabase)
│   ├── guards/                     # JwtAuthGuard, RolesGuard, PermissionsGuard (SRS §79-81)
│   ├── decorators/                 # @Public, @CurrentUser, @Roles, @Permissions
│   ├── filters/                    # HttpExceptionFilter → structured errors (SRS §107)
│   ├── interceptors/               # LoggingInterceptor (SRS §108)
│   └── dto/                        # PaginationDto + Paginated<T>
├── auth/                           # Google ID-token verify + JWT sessions (SRS §8,§78,§86)
├── users/                          # profile, admin user list (SRS §42,§46)
├── properties/                     # CRUD, search, LOCATION PRIVACY output filter (SRS §16-28,§99)
├── catalog/                        # categories, amenities, transaction types (SRS §13,§14,§19)
├── requests/  visits/  bookings/   # mediation flows (SRS §30-33)
├── payments/                       # Mobile Money initiate + PROVIDER WEBHOOK confirm (SRS §34,§146)
├── notifications/                  # persisted + Realtime + FCM (SRS §37,§101,§102,§104)
├── terms/                          # versioned Owner Terms (SRS §11,§50)
├── audit/                          # append-only audit log (SRS §109)
├── reports/  reviews/              # complaints + ratings (SRS §35,§36)
└── administration/                 # owner approval + admin/permission CRUD (SRS §44,§45,§80)
prisma/schema.prisma                # full PostgreSQL data model (SRS §58, §87-91)
sql/rls.sql                         # RLS policies — location privacy at the DB (SRS §99)
```

## 2. Tech stack (SRS §71)

| Concern | Choice |
|---|---|
| Framework | NestJS 10 + TypeScript |
| ORM | Prisma 6 (PostgreSQL) |
| Database | PostgreSQL / Supabase |
| Auth | google-auth-library (server-side ID-token verify) + @nestjs/jwt |
| Validation | class-validator + class-transformer (SRS §82) |
| API docs | Swagger / OpenAPI at `/docs` (SRS §142) |
| Security | helmet, CORS allowlist, global validation pipe, JWT guards |
| Realtime | Supabase Realtime (Flutter app subscribes directly) |
| Push | Firebase FCM (triggered from NotificationsService) |
| Payments | MTN MoMo + Orange Money server-side + webhook (SRS §34) |

## 3. Prerequisites

- Node.js 20+ (or Bun)
- A **Supabase** project (Postgres + Realtime + Storage)
- A **Google OAuth** client ID (same as the Flutter app)
- (Production) Firebase service account for FCM; MTN MoMo / Orange Money API credentials

## 4. Setup

```bash
cd shunem_backend
cp .env.example .env          # fill in every value
npm install                   # or: bun install
npx prisma generate           # generate the Prisma client
npx prisma migrate deploy     # create all tables (or `prisma db push` for dev)
psql "$DATABASE_URL" -f sql/rls.sql   # apply RLS policies (location privacy)
npm run start:dev             # http://localhost:4000/api/v1  + Swagger at /docs
```

> **First admin:** create the first Super Admin by inserting directly into the
> database (there is no public admin registration — SRS §5.4):
> ```sql
> insert into users (id, email, role, permissions)
> values (gen_random_uuid(), 'you@shunem.cm', 'super_admin', '{}');
> ```
> Then sign in via Google with that email (the auth flow upserts by email and
> will adopt the existing role), or issue a JWT manually.

## 5. Environment variables (SRS §113 — never commit)

See `.env.example`. The critical ones:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres pooler URL |
| `GOOGLE_CLIENT_ID` | Verifies the Google ID token from the Flutter app |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Backend-issued session secrets |
| `MTN_MOMO_*` / `ORANGE_MONEY_*` | Mobile Money provider credentials |
| `PAYMENT_CALLBACK_URL` | Public URL for provider webhooks → `/api/v1/payments/webhook` |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by NotificationsService to write + FCM |

## 6. API surface (SRS §75, §76 — `/api/v1`, versioned)

| Method | Path | Role | SRS |
|---|---|---|---|
| `POST` | `/auth/google` | public | §8 — exchange Google ID token → session |
| `GET` | `/auth/me` | auth | §42 |
| `POST` | `/auth/refresh` | public | §86 |
| `POST` | `/auth/role` | auth | §9,§10 |
| `POST` | `/auth/register/seeker` | auth | §9 |
| `POST` | `/auth/register/owner` | auth | §10,§11 |
| `GET` | `/properties` | public | §25 — paginated + filtered + public-safe location |
| `GET` | `/properties/:id` | public | §28 — admin-only location stripped |
| `POST` | `/properties` | owner | §47 — submit (location admin fields stored) |
| `PATCH` | `/properties/:id/verify\|reject\|publish\|suspend\|archive` | admin | §23,§24,§47 |
| `GET` | `/categories` `/amenities` `/transaction-types` | public | §13,§14,§19 |
| `POST` | `/requests` | seeker | §31 |
| `PATCH` | `/requests/:id/status` | admin | §30 |
| `POST` | `/visits` | seeker | §32 |
| `PATCH` | `/visits/:id/schedule` | admin | §63 |
| `POST` | `/bookings` | seeker | §33 |
| `PATCH` | `/bookings/:id/confirm` | admin | §64 |
| `POST` | `/payments` | seeker | §34 — initiate Mobile Money |
| `POST` | `/payments/webhook` | public (provider) | §146 — **only path that confirms** |
| `GET` | `/notifications` | auth | §38 |
| `GET` | `/terms/active` | public | §11 |
| `POST` | `/terms` | super admin | §50 |
| `GET` | `/audit` | admin (AUDIT_VIEW) | §109 |
| `POST` | `/reports` | auth | §36 |
| `POST` | `/reviews` | auth | §35 |
| `PATCH` | `/administration/owners/:id/approve\|reject\|suspend` | admin | §12,§45 |
| `POST/GET/PATCH` | `/administration/admins` | super admin | §44,§80 |

## 7. Critical business rules enforced (SRS §77)

- **Location privacy (§99)** — `PropertiesService.toPublic()` strips `quarter`,
  `street`, `landmark`, `latitude`, `longitude` for every non-admin response.
  RLS (`sql/rls.sql`) + the `public_properties` view enforce it at the DB too.
- **No seeker↔owner contact (§6,§30)** — only admin-mediated flow endpoints
  exist; there is no direct message endpoint between seeker and owner.
- **Payment server-verified (§146)** — `POST /payments` only *initiates*; the
  `POST /payments/webhook` is the only path that sets `confirmed`. Idempotent.
- **Owner activation requires approval (§10,§12)** — `selectRole('owner')`
  records intent; the account is non-operational until
  `/administration/owners/:id/approve`.
- **Cannot publish unverified property (§9)** — `publish()` checks
  `verification === 'verified'`.
- **Zero-trust (§81)** — global `JwtAuthGuard` runs on every route unless
  `@Public()`; role/permissions come from the server-verified JWT, never the client.
- **Financial integrity (§147,§148)** — amounts as `Decimal(14,2)`; immutable
  `reference`; every payment produces an audit record.
- **Auditability (§109)** — every admin action logs to `audit_records`
  (append-only — no update/delete).

## 8. Connect the Flutter app

The Flutter app (`shunem_app/`) already calls this API. Wire it by setting
the same env values when running Flutter (SRS §115):

```bash
flutter run \
  --dart-define=API_BASE_URL=http://localhost:4000/api/v1 \
  --dart-define=SUPABASE_URL=https://<project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJ... \
  --dart-define=GOOGLE_CLIENT_ID=<google-client-id>
```

- The Flutter `DioClient` uses `API_BASE_URL` as its base.
- `AuthRepositoryImpl` POSTs the Google ID token to `/auth/google` → receives
  `{ access_token, refresh_token, user }` and stores tokens in
  `flutter_secure_storage`. Every subsequent request carries
  `Authorization: Bearer <access_token>` (set by the Dio auth wiring).
- Supabase Realtime is used **directly** by the Flutter app
  (`NotificationRepositoryImpl.watch()` subscribes to the `notifications`
  table) — so enable Realtime on that table in Supabase.
- Supabase Storage is used for property media/documents; the Flutter app
  uploads and passes the resulting URLs to `POST /properties`.

## 9. Deploy

### Backend
- **Build:** `npm run build` → `dist/`. **Run:** `node dist/main`.
- **Database migrations:** `npx prisma migrate deploy` on each release (SRS §136).
- **Host:** any Node host (Render, Railway, Fly.io, a VM). Expose port `PORT`
  behind a reverse proxy with HTTPS.
- **Configure the Mobile Money webhook URL** in the MTN/Orange dashboards to
  `https://api.shunem.cm/api/v1/payments/webhook` (= `PAYMENT_CALLBACK_URL`).
- **CORS:** set `CORS_ORIGIN` to the Flutter web admin origin + the mobile
  app's web build if any.

### Flutter app
- Point `API_BASE_URL` at the deployed backend.
- Mobile: build APK/IPA (`flutter build appbundle` / `flutter build ipa`).
- Admin: `flutter build web` (separate Flutter Web target).

### Security checklist (SRS §112-115)
- [ ] `.env` never committed (gitignored)
- [ ] JWT secrets are strong random strings, rotated periodically
- [ ] Supabase `service_role_key` is server-only (never in the Flutter app)
- [ ] RLS policies applied (`sql/rls.sql`)
- [ ] Rate limiting on `/auth/*`, `/properties` (SRS §111) — add a NestJS
      throttler guard at the edge
- [ ] HTTPS only; HSTS via helmet

## 10. Verify it compiles & runs

```bash
npm install
npx prisma generate
npm run build        # tsc via nest build → dist/
npm run start:dev    # boots on :4000; Swagger at /docs
```

Open `http://localhost:4000/docs` for the full OpenAPI spec.
