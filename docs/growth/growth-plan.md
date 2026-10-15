# Growth plan

- **Date:** 2026-10-15
- **Status:** draft. No acquisition work has started. Targets, budget and
  channel choice are open owner decisions.

## Current funnel (real numbers)

Production read-only query, October 2026. There were 0 signups in the last
30 days, so all 31 accounts have passed both the 72h and the 7-day windows.

| Stage | Users | SQL source |
| --- | --- | --- |
| Registered | 31 | `scripts/metrics/activation_metrics.sql` → `registered_users` |
| Created anything (todo or moment) | 13 | ad-hoc read-only count; not yet a committed query |
| Activated within 72h | 3 | `activation_metrics.sql` → `activated_72h_*` |
| Returned by D7 | 2 | `activation_metrics.sql` → `returned_d1_7` |
| Signups, last 30 days | 0 | `auth.users.created_at` count; not yet a committed query |

> TODO (owner): record which activation variant (incl. focus / manual only)
> produced the 3, and commit the "created anything" and 30-day signup counts
> as SQL so the table is reproducible. Definitions:
> [metric-definitions.md](../metrics/metric-definitions.md).

## The rule

**No acquisition push until both are true:**

1. Supabase egress is fixed and the project is out of quota restriction.
   Sending people to a restricted backend wastes the only first impression
   they give us.
2. Activation is measurable end to end: the funnel events listed in
   [prioritization.md](../product/prioritization.md) item 3 are live, so we
   can see where a new user stops between signup and first action.

Until then, the work is the backlog, not traffic.

## UTM naming convention

`src/lib/analytics.ts` stores first touch once per browser as
`first_utm_source`, `first_utm_medium`, `first_utm_campaign`, `first_ref`,
`first_landing_path` and `first_referrer_host`. Values are sanitized: any
character other than letters, digits, `_`, `.` and `-` is **dropped**, and
values are cut at 100 characters. So:

- Lowercase only; words joined with `_`; no spaces, `/`, `+` or `%`.
- `utm_source` — where the link was posted: e.g. `reddit`, `discord`,
  `campus`, `newsletter`.
- `utm_medium` — the kind of placement: `community_post`, `comment`,
  `flyer`, `email`, `talk`.
- `utm_campaign` — `yyyymm_short_topic`, e.g. `202611_timeblind_recap`.
- `ref` — optional, for a specific person or group who shared it
  (never a real name or email; use a short code).
- Link to `/` or `/demo-app`; the pathname is kept as `first_landing_path`.

Example: `/?utm_source=campus&utm_medium=flyer&utm_campaign=202611_planner_demo`

Keep a log of every link used in the results table below so numbers can be
matched to posts.

## Candidate channels (not chosen yet)

| Channel | Why it might fit | Caution |
| --- | --- | --- |
| ADHD / time-blindness online communities (forums, subreddits, Discord servers) | the product is built for this audience | many ban or limit self-promotion; read and follow each community's rules, ask moderators first, disclose that you are the maker |
| Campus (Columbia) | reachable in person; good for recorded test sessions | posting and flyer rules vary by building / group; get permission |

> TODO (owner): choose channel(s), set targets, set budget (may be $0).

## What we will not do now

- **Referral / invite loops.** A loop multiplies whatever retention exists;
  with 2 of 31 returning by D7 there is little to multiply, and invite flows
  add privacy and abuse surface.
- **Paid ads.** Spending to bring people into a quota-restricted backend and
  an unmeasured funnel would buy traffic we cannot learn from.
- **A public user-count endpoint.** It would add an unauthenticated read path
  near `auth.users`, small numbers can identify people, and published counts
  must come from reviewed SQL (see metric-definitions.md).

## Results log

Fill in only with measured numbers from the queries above or the analytics
tools. Leave blank rather than estimate.

| Date | Channel | Link (UTM) | Visits | Signups | Activated 72h | Returned D7 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

---

Method adapted from Columbia AI Startup Studio coursework (rewritten; no course text reproduced).
