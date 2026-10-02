# Self-hosting Evidence of Life

Verified path for a fresh Supabase project + local Vite app. Edge AI features
(smart-input, life-replay) are optional.

## Prerequisites

- Node.js **20** (CI uses 20; 18+ may work)
- npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) recent enough to run
  `supabase db push` and `supabase functions deploy`

## 1. Clone and install

```sh
npm install
cp .env.example .env
```

## 2. Create a Supabase project

1. Create a project in the Supabase dashboard.
2. Copy **Project URL** and **anon / publishable** key into `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID` (the project ref)

## 3. Apply migrations

```sh
supabase link --project-ref <your-project-id>
supabase db push
```

This creates tables, RLS policies, storage bucket `moment-photos` (private),
and calendar-token hardening from `supabase/migrations/`.

## 4. Auth providers

In Supabase Auth settings:

- Enable **Email** (and/or Google) as needed.
- Add redirect URL: `http://localhost:8080/auth/callback` (and your production
  origin when you deploy).

## 5. Edge functions (optional but recommended)

Set secrets (never commit these):

```sh
supabase secrets set \
  APP_URL=http://localhost:8080 \
  ALLOWED_REDIRECT_ORIGINS=http://localhost:8080 \
  OAUTH_STATE_SECRET="$(openssl rand -hex 32)" \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  LOVABLE_API_KEY=...   # omit if you skip AI features
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
normally injected by the platform for deployed functions.

Deploy:

```sh
supabase functions deploy geo
supabase functions deploy smart-input
supabase functions deploy link-preview
supabase functions deploy image-proxy
supabase functions deploy life-replay
supabase functions deploy google-calendar-auth
supabase functions deploy google-calendar-callback
supabase functions deploy google-calendar-sync
```

### Feature → dependency

| Feature | Needs |
| --- | --- |
| Core app (moments, plan, dues, map) | Supabase DB + Auth + Storage |
| Link previews | `link-preview` function + signed-in user |
| External link images | `image-proxy` + anon `apikey` query |
| Life replay / smart input | `LOVABLE_API_KEY` + functions |
| Google Calendar sync | Google OAuth client + calendar functions + `APP_URL` |
| Optional ntfy life reminders | User topic in Profile (client → ntfy.sh or self-hosted); no edge secret |

## 6. Run locally

```sh
npm run typecheck
npm test
npm run dev   # http://localhost:8080
```

**UI-only without backend:** open `/demo-app` after `npm run dev` — synthetic
demo data, no Supabase required.

## 7. Smoke checks

- Sign up / sign in
- Create a moment with a photo (storage path + signed URL)
- Create a due with a link preview (while signed in)
- Optional: connect Google Calendar and confirm redirect returns to `APP_URL`

## Troubleshooting

### Photos show as broken images

- **Cause:** the `moment-photos` bucket is private, so the app needs the
  signed-URL behavior from
  `20260730020000_harden_storage_and_calendar_tokens.sql`. If that migration
  was not applied, image URLs are not authorized.
- **Fix:** link the project and apply all migrations, then redeploy the edge
  functions:

  ```sh
  supabase link --project-ref <your-project-id>
  supabase db push
  supabase functions deploy image-proxy
  ```

### Google Calendar redirect fails

- **Cause:** `APP_URL` or `ALLOWED_REDIRECT_ORIGINS` does not match the exact
  origin registered in Supabase Auth redirect settings.
- **Fix:** set both values to the same origin
  (`http://localhost:8080` locally) and add the callback URL
  (`/auth/callback`) to Supabase Auth.

### `supabase db push` errors

- **Cause:** the local project is not linked, or the Supabase CLI is too old.
- **Fix:** run `supabase link --project-ref <your-project-id>` and upgrade the
  CLI, then retry `supabase db push`.

### Link preview returns 401

- **Cause:** `link-preview` requires a signed-in user with a valid JWT.
- **Fix:** sign in again, confirm the session is active, and make sure the
  deployed function includes the current auth helper changes.

### Smart input / life replay unavailable

- **Cause:** the optional `LOVABLE_API_KEY` is unset, so those AI features are
  disabled.
- **Fix:** set the secret and redeploy the affected functions:

  ```sh
  supabase secrets set LOVABLE_API_KEY=...
  supabase functions deploy smart-input
  supabase functions deploy life-replay
  ```

### Blank app on first load

- **Cause:** `.env` is missing `VITE_SUPABASE_URL` or
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Fix:** copy `.env.example` to `.env`, fill in the project URL and anon /
  publishable key, then restart `npm run dev`. The UI-only route at
  `/demo-app` works without a backend.

## Security notes

- Photos use a **private** bucket; the client requests short-lived signed URLs.
- `link-preview` / `life-replay` require a user JWT.
- Google Calendar OAuth `state` is HMAC-signed; redirects are origin-allowlisted.
- See [SECURITY.md](../../SECURITY.md) and [PRIVACY.md](../../PRIVACY.md).
