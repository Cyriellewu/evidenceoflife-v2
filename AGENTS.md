# Agent instructions — Evidence of Life

This repository is a **Vite + React + TypeScript + Supabase** personal life-management SPA.
Read `llms.txt` first for a compact map. Human product docs: `README.md`.

## Project context

- **Language:** TypeScript (strict app tsconfig), React 18 function components
- **Build:** Vite 5 + `@vitejs/plugin-react-swc` — **SWC does not type-check**
- **Style:** Tailwind **v3** (`tailwind.config.ts`), HSL CSS variables in `src/index.css` / `src/styles/tokens.css`, shadcn/ui under `src/components/ui/`
- **Data:** Supabase JS client; TanStack Query; React Router v6
- **Tests:** Vitest + Testing Library; Playwright demo smoke; Deno tests for edge auth helpers

## Safety boundaries (non-negotiable)

1. **No secrets.** Never commit `.env`, service-role keys, OAuth client secrets, or real user data. Only `.env.example` is tracked.
2. **No fabricated success.** Do not claim UI/tests/CI passed without running them. For UI, verify on `http://localhost:8080/demo-app` when relevant.
3. **No fake features or metrics.** Do not document APIs, integrations, or benchmarks that are not in the tree. Optional ntfy for life reminders lives in `src/lib/ntfy.ts` + Profile settings.
4. **Security-sensitive paths need separate PRs:** `supabase/migrations/**`, RLS/storage policies, Auth flows, edge-function auth (`supabase/functions/_shared/**`, `google-calendar-*`).
5. **Do not weaken auth.** Keep JWT checks / OAuth HMAC / private photo signed URLs intact unless explicitly tasked to change them with tests.
6. **Do not rewrite product design** unless asked. Dark mode is the primary surface; prefer existing tokens over hardcoded hex.

## Required verification after code changes

```sh
npm run typecheck
npm test
```

Also run when touching the relevant area:

```sh
npm run lint
npm run test:e2e          # demo route / Playwright config
npm run test:security     # Deno edge auth (if Deno available)
npm run build
```

## Development workflow for agents

1. **Plan briefly** — list files to touch and risk (auth/data/UI).
2. **Smallest diff** — one logical change; no drive-by refactors.
3. **Preserve demo mode** — `/demo-app` and `isDemo` guards must keep working without a real backend where they already do.
4. **Commits** — Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `security:`).
5. **PRs** — one concern per PR; fill `.github/PULL_REQUEST_TEMPLATE.md`.

## Design notes (do not regress)

See `.github/copilot-instructions.md` for timeline block color rules. Summary:

- Dark-mode timeline blocks are solid, restrained fills — not muddy washes
- Use `activityColors` / work-type helpers; don't invent a new palette ad hoc

## Where to look

| Need | Location |
| --- | --- |
| Routes / auth gates | `src/App.tsx` |
| App shell | `src/pages/Index.tsx` |
| Plan / timeline | `src/components/views/Plan*.tsx` |
| Photos | `src/lib/momentPhotos.ts`, `StorageImage` |
| Edge auth | `supabase/functions/_shared/auth.ts` |
| Self-host | `docs/oss/self-hosting.md` |
| Security model | `docs/SECURITY_MODEL.md` |
