# supa-vapi-caller

Next.js 16 + Supabase. Users sign up, save a phone number to their profile, and
review their call history. Vapi calling is not wired up yet — see
[Not built yet](#not-built-yet).

## Stack

- **Next.js 16.2** (App Router, Turbopack, React 19.2)
- **Supabase** — Postgres, Auth, Row Level Security
- **Tailwind CSS 4**
- **Vercel** — auto-deploys on push to `main`

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

`.env.local` needs:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon/public key |

### Database

The app expects `profiles` and `calls` as defined in
[`supabase/schema.sql`](supabase/schema.sql). That file is idempotent — run it in
Supabase Studio → SQL Editor to create anything missing and confirm the RLS
policies match what the app assumes.

Two things it sets up that are easy to miss:

- An **INSERT policy on `profiles`**. The save action upserts, so without it the
  first save fails for a user who has no profile row.
- A trigger that creates a `profiles` row on signup. The upsert covers this too,
  so the trigger is belt-and-braces.

### Auth

Under Supabase → Authentication → URL Configuration, add
`http://localhost:3000/auth/callback` and
`https://<your-app>.vercel.app/auth/callback` as redirect URLs. Signup uses email
confirmation by default; disable it under Authentication → Providers → Email if
you'd rather skip the inbox round trip while testing.

## Deploying to Vercel

1. Push to GitHub (already wired to `origin`).
2. At [vercel.com/new](https://vercel.com/new), import `tyedou/supa-vapi-caller`.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under
   Environment Variables for Production, Preview, and Development.
4. Deploy.

After the first import, every push to `main` triggers a production deploy and
every PR gets a preview deploy. No `vercel.json` is needed — Next.js is detected
automatically.

## How auth is enforced

Three layers, because the proxy alone is not sufficient:

- **`proxy.ts`** refreshes the Supabase session cookie on every request and
  redirects signed-out users to `/login`. Next 16 renamed the `middleware`
  convention to `proxy`, and it always runs on the Node.js runtime.
- **Server Components and Server Actions** call `supabase.auth.getUser()`
  themselves. The Next.js docs warn that a matcher change can silently drop
  proxy coverage for a Server Function, so auth is re-checked at the point of
  use.
- **Row Level Security** is the actual boundary. Every policy is scoped to
  `auth.uid()`, so even a query with no `where` clause returns only the caller's
  rows.

## Layout

```
app/
  auth/actions.ts        signIn / signUp / signOut server actions
  auth/callback/route.ts exchanges the email-confirmation code for a session
  dashboard/             phone number form + call history (auth required)
  login/                 combined sign-in / sign-up form
lib/supabase/
  client.ts              browser client
  server.ts              server client (cookies() is async in Next 16)
proxy.ts                 session refresh + route protection
supabase/schema.sql      tables, RLS policies, signup trigger
```

## Not built yet

Vapi integration was deliberately deferred. What remains:

- `POST /api/call` — create a Vapi call to the user's saved number and insert a
  `calls` row with the returned `vapi_call_id`.
- `POST /api/vapi/webhook` — handle the `end-of-call-report` event and write
  `message.analysis.summary` and `message.artifact.transcript` onto the matching
  `calls` row, matched by `message.call.id`.
- A "Call Now" button on the dashboard.

The webhook must use `SUPABASE_SERVICE_ROLE_KEY` (it has no user session, and
`calls` has no user-facing INSERT policy) and should verify a shared secret
before trusting the payload.
