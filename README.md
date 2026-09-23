# Meridian

Cross-border payments for African importers and exporters. Pay suppliers and get paid in minutes, for the partner's fee plus a flat 1%.

A product of Appify Softwares Limited. Product and technical plans live in [docs/prd.md](docs/prd.md), [docs/trd.md](docs/trd.md) and [docs/phases.md](docs/phases.md).

## Stack

- SolidStart 2 (TypeScript, strict), Vite 8, Nitro
- Tailwind CSS v4, Kobalte, lucide-solid
- Supabase: Postgres, Auth (email one-time code), Storage
- Resend for email
- Zod for validation, Vitest for tests
- Hosting: Cloudflare Workers (see TRD 1.1)

## Setup

Needs Node 24 or newer. Docker is needed for local Supabase.

```sh
npm install
cp .env.example .env.local      # then fill it in (see below)
npx supabase start              # local Postgres, Auth and a mail catcher
npm run dev                     # http://localhost:3000
```

`npx supabase start` prints the local keys. Put them in `.env.local`:

- `SUPABASE_URL` and `VITE_SUPABASE_URL`: the API URL, `http://127.0.0.1:54321`
- `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable key
- `SUPABASE_SERVICE_ROLE_KEY`: the secret key. Server only.

Local sign-in emails do not really send. Open the mail catcher at http://127.0.0.1:54324 to read them.

Without `RESEND_API_KEY`, app emails fail on purpose. Each failure is logged in the `partner_calls` table, so you can see what would have been sent.

## Environment

Every variable is listed in [.env.example](.env.example) with a note. The main groups:

| Group | Variables | Where it is used |
|---|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_*` | Everywhere. The service key is server only. |
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` | Confirmations, lead alerts, failure alerts |
| App | `APP_URL`, `MERIDIAN_MODE`, `JOBS_SECRET` | Links in emails, sandbox banner, cron routes |
| Partners | `KOTANI_*`, `KLASHA_*` | From Phase 3 |

`VITE_*` values end up in the browser. Never put a secret in one.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build for Node (`npm start` runs it) |
| `npm run build:workers` | Production build for Cloudflare Workers |
| `npm test` | Unit tests |
| `npm run lint` | ESLint, including the rule that keeps the service key in `src/server` |
| `npm run typecheck` | TypeScript |
| `npm run format` | Prettier |

## Layout

```
src/
  routes/        pages and API routes (file-based)
  components/    site header, footer, banner, fee breakdown, UI pieces
  lib/           pure logic with tests: fees, references, schemas, auth rules
  server/        server-only code: Supabase admin client, auth, email, partners
  middleware.ts  guards /app and /admin on full page loads
supabase/
  migrations/    database changes, applied in order
  templates/     the sign-in email template
```

Rule: `src/lib` has no I/O and has tests. `src/server` does I/O and stays thin.

## Auth

People sign in with a 6-digit code sent by email. The same email has a link that works too.

- `/app/*` sends signed-out visitors to sign-in, then back.
- `/admin/*` shows a 404 to anyone who is not an admin.

### Making someone an admin

Admins are marked by hand in Supabase.

1. Supabase dashboard, then Authentication, then Users.
2. Open the user. Edit their raw app metadata to `{"role": "admin"}`. Or run this in the SQL editor:
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
   where email = 'brian@appify.co.ke';
   ```
3. The user signs out and in again. The new role is in their next session.

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

## Deploy (Cloudflare Workers)

```sh
npm run build:workers
npx wrangler deploy --config .output/server/wrangler.json
```

Set the server variables as Worker secrets (`npx wrangler secret put NAME`). The `VITE_*` values must be present at build time.
