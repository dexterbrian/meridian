# Meridian

Cross-border payments for African importers and exporters. Pay suppliers and get paid in minutes, for the partner's fee plus a flat 1%.

A product of Appify Softwares Limited. Product and technical plans live in [docs/prd.md](docs/prd.md), [docs/trd.md](docs/trd.md) and [docs/phases.md](docs/phases.md).

## Stack

- SolidStart 2 (TypeScript, strict), Vite 8, Nitro
- Tailwind CSS v4, Kobalte, lucide-solid
- Supabase: Postgres, Auth (email one-time code), Storage
- Resend for email
- Payaza for collections and payouts (hackathon build)
- Zod for validation, Vitest for tests
- Hosting: Vercel at https://meridian.appify.co.ke (see TRD 1.1)

## Setup

Needs Node 24 or newer. Docker is needed for local Supabase.

```sh
npm install
cp .env.example .env.local      # then fill it in (see below)
npx supabase start              # local Postgres, Auth and a mail catcher
npx supabase migration up       # apply any new migrations
npm run dev                     # http://localhost:3000
```

`npx supabase start` prints the local keys. Put them in `.env.local`:

- `SUPABASE_URL` and `VITE_SUPABASE_URL`: the API URL, `http://127.0.0.1:54321`
- `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable key
- `SUPABASE_SERVICE_ROLE_KEY`: the secret key. Server only.

Local sign-in emails do not really send. Open the mail catcher at http://127.0.0.1:54324 to read them.

Without `RESEND_API_KEY`, app emails fail on purpose. Each failure is logged in the `partner_calls` table, so you can see what would have been sent.

### Payaza

Keys come from the Payaza dashboard: Settings, Developers, Generate Keys. Test keys start `PZ78-PKTEST-` and `PZ78-SKTEST-`.

- `PAYAZA_PUBLIC_KEY` authenticates API calls and is the Web Checkout `merchant_key`.
- `PAYAZA_SECRET_KEY` signs webhooks. Server only.
- `PAYAZA_TRANSACTION_PIN` authorises payouts. Set it in the dashboard first (Settings, Profile, Security).
- `PAYAZA_SIMULATE_PAYOUTS=true` while the test merchant has no payout float. Sandbox only.

### Receiving Payaza webhooks locally (ngrok)

Payaza cannot reach `localhost`, so a tunnel fronts the dev server.

```sh
ngrok config add-authtoken <your token>     # once; from dashboard.ngrok.com
ngrok http 3000                             # prints https://<something>.ngrok-free.app
```

Then:

1. Put the https URL in `.env.local` as `APP_URL`.
2. In the Payaza dashboard (Settings, Developers, webhooks) set **both** the collection and payout webhook URLs to `https://<something>.ngrok-free.app/api/webhooks/payaza`. Test mode.
3. Restart `npm run dev`.

Without the tunnel the app still works: the pay page asks Payaza for the payment's status after 15 seconds, and the payout sweep does the same every 10 minutes. The tunnel just makes it instant.

### Trying the flow

