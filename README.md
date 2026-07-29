# Evidence of Life

> A private memory system to record what you've done. Not therapy — evidence of a life well-lived.

Evidence of Life is a daily life-tracking web app. You capture *moments* (what happened), plan your day, track longer-term *dues* and habits, and see your life across a calendar, a map of the places you've been, and a year-at-a-glance grid.

## Features

- **Today** — Plan your day on a timeline and record moments as they happen, with photos, locations, tags, and focus timers.
- **Recap** — Review what you actually did each day.
- **Dues & Habits** — Track deadlines, multi-step goals, and recurring habits with streaks.
- **Sticky Notes & Link Hub** — Lightweight checklists and saved links with previews.
- **Map** — See the places you've visited, auto-categorized (restaurant, coffee, park, museum…).
- **Calendar & Year View** — Browse history by day, month, and year.
- **Google Calendar sync** — Import external events into your timeline.
- **Smart input** — AI-assisted classification of free-text and voice input into moments, plans, or dues.

## Tech Stack

- **Frontend:** Vite, React 18, TypeScript
- **UI:** shadcn/ui (Radix UI), Tailwind CSS, Recharts, Leaflet
- **Data & state:** TanStack Query, React Router
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions)
- **Testing:** Vitest, Testing Library

## Getting Started

Requires Node.js 20+ (18+ may work) and npm.

```sh
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env   # then fill in your Supabase project values

# 3. Start the dev server (http://localhost:8080)
npm run dev
```

**Try without Supabase:** open [http://localhost:8080/demo-app](http://localhost:8080/demo-app) for the synthetic public demo.

Full backend setup (migrations, Auth, edge functions, Google Calendar): see [docs/oss/self-hosting.md](docs/oss/self-hosting.md).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Production build |
| `npm run build:dev` | Development-mode build |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | TypeScript check (`tsconfig.app.json`) |
| `npm run lint` | Run ESLint (non-blocking in CI until debt is cleared) |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

## Project Structure

```
src/
  components/       Reusable UI and feature components
    ui/             shadcn/ui primitives
    views/          Top-level screens (Today, Map, Calendar, Dues…)
  hooks/            Data hooks (moments, dues, todos, places, auth…)
  integrations/     Supabase client and generated types
  lib/              Pure utilities (time math, tagging, colors…)
  pages/            Route entry points
  types/            Shared TypeScript types
supabase/
  functions/        Deno edge functions (geo, smart-input, link-preview…)
  migrations/       SQL migrations
```

## Environment Variables

See [`.env.example`](.env.example). All client variables are prefixed with `VITE_`. The Supabase **publishable** key is safe to expose in the browser; never commit service-role keys or other secrets.

## Contributing & community

- [CONTRIBUTING.md](CONTRIBUTING.md) — local setup and PR gates
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md) — private vulnerability reporting
- [PRIVACY.md](PRIVACY.md) — data-handling notes for operators
- [LICENSE](LICENSE) — MIT
- [docs/oss/roadmap.md](docs/oss/roadmap.md)

## Deployment

The app is a static SPA. `vercel.json` rewrites all routes to `index.html` for client-side routing. Build with `npm run build` and deploy the `dist/` directory to any static host. Supabase edge functions deploy separately via the Supabase CLI.
