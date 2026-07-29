# Privacy Notes

> This document describes how the Evidence of Life codebase handles personal
> data, for transparency and self-hosting. It is not a legal privacy policy for
> any specific hosted deployment. Operators of a hosted instance are responsible
> for their own privacy disclosures.

## What data the app stores

Evidence of Life is a personal life-logging app. A user's own account may store:

- **Moments** — text, timestamps, optional photos, optional location
  coordinates, tags, and mood.
- **Tasks / plans / dues / habits** — titles, notes, schedule and timer data,
  completion and streak state.
- **Sticky notes & links** — short lists and saved URLs with preview metadata.
- **Places** — visited locations derived from moment coordinates.
- **Google Calendar data** — imported events, when the user connects Calendar.
- **Profile & settings** — display preferences and appearance options.

## Where data lives

- Stored in the operator's **Supabase** project (Postgres + Storage).
- Photos are stored in the private Supabase Storage bucket `moment-photos`.
  The client stores object paths and requests short-lived **signed URLs** for
  display (legacy public URLs in existing rows are still resolved when possible).
- The browser client uses only the Supabase **publishable (anon)** key.

## Access model

- Personal tables are intended to be protected by ownership-based **Row Level
  Security (RLS)** so a user can only read/write their own rows.
  (A full RLS verification is tracked as a Phase 2 security audit item.)
- Service-role access is confined to server-side Supabase **edge functions**.

## Third-party processing

- **Google Calendar**: OAuth is used to import events. Tokens are handled by the
  `google-calendar-*` edge functions server-side.
- **Smart input / geo / link preview**: edge functions may call external
  services to classify text, resolve locations, or fetch link previews. Avoid
  sending sensitive content you do not want processed by those services.

## Export & deletion

- The app includes evidence export functionality (`src/lib/exportEvidence.ts`).
- Account deletion / full data export completeness is tracked as a Phase 2 audit
  item to confirm all tables and storage objects are covered.

## Data minimization guidance for operators

- Do not create public screenshots or demos from real user data; use the
  synthetic demo data.
- Aggregate analytics must not expose individual names, emails, task/note text,
  photos, coordinates, or calendar contents.

## Known limitations (operators)

- Full live-DB RLS verification and complete account-deletion coverage remain
  Phase 2 audit items (see `docs/oss/roadmap.md`).
- AI features (`smart-input`, `life-replay`) call a third-party gateway when
  `LOVABLE_API_KEY` is configured; omit the secret to disable them.
- `image-proxy` is used from `<img src>` and therefore cannot attach a user JWT;
  it requires the anon `apikey` query param and an Origin/Referer allowlist.
