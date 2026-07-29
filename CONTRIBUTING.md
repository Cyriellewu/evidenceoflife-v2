# Contributing to Evidence of Life

Thanks for your interest. Evidence of Life is an open-source, ADHD-friendly
personal execution app. It is maintained by a single person, so please keep
contributions focused and self-contained.

## Ground rules

- Be respectful — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- One logical change per pull request.
- Never commit secrets. Only `.env.example` is tracked; real `.env*` files are
  gitignored. Never paste Supabase service-role keys or OAuth tokens anywhere.
- No fabricated data, fake accounts, or activity padding.

## Local setup

Requires Node.js 20+ (18+ may work) and npm.

```sh
npm install
cp .env.example .env   # fill in your own Supabase project values
npm run dev            # http://localhost:8080
```

The app needs a Supabase project (Postgres + Auth + Storage). See
[docs/oss/self-hosting.md](docs/oss/self-hosting.md) for migrations, Auth
redirects, and edge-function deploy. Only the **publishable** (anon) key belongs
in the browser.

**UI-only contributors:** `npm run dev` then open `/demo-app` (no Supabase).

## Before you open a PR

Run these and make sure typecheck + tests pass:

```sh
npm run typecheck   # types (SWC does not type-check)
npm test            # vitest
npm run lint        # eslint — advisory in CI until the debt is cleared
```

- Add or update tests for logic changes (pure helpers live in `src/lib`, tests
  in `src/test`).
- Keep diffs free of unrelated formatting churn.
- Do not upgrade dependencies without a stated reason.
- Do not change database migrations, RLS, auth, or storage policies in a feature
  PR — those are reviewed separately.

## Design conventions

- Styling is driven by HSL CSS variables in `src/index.css` +
  `src/styles/tokens.css`. Do not hardcode hex when a token exists.
- Dark mode is the primary surface and gets the most scrutiny.
- Respect `prefers-reduced-motion`; keyboard focus and contrast (WCAG AA) matter.

## Scope & expectations

This is a personal project maintained in spare time. Reviews and releases happen
on a best-effort basis — there is no guaranteed response time. Large or
architectural changes should start as an issue for discussion before coding.
