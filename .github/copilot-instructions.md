# Copilot Instructions — Evidence of Life

Adapted from the "CLAUDE.md theme block" idea in the Claude-Code Frontend Design
Toolkit, tuned for THIS project's stack and the dark-mode aesthetic we settled on.

## Stack (do not assume newer versions)

- React 18.3 + TypeScript 5.8, Vite 5 with `@vitejs/plugin-react-swc`.
- **SWC does NOT type-check at build time.** After any TS change, validate with
  `npx tsc --noEmit -p tsconfig.app.json` / `npm run typecheck` (expect exit 0) and
  `npm test` (expect the suite to pass; count drifts over time — do not hardcode).
- **Tailwind v3.4** (NOT v4 — there is no `@theme` block; use `tailwind.config.ts`).
- shadcn/ui components live in `src/components/ui/`; Radix primitives underneath.
- Styling is driven by **HSL CSS variables** in `src/index.css` (`--primary`,
  `--accent`, `--foreground`, etc.). Light + dark token sets are defined there.
- date-fns 3.6, react-router 6, TanStack Query 5, Supabase, Leaflet for maps.

## Frontend aesthetic direction

Pick a deliberate look before coding — never default to "Inter + purple gradient +
generic rounded cards". This app's established direction:

- **Warm, calm, editorial.** Terracotta/orange `--primary`, gray-green `--accent`,
  earth-toned neutrals. No fluorescent/highlighter colors.
- **Dark mode is the primary surface** and gets the most scrutiny.
- Cohesive color system via CSS variables — **never hardcode hex** in components
  when a token exists. Activity colors come from `src/lib/activityColors.ts` and
  `src/lib/workType.ts`.
- Real typography hierarchy, generous spacing, subtle motion. Avoid cookie-cutter
  card grids.

## Dark-mode timeline blocks (hard-won rules — do not regress)

The timeline (`src/components/views/PlanTimelineView.tsx` +
`src/components/views/planTimeline/planTimelinePrimitives.tsx`) uses a
**Google-Calendar-style solid block** treatment in dark mode:

- Blocks are **flat, solid, low-to-mid saturation color fills with white titles** —
  NOT semi-transparent accent-into-black washes (those read muddy/gray-purple).
- Solid color is produced by `solidEventColor()`; CSS-var accents are mapped to
  concrete hex first via `resolveAccentToHex()` so every block takes the solid path.
- Keep saturation restrained (currently capped ~30). The user repeatedly asked for
  LOWER saturation — when unsure, err softer, not louder.
- Do not re-introduce a near-black "progress fill" overlay on completed blocks.
- The liked reference for colored pills is `FloatingTimer` in
  `FocusTimerOverlay.tsx` (≈12% tint, ~45% border, colored dot). Don't change it.

## Workflow rules

- Verify visual changes yourself: navigate the browser to
  `http://localhost:8080/demo-app` and screenshot before claiming success. The dev
  server runs only on **port 8080**. Don't tell the user to "just refresh".
- Make the smallest change that satisfies the request; don't refactor unrelated code.
- Don't create markdown docs to summarize changes unless asked.
- Reply in Chinese (user's primary language); brief English is fine.

## Polish loop (after generating a page/section)

1. Design — pick the direction, build it.
2. Craft — fix spacing, typography, hover/focus/disabled states.
3. A11y — keyboard nav, labels, focus rings, semantic elements, color contrast.
4. Perf/motion — respect `prefers-reduced-motion`, avoid layout thrash.
