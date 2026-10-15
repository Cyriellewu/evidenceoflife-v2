# Product Brief — Evidence of Life

- **Status:** working draft, October 2026
- **Scope:** what the product is for, who it serves, and how we will know it works.
- **Related:** [Product philosophy](../PRODUCT_PHILOSOPHY.md) ·
  [Metric definitions](../metrics/metric-definitions.md) ·
  [User feedback](../USER_FEEDBACK.md)

## What goes wrong today

A plan for the day is easy to write and hard to keep. For people whose sense of
time is unreliable, the gap between "what I meant to do" and "what I did" is
mostly invisible: tasks slide, hours disappear into something unplanned, and by
evening the day is hard to reconstruct. Todo apps keep only the intention.
Journals ask for a blank-page write-up after the fact, which is one more task to
avoid. The result is a day that feels lost even when real work happened.

> TODO (owner): add evidence for this problem statement — anonymised interview
> notes or feedback issues filed via the user-feedback template. Do not
> paraphrase from memory.

## Who it is for

- **Primary:** adults with ADHD or time blindness (diagnosed or not) who plan
  their days but lose track of where the time actually went.
- **Also fits:** anyone who wants an honest, private record of planned versus
  lived time rather than a stricter productivity system.
- **Not a medical tool.** Evidence of Life is designed around how ADHD and time
  blindness feel day to day. It does not diagnose, treat or claim to improve any
  condition, and no diagnosis is needed to use it.

> TODO (owner): describe the target user from real data (age range, work/study
> context, tools they use today). No demographics have been collected yet.

## What we built

1. **Plan next to what actually happened.** Tasks, routines, deadlines and
   calendar imports sit on one daily timeline; actual activity is recorded beside
   the plan instead of overwriting it.
2. **A focus timer that records real time.** Starting a timer from a task logs the
   minutes actually spent and attaches them to that task and day.
3. **A quick recap.** When a focus session ends, a short prompt asks for mood and
   an optional one-line note. Recap views show where the day went without a
   journaling chore.
4. **Private by default.** No social feed or public profile; moments can be
   exported as JSON at any time. Self-hosting is supported
   ([guide](../oss/self-hosting.md)).

Photos, places, links, dues and habits extend the same record; see the
[philosophy doc](../PRODUCT_PHILOSOPHY.md) for the full model.

## Why now

- The app is built, public and free (MIT), with a no-account
  [live demo](https://evidenceoflife-v2.vercel.app/demo-app). The constraint is
  no longer engineering scope; it is whether new people reach the core loop.
- Activation and D7 return are now defined and measurable with a read-only
  query, so changes can be judged against real numbers instead of impressions.

> TODO (owner): add any external reason for timing (market or community
> context) only if it can be sourced.

## What success means

Success is people completing the core loop and coming back, measured exactly as
defined in
[metric-definitions.md — Activation and retention](../metrics/metric-definitions.md#activation-and-retention-added-2026-10):

- **Activation (`activated_72h`):** within 72 hours of signup, at least one plan
  item **and** at least one moment. Report both the "incl. focus sessions" and
  the "manual only" variants.
- **D7 return (`returned_d1_7`):** any counted activity on a later day than
  signup, within 7 days of signup.

> TODO (owner): set target values for activation and D7 return. None have been
> agreed; do not publish a target until one is.

## Current funnel

Source: read-only, aggregate-only query of the production Supabase project,
October 2026, using
[`scripts/metrics/activation_metrics.sql`](../../scripts/metrics/activation_metrics.sql).

| Step | Count |
| --- | --- |
| Registered accounts | 31 |
| Created anything (any counted plan item or moment) | 13 |
| Activated within 72h | 3 |
| Returned by D7 | 2 |
| New signups in the last 30 days | 0 |

Read with care: the sample is very small, and the denominators for activation and
D7 only include users whose 72-hour / 7-day window has fully elapsed (see the
definitions).

> TODO (owner): record which activation variant (incl. focus sessions or manual
> only) produced "3", and confirm that the excluded-account list in the SQL was
> applied to "31".

> TODO (owner): the README "Early validation" section and USER_FEEDBACK.md still
> quote an older, unverified user estimate. Reconcile them with this query-based
> count in a separate change.

## Open questions

- Why did most registered accounts never create anything? Is the first screen,
  the first-run checklist, or sign-up itself the drop-off point? (The client
  analytics events in the metric definitions are meant to answer this.)
- Is a moment the right second activation step, or is a completed focus session
  a better signal of value?
- With zero signups in the last 30 days, which acquisition channel should be
  tried first, and how will it be attributed (`first_*` properties)?
- Does the zh/en audience behave differently? Language is not yet broken out.
- What would a returning user say the product does for them, in their own words?

> TODO (owner): run and document at least a few user conversations to answer the
> last question; no interview quotes exist in the repo today.

---

Method adapted from Columbia AI Startup Studio coursework (rewritten; no course text reproduced).
