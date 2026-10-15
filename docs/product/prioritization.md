# Prioritized backlog

- **Date:** 2026-10-15
- **Owner:** single maintainer
- **Status:** working draft. Every confidence and effort value below is an
  **estimate — owner to confirm**.

## Where we are (facts only)

From a production read-only query, October 2026:

| Measure | Count |
| --- | --- |
| Registered accounts | 31 |
| Created anything (a todo or a moment) | 13 |
| Activated within 72h | 3 |
| Returned by D7 | 2 |
| New signups in the last 30 days | 0 |

Definitions: [metric-definitions.md](../metrics/metric-definitions.md).
Operational state: the Supabase free-tier egress quota was exhausted (root
cause, base64 images stored in rows, fixed in #85 / #95) and the project is
still quota-restricted. Production migrations stop at `20260424`; later files
in `supabase/migrations/` were never applied. The `moment-photos` bucket is now
private, but an old public-read storage policy still has to be removed.

## How items are scored

The question for each item is: *does this help a new person reach a first
useful day, and then come back?*

| Factor | Scale | What it means here |
| --- | --- | --- |
| Impact (I) | 1–3 | 3 = moves 72h activation (or unblocks everything); 2 = moves D7 return; 1 = indirect (measurement, risk) |
| Reach (R) | 1–3 | 3 = every new user; 2 = some users; 1 = only the maintainer / one report |
| Confidence (C) | 0.5 / 0.8 / 1.0 | how sure we are the item has the stated effect |
| Effort (E) | 1–3 | 1 = a day or less; 2 = a few days; 3 = a week or more |

**Score = I × R × C ÷ E.** Higher goes first.

One override: **gates** rank above every scored item. A gate is anything that
blocks the whole product (no backend headroom) or is an open security issue.
Their scores are shown for completeness but do not set their order.

## Ranked backlog

| # | Item | Type | I | R | C | E | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Supabase egress / quota headroom | Gate | 3 | 3 | 1.0 | 1 | 9.0 |
| 2 | Finish storage hardening; plan the missing migrations | Gate (security) | 1 | 3 | 0.8 | 2 | 1.2 |
| 3 | Signup → first-action leak + missing funnel events | Scored | 3 | 3 | 0.8 | 2 | 3.6 |
| 4 | 3–5 recorded user-test sessions | Scored | 3 | 3 | 0.5 | 2 | 2.25 |
| 5 | Fix `returning_users` in `new_project_metrics.sql` | Scored | 1 | 1 | 1.0 | 1 | 1.0 |
| 6 | PWA install + return reminders | Scored | 2 | 2 | 0.5 | 3 | 0.67 |
| 7 | Split `PlanView.tsx` | Scored | 1 | 1 | 0.8 | 3 | 0.27 |

All C and E values: **estimate — owner to confirm.** I and R are the
maintainer's judgment and should be re-checked after item 4.

### Notes per item

1. **Egress / quota.** While the project is restricted, nothing else can be
   tested with real users. Confirm usage has dropped after #85 / #95, then
   either wait for the quota window to reset or move to a paid tier
   (> TODO (owner): decision and budget).
2. **Storage hardening + migrations.** Remove the leftover public-read policy
   on `moment-photos`, then write a plan for applying the migrations after
   `20260424` to production (order, backup, rollback). Needs owner approval
   and goes in its **own security PR** (see `AGENTS.md`, rule 4).
3. **Signup → first action.** 18 of 31 accounts never created anything.
   Today we cannot see *where* they stop. Add events for: auth page viewed,
   first-run guide shown / step reached / dismissed, and activation reached.
   Same privacy rules as existing events (no content, no emails). Only after
   these exist can a fix be judged.
4. **User tests.** Run 3–5 recorded sessions using the research kit under
   `docs/research/` (> TODO (owner): confirm the kit is merged, and recruit
   participants). Low confidence because research does not move a number by
   itself; it tells us which fix to build for item 3.
5. **`returning_users` bug.** The query counts sentinel dates (`'_step_'`,
   `'_due_…'`) as active days, inflating the result. Small, safe SQL fix.
6. **PWA / reminders.** A web manifest exists but there is no service worker,
   so no install prompt or push. Targets D7 return, which matters only once
   activation works; effort is high.
7. **Split `PlanView.tsx`.** The file is 3,898 lines. Splitting it is
   **risk reduction only** (easier review, fewer regressions); it is not
   expected to change any user metric.

## Held until evidence

These ideas sound plausible but are parked until item 3 (events) or item 4
(sessions) gives a reason to build them:

- **Seed an empty first day with an example** plan item / moment. Wait to see
  whether an empty screen is actually where people stall.
- **Check whether email confirmation is the drop-off point.** Needs the auth
  funnel events first; do not change Auth flows on a guess.
- **A post-recap return trigger** (e.g. a nudge to plan tomorrow after the
  daily recap). Only 2 people returned by D7, so there is not yet enough
  signal to design it.

## Review

Re-score after item 3 ships and after the user-test sessions.
> TODO (owner): set a review date.

---

Method adapted from Columbia AI Startup Studio coursework (rewritten; no course text reproduced).
