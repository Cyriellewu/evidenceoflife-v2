# Evidence of Life v1.0.0 — release notes (draft)

> **Not released yet.** Do not create a GitHub Release / tag until the gate
> below is checked. This draft is for portfolio and Codex application packaging.

## Release title

**Evidence of Life v1.0.0**

## Suggested release body

### Initial public release

Evidence of Life is a full-stack personal life management platform: plan the day,
capture what actually happened, and revisit habits, places, and memories in a
private archive you control.

### Highlights

- Today / Plan timeline with focus timers and planned-vs-actual views
- Moments with photos, places, tags, and links
- Dues, habits, sticky notes, and link hub
- Map + calendar / year recall
- Google Calendar OAuth import
- Supabase Auth + Postgres RLS + private photo storage (signed URLs)
- Synthetic public demo at `/demo-app`
- CI: typecheck, unit tests, lint, Playwright demo smoke, CodeQL, gitleaks

### Technology stack

Vite · React · TypeScript · Tailwind / shadcn · Supabase (Auth, Postgres, Storage, Edge Functions)

### Security notes for operators

Apply migrations and redeploy edge functions before relying on production
hardening. See `docs/SECURITY_MODEL.md` and `docs/oss/self-hosting.md`.

## Release gate (human)

- [ ] Production Supabase has latest migrations + redeployed functions
- [ ] Live demo URL resolves (`https://evidenceoflife-v2.vercel.app/demo-app`)
- [ ] README screenshots reviewed (no real personal data)
- [ ] Private Vulnerability Reporting enabled on GitHub
- [ ] Tag only from `main` after CI green: `git tag -a v1.0.0 -m "Evidence of Life v1.0.0"`