1. Sign in at `/auth/sign-in` (read the code from Mailpit at http://127.0.0.1:54324).
2. `/app/onboarding`: business profile. `/app/settings/payout-accounts`: a KES M-Pesa account (`SAFKEN`, `254712345678`). In the sandbox Payaza returns the same canned name for any account, so the mismatch is a warning.
3. `/app/collect/new`: KES 650,000, invoice `AF-0917`. Open the link.
4. On the pay page pick Mobile money, M-Pesa, `254712345678`. Press Pay, then "Simulate approval on the phone". Watch the timeline settle.
5. `/admin` needs the admin role (below). It shows flags, held payments and every Payaza call.

Or run it all headless: `npm run e2e:sandbox`.

## Environment

Every variable is listed in [.env.example](.env.example) with a note. The main groups:

| Group | Variables | Where it is used |
|---|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_*` | Everywhere. The service key is server only. |
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` | Confirmations, lead alerts, failure alerts |
| App | `APP_URL`, `MERIDIAN_MODE`, `JOBS_SECRET` | Links in emails, sandbox banner, cron routes |
| Payaza | `PAYAZA_PUBLIC_KEY`, `PAYAZA_SECRET_KEY`, `PAYAZA_BASE_URL`, `PAYAZA_TRANSACTION_PIN`, `PAYAZA_SIMULATE_PAYOUTS` | Collections, webhooks, payouts |
| Partners | `KOTANI_*`, `KLASHA_*` | From Phase 3 |

`VITE_*` values end up in the browser. Never put a secret in one.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build for Node (`npm start` runs it) |
| `npm run build:vercel` | Production build for Vercel (what Vercel runs) |
| `npm run build:workers` | Production build for Cloudflare Workers |
| `npm test` | Unit tests |
| `npm run e2e:sandbox` | The whole collection flow against Payaza's sandbox and local Supabase |
| `npm run lint` | ESLint, including the rule that keeps the service key in `src/server` |
| `npm run typecheck` | TypeScript |
| `npm run format` | Prettier |

## Layout

```
src/
  routes/        pages and API routes (file-based): /pay, /app, /admin, /api/webhooks, /api/jobs
  components/    site chrome, fee breakdown, pay flow, status badges and timeline, form fields
  lib/           pure logic with tests: fees, references, Payaza codes and webhooks, checks, schemas
  server/        server-only code: Supabase admin client, auth, email, Payaza client, the collection state machine
  middleware.ts  guards /app and /admin on full page loads
scripts/         e2e-sandbox.ts and smoke-signed-in.ts (run with vite-node)
supabase/
  migrations/    database changes, applied in order
  templates/     the sign-in email template
```

Rule: `src/lib` has no I/O and has tests. `src/server` does I/O and stays thin.

## Auth

There are **no passwords**. Everyone signs in the same way: type your email, get a 6-digit code, enter it. The same email also has a link that works if you click it instead.

- `/app/*` sends signed-out visitors to sign-in, then back.
- `/admin/*` shows a 404 to anyone who is not an admin. Being an admin is a flag on your user, not a separate login.

### Signing in to the admin dashboard

The admin dashboard is at `/admin` (for example `http://localhost:3000/admin` locally, or `https://meridian.appify.co.ke/admin` in production). There is no admin username or password. You sign in with your normal email code, and your user carries an "admin" flag that unlocks `/admin`.

**Step 1 — sign in once, so your user exists.**

1. Go to `/auth/sign-in` and enter your email.
2. Read the 6-digit code from the email and enter it.
   - **Locally**, the email does not really send. Open the mail catcher at http://127.0.0.1:54324 and read the code there.
   - **In production**, the code arrives in your real inbox (needs `RESEND_API_KEY` and a verified sending domain).

At this point you can reach `/app`, but `/admin` still shows a 404. You are a normal user until you are made an admin.

**Step 2 — make that user an admin.** Run this once, with your own email:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
where email = 'brian@appify.co.ke';
```

- **Locally:** paste it into Supabase Studio's SQL editor at http://127.0.0.1:54323, or run
  ```sh
  npx supabase db query --local "update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"role\": \"admin\"}' where email = 'brian@appify.co.ke';"
  ```
- **In production:** run the same statement in the hosted project's SQL editor (Supabase dashboard, SQL Editor). Or use the dashboard UI: Authentication, then Users, open your user, edit **Raw app metadata** to `{"role": "admin"}`.

**Step 3 — sign out and sign in again.** The role is read from your session, which is only refreshed on a new sign-in. After signing back in, `/admin` opens: the flag queue, held payments, failed payouts and a view of every Payaza call.

There is no self-service way to become an admin, on purpose. It is set by hand in the database.

### Hosted Supabase settings

Keep these in step with `supabase/config.toml`:

- Auth, then URL configuration: site URL is `APP_URL`. Add `APP_URL/auth/callback` to redirect URLs.
- Auth, then Email templates: use `supabase/templates/sign-in.html` for both "Magic link" and "Confirm signup". It carries the code and the link.
- Auth, then SMTP: send through Resend so sign-in emails come from the verified domain.

## Database

Apply migrations to the hosted project with the Supabase CLI:

```sh
npx supabase link --project-ref <ref>
npx supabase db push
```

After a schema change, regenerate the types:

```sh
npx supabase gen types typescript --local > src/lib/database.types.ts
```

## Deploy (Vercel, meridian.appify.co.ke)

`vercel.json` holds the build command and the cron. Import the GitHub repo into Vercel, then:

1. Project settings, Environment Variables: everything in `.env.example` except the local Supabase values. `APP_URL=https://meridian.appify.co.ke`. `CRON_SECRET` equal to `JOBS_SECRET`. `MERIDIAN_MODE=sandbox` until the pilot.
2. Domains: add `meridian.appify.co.ke` and set the CNAME it asks for.
3. Supabase hosted project: `npx supabase link --project-ref <ref>` then `npx supabase db push`. Auth URL configuration: site URL `https://meridian.appify.co.ke`, redirect URL `https://meridian.appify.co.ke/auth/callback`.
4. Payaza dashboard: collection and payout webhook URLs `https://meridian.appify.co.ke/api/webhooks/payaza`.
5. Mark Brian as admin (above).

`vercel.json` runs the payout sweep once a day (03:00 UTC), the most Vercel's Hobby plan allows. For every 10 minutes, upgrade to Pro, or hit `GET /api/jobs/payout-retry` with `Authorization: Bearer <JOBS_SECRET>` from any external scheduler, or use the "Run payout sweep" button in `/admin`.

A Cloudflare Workers build also exists: `npm run build:workers` then `npx wrangler deploy --config .output/server/wrangler.json`.
