# Brand Position — Evidence of Life

- **Status:** working draft, October 2026
- **Use this when:** writing landing copy, store listings, README text, or
  anything that describes the product to someone new.
- **Related:** [Product brief](product-brief.md) ·
  [Voice and tone](voice-and-tone.md) ·
  [Product philosophy](../PRODUCT_PHILOSOPHY.md)

## In one line

A private planner for ADHD and time-blind days that keeps your plan next to what
actually happened, so time stops vanishing.

## Words the product already uses

These strings ship today in [`src/hooks/useLanguage.tsx`](../../src/hooks/useLanguage.tsx).
New copy should reuse this vocabulary before inventing new terms.

| Key | English | 中文 |
| --- | --- | --- |
| `landing.tagline` | Proof you actually lived | 你真的活过的证据 |
| `landing.eyebrow` | For ADHD and time-blind days | 给 ADHD 和“时间盲”的你 |
| `landing.heroTitle1` / `heroTitle2` | You planned six things. Where did the day go? | 计划了六件事，这一天去哪了？ |
| `landing.how.h2` | One loop: plan, live, capture, revisit | 一个闭环：规划、投入、留存、回望 |
| `landing.stat.liveSub` | focus sessions record real time | 专注计时记录真实时间 |
| `landing.private.title` | Private by default | 默认私密 |
| `landing.final.h2` | Start keeping receipts for your real life | 开始为你真实的生活留下凭证 |
| `landing.mod.habits.title` | Habits without guilt | 无负担的习惯 |
| `focusRecap.save` | Keep evidence | 留下证据 |
| `focusRecap.notePlaceholder` | One line of evidence | 一句话，留个证据 |

Core nouns: **evidence**, **moment**, **receipts**, **timeline**, **focus
session**, **recap**, **revisit**. "Evidence" means a record that something
happened, never proof owed to anyone else.

## Words we do not use

| Avoid | Why |
| --- | --- |
| treat, cure, diagnose, symptom | Medical claims. The product is not a clinical tool (`landing.faq.medical.a` says so) and must not imply it is. |
| "fix your ADHD" | Frames the person as broken and promises an outcome we cannot support. |
| streak / fail / missed as judgments | Shame undercuts the core idea that a moved or unfinished task is still part of the record. Ship copy already reflects this: `recap.missed` and `drift.missed` display "Skipped" / 没赶上, and `landing.mod.habits.body` rejects "a streak machine designed to shame you". |
| productivity hack | Implies a trick for doing more. The product is about seeing what happened, not squeezing out output. |

Mentioning streaks to reject them (as `landing.mod.habits.body` does) is fine;
using them as a motivator is not.

## Values

Drawn from the design principles in [PRODUCT_PHILOSOPHY.md](../PRODUCT_PHILOSOPHY.md):

- **Make time visible** — show it on a timeline instead of relying on estimation.
- **Make starting cheap** — fewer steps between intent and action.
- **Count partial progress** — small and unfinished work is still progress.
- **Use context as a cue** — photos, places and time of day help recall.
- **Reality over perfection** — keep the original plan and what really happened,
  without judgment.
- **Carry the memory load** — capture in the moment so the day does not need to
  be rebuilt later.
- **Private by default** — a personal record, not a public performance.

## How it differs from typical planners and journals

Stated as product facts, not as criticism of other tools:

- **Todo lists and planners** usually store the intention and mark it done or not
  done. Evidence of Life keeps the plan and the actual activity side by side,
  including moved, partial and unplanned work (`landing.angle.todo.body`).
- **Journals** usually start from an empty page after the day ends. Here, the
  record grows out of tasks and focus sessions the user already has, plus an
  optional one-line note (`landing.angle.journal.body`).
- **Habit trackers** often center on consecutive-day counts. Habits here are shown
  as part of ordinary life rather than as a score to protect
  (`landing.angle.habit.body`).
- **Time trackers** record duration; this product also attaches place, photo,
  mood and note so the time can be recalled later, and browsed by day, year and
  map (`landing.stat.revisitSub`).

> TODO (owner): add evidence of which alternatives target users actually use
> today (from conversations or feedback issues). Do not name competitors without
> a source.

## Positioning checks

Before publishing new outward-facing copy, ask:

1. Does it describe what the product does, not what it will do for someone's
   health?
2. Would it read as kind to someone who had a scattered day?
3. Does every number in it come from
   [metric-definitions.md](../metrics/metric-definitions.md)?
4. Is there a matching zh string?

> TODO (owner): add language real users use to describe the problem, quoted from
> recorded and consented feedback only.

---

Method adapted from Columbia AI Startup Studio coursework (rewritten; no course text reproduced).
