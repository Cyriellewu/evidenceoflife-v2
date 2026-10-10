# Metric Definitions & Confidence

- **Date:** 2026-07-28
- **Status:** DEFINITIONS READY — **no numbers computed yet** (Phase 2 blocked on Supabase read-only access).
- **Rule:** No number is published until it is produced by the read-only SQL in
  `scripts/metrics/` and reviewed. Estimates are never presented as facts.

## Why there is no "user count" here yet

The execution spec marks `estimated_registered_users` as
`UNVERIFIED_UNTIL_REPRODUCIBLE_QUERY`. Any figure (e.g. "30–40", "54") is an
estimate until `new_project_metrics.sql` (and `old_project_metrics.sql`) are run
and merged. This document defines *how* each number is computed so the result is
reproducible and defensible.

## Sources

| Concept | Source | Notes |
| --- | --- | --- |
| Registered users | `auth.users` | Canonical. 1 row per account. |
| Profile | `public.profiles` | 1 per user; not used for the headline count. |
| Activity | `public.todos` + `public.moments` | `user_id`, `created_at`, `date`. |
| Local day | `date` column | The app's own local calendar day (avoids timezone drift). |
| Focus | `todos.timer_seconds` | Sum for minutes; count > 0 for sessions. |

## Definitions

- **registered_users** — `count(*)` of `auth.users`, minus excluded accounts
  (maintainer, admin, test, duplicates). Exclusion list lives in the SQL.
- **active_users_30d** — distinct `user_id` with a `todos` or `moments` row whose
  `created_at` is within the last 30 days.
- **returning_users** — users with activity on **≥ 2 distinct local dates**
  (`count(distinct date) >= 2`).
- **signed_in_30d** — `auth.users.last_sign_in_at` within 30 days (auth-side
  cross-check for active_users_30d).
- **tasks_created / tasks_completed / moments_captured / focus_sessions /
  focus_minutes / note_items / calendar_events_synced** — straightforward
  aggregate counts over the excluded-adjusted user set.

## Old + New project merge (avoid double counting)

Two Supabase projects were used (an older one was outgrown). To merge:

1. Run the SQL on **each** project separately.
2. **Registered users are NOT additive** if the same person exists in both.
   Use the optional salted-`email_hash` list (same salt on both projects) to
   count the **union** of distinct identities, not the sum.
3. Define the **account-switch boundary date** (`supabase_account_switch_date`,
   currently UNKNOWN). Activity before the boundary counts to the old project;
   after, to the new. Event-count metrics (tasks, moments, focus) can be summed
   across the boundary since events are distinct; **user** metrics must be deduped.
4. Report confidence and any missing-data gaps (e.g. old project partially
   pruned, retention limits).

## Confidence labeling (required on every published number)

Each figure must ship with:
- The exact query + project(s) it came from.
- Whether it is a **union** (users) or **sum** (events).
- Known gaps (deleted data, unknown boundary, excluded-account assumptions).

## What NOT to output

Names, emails, task/note text, photos, coordinates, calendar contents — never.
Only the aggregate columns returned by the scripts.

## Activation and retention (added 2026-10)

Computed by `scripts/metrics/activation_metrics.sql` (read-only, aggregate-only).

- **Counted activity rows** — `todos` rows whose `date` is a real day (excludes
  the sentinel dates `'_step_'` and `'_due_%'`, which are steps and deadlines,
  not plan items) plus all `moments` rows.
- **activated_72h** — a user who, within 72 hours of `auth.users.created_at`,
  created **≥ 1 plan item** (counted todo) **and ≥ 1 moment**. Reported twice:
  - *incl. focus sessions* — any moment counts. Finishing a focus timer
    auto-logs a moment tagged `focus-session`, so this is the generous variant.
  - *manual only* — excludes moments tagged `focus-session`; the stricter
    "user captured something themselves" variant.
  Only users whose 72-hour window has fully elapsed are in the denominator.
- **returned_d1_7** — a user with any counted activity on a later day than
  their signup day and within 7 days of signup (UTC days; state the timezone
  caveat when publishing). Only users signed up ≥ 7 days ago are in the
  denominator.

### Known issue in `returning_users`

`new_project_metrics.sql` counts `count(distinct date)` over all todos, so the
sentinel dates `'_step_'` / `'_due_…'` inflate active days. Prefer the
definitions above until that query is fixed.

## Product analytics events

Client events go to GA4 / Amplitude only when `VITE_GA_MEASUREMENT_ID` /
`VITE_AMPLITUDE_API_KEY` are set. They never include task, note or moment text,
emails, or coordinates. The shared public-demo user is never identified, and
core-loop events are not sent from demo mode.

| Event | Fired when | Properties |
| --- | --- | --- |
| `landing_page_view` | Landing / public demo viewed | `page`, `mode` |
| `landing_cta_clicked` | Landing or demo CTA clicked | `cta`, `page`, `label` |
| `sign_up_clicked` | Email sign-up submitted, or Google button clicked | `method`, `page`, `auth_mode` (Google), `first_*` |
| `account_created` | Account's first sign-in (server timestamps within 10 min) | `method`, `first_*` |
| `first_action` | First todo / moment on this device (legacy, unchanged) | `action_type` |
| `todo_created` | Any task created | `has_plan_time`, `is_recurring` |
| `moment_created` | Any moment created | `has_photo`, `has_location`, `source` (`manual` / `focus_session`) |
| `timer_started` | A timer is started from a click | `source` (`focus`, `reset`, `add_and_start`, `step`, `moment`, `calendar_event`) |
| `day_returned` | Signed-in user opens the app on a new local day (per device) | `days_since_last` |

`first_*` = first-touch attribution captured once per browser:
`first_utm_source`, `first_utm_medium`, `first_utm_campaign`, `first_ref`,
`first_landing_path` (pathname only), `first_referrer_host` (host only,
cross-origin only). SQL over `created_at` stays the source of truth for
activation and retention; events explain *where* people drop off.
