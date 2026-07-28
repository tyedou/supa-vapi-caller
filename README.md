# supa-vapi-caller

A barebones static frontend on Supabase, with two serverless functions for Vapi.
No framework, no build step, no `node_modules`.

```
index.html            sign up / log in, phone number, Call Now, call history
app.js                all frontend logic (Supabase JS from CDN)
api/call.js           starts a Vapi call to the user's saved number
api/vapi-webhook.js   receives the end-of-call summary from Vapi
schema.sql            tables, RLS policies, signup trigger
```

## Why the two `api/` files exist

Everything else talks to Supabase directly from the browser. These two can't:

- **`api/call.js`** holds the Vapi *private* key. Anything in `app.js` is
  readable by anyone who opens DevTools.
- **`api/vapi-webhook.js`** is a URL Vapi can POST to. A static file can't
  receive a POST.

Both are dependency-free — plain `fetch` against Supabase's REST API.

## Setup

### 1. Database

Paste [`schema.sql`](schema.sql) into Supabase Studio → SQL Editor and run it.
It creates `profiles` and `calls`, enables RLS, and adds a trigger that creates
a profile row on signup.

### 2. Frontend key

In `app.js`, replace `PASTE_YOUR_SUPABASE_ANON_KEY_HERE` with your anon key
(Supabase → Project Settings → API).

The anon key belongs in client code and is safe to commit — it identifies the
project, it doesn't grant access. RLS is what protects the data. The
`service_role` key is the opposite: it bypasses RLS entirely and must only ever
live in Vercel's environment variables.

### 3. Vapi

Create an assistant and buy/import a phone number in the Vapi dashboard. Note
the assistant ID, the phone number ID, and your private API key.

### 4. Deploy to Vercel

1. [vercel.com](https://vercel.com) → sign in with GitHub.
2. **Add New → Project** → import this repo.
3. Framework preset: **Other**. No build command, no output directory — Vercel
   serves `index.html` from the root and turns each file in `api/` into a
   serverless function automatically.
4. Add these environment variables (Production + Preview):

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` |
   | `VAPI_API_KEY` | Vapi private key |
   | `VAPI_ASSISTANT_ID` | Vapi assistant ID |
   | `VAPI_PHONE_NUMBER_ID` | Vapi phone number ID |
   | `VAPI_WEBHOOK_SECRET` | Any string you invent |

5. Deploy.

Every push to `main` is a production deploy from then on. Every PR gets a
preview URL.

### 5. Point Vapi at the webhook

In the Vapi dashboard, set the assistant's Server URL to
`https://<your-app>.vercel.app/api/vapi-webhook` and the secret to the same
value as `VAPI_WEBHOOK_SECRET`. Vapi sends it as the `X-Vapi-Secret` header.

### 6. Supabase redirect URLs

Under Authentication → URL Configuration, add your Vercel URL. Signup uses email
confirmation by default; turn it off under Authentication → Providers → Email if
you'd rather skip the inbox round trip while testing.

## Running locally

Open `index.html` in a browser and auth, saving a phone number, and the call
list all work — they go straight to Supabase.

**Call Now will not work locally.** There is no `/api` when you open a file from
disk; it only exists once deployed. The button reports this rather than failing
silently. To exercise it locally, use `npx vercel dev`.

## How the pieces connect

```
Call Now  ->  POST /api/call  (with the user's Supabase access token)
                 |  verifies the token, reads profiles.phone_number
                 |  POST https://api.vapi.ai/call
                 |  attaches the user id as Vapi metadata
                 v
              Vapi rings the user's phone
                 |
                 v  after hangup
              POST /api/vapi-webhook
                 |  checks X-Vapi-Secret
                 |  inserts a calls row with the summary
                 v
              Refresh shows it in the user's call history
```

A row is written only when a call completes, so the history holds finished
calls with real summaries rather than placeholder rows.

### How the summary finds the right user

`calls` has no `vapi_call_id` column, so the webhook identifies the user two
ways, in order:

1. **Metadata** — `api/call.js` sends `metadata.supabase_user_id` when placing
   the call, and reads it back off `message.call.metadata`. Exact.
2. **Phone number** — if the metadata doesn't survive the round trip, the
   dialled number from `message.call.customer.number` is matched against
   `profiles.phone_number`.

The fallback exists because Vapi's docs don't explicitly guarantee custom
metadata propagates into `end-of-call-report`. Note its one weakness: if two
accounts save the same phone number, the fallback can attribute a call to
either. The metadata path has no such ambiguity.

Either way the user id comes from the call Vapi was *asked* to place, never
from a user id in the webhook body — so a forged webhook can't write a summary
onto someone else's account.

## Data isolation

Both policies in `schema.sql` are scoped to `auth.uid()`, so the queries in
`app.js` return only the signed-in user's rows even though they carry no filter
on `"user"`. Note that `"user"` is a reserved word in Postgres and has to be
double-quoted everywhere it appears in SQL.

The two server functions use the `service_role` key, which bypasses RLS
entirely — which is exactly why it must never appear in `app.js`.
