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

The owner wants work **planned before it is done, criticised before it ships,
and split across agents with distinct responsibilities**. Follow this every
time; it applies to Claude Code, Codex, Cursor, and any other agent.

### 1. Plan before acting

Before the first edit, write a short plan (in the reply or PR description):
goal, files to touch, risk class (data/egress, auth, UI, docs), what will
*not* change, and how it will be verified. Reuse existing helpers before
adding new code. Prefer cutting or merging a feature over adding one.

### 2. Size gate

- **Small** (typo, one-liner, docs-only): plan inline, no subagents.
- **Non-trivial** (2+ files, or anything touching data fetching, Supabase,
  auth, storage, the Plan timeline, or navigation): run the review loop below.

### 3. Review loop (one role per subagent)

Claude Code role definitions live in `.claude/agents/`. Subagents do not talk
to each other directly: the orchestrator (main agent) relays findings between
them and makes the call.

1. **Planner** (`planner`) — maps the code, proposes the smallest diff.
2. **Critics, in parallel**, each attacking the plan from one lens:
   - `critic-data` — Supabase egress and query shape, write safety, RLS/auth
     boundaries, production data. Never `select('*')` on tables with
     blob-like columns (the `visits.photos` base64 incident exhausted the
     free egress quota).
   - `critic-ux` — design tokens, consistent type scale, timeline colour rules
     (`.github/copilot-instructions.md`), demo chrome never covering UI, no
     duplicated features or labels.
   - `critic-tests` — which unit/e2e tests and selectors the change affects
     (e2e waits for the visible "Public demo" text on `/demo-app`).
3. **Orchestrator** — merges findings, resolves conflicts, and records the
   decision *and what was rejected and why*.
4. **Implementer** — the main agent only (one writer, no conflicting edits);
   makes exactly the agreed change.
5. **Verifier** (`verifier`) — runs the required checks, plus before/after
   `/demo-app` screenshots for UI changes, and reports failures verbatim.

### 4. Critical by default

- Re-read your own diff adversarially before every push: what would break CI,
  cost quota, or regress design?
- Never claim success without command output; say what was not verified.
- Ask the owner before any data-mutating operation on production Supabase.
- Smallest diff, one logical change, no drive-by refactors.
- **Preserve demo mode** — `/demo-app` and `isDemo` guards must keep working
  without a real backend where they already do.
- **Commits** — Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`,
  `ci:`, `security:`).
- **PRs** — one concern per PR; fill `.github/PULL_REQUEST_TEMPLATE.md`.

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
