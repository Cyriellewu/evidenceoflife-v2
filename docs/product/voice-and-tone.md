# Voice and Tone — In-App Copy

- **Status:** working draft, October 2026
- **Applies to:** every user-visible string in the app, landing page and demo.
- **Related:** [Brand position](brand-position.md) · [Product brief](product-brief.md)

## The voice in one sentence

A calm friend who helps you see what happened today, never a coach keeping score.

## Rules

1. **zh and en ship together.** Every user-visible string lives as a key in
   [`src/hooks/useLanguage.tsx`](../../src/hooks/useLanguage.tsx) with both `zh`
   and `en` values, read through `t('key')`. Do not add a string in one language
   only, and do not hardcode text in components.
2. **Steps are short and start with a verb.** "Add", "Log", "Start", "Keep".
   One action per line; keep checklist and button labels to a few words.
3. **Optional means labelled optional.** If an action can be skipped, say so in
   the label itself ("(optional)" / "（可选）" or "Optional ·" / "可选 ·"), and
   offer a neutral way out such as `focusRecap.skip` ("Skip" / 跳过).
4. **No guilt.** Describe what happened, not what the user failed to do. No
   "missed", "failed", "broke your streak", "behind", or "you should have". When
   the system fails, the system owns it.
5. **No medical claims.** Never say the app treats, cures, diagnoses or improves
   ADHD or any symptom. "Designed around how ADHD and time blindness feel" is the
   ceiling (see `landing.faq.medical.a`).
6. **Numbers come from definitions.** Any count shown to users or used in
   marketing (users, activation, return rate, focus minutes) must match a
   definition in [metric-definitions.md](../metrics/metric-definitions.md) and its
   query. In-app stats show the user's own data only.
7. **Plain words over clever ones.** Prefer "moment", "focus session", "recap",
   "evidence" (the product's own nouns) to new jargon.

## Do and don't

The "Do" column quotes strings that ship today. The "Don't" column is an
illustrative counter-example, not existing copy.

| # | Do (shipped) | Don't | Rule |
| --- | --- | --- | --- |
| 1 | `focusRecap.noteQuestion`: "What got done? (optional)" / 做成了什么？（可选） | "Write what you accomplished" with no way to skip | 3 |
| 2 | `drift.missed` / `recap.missed`: "Skipped" / 没赶上 | "Missed" or "Failed" in red | 4 |
| 3 | `focusRecap.save`: "Keep evidence" / 留下证据 | "Submit your daily log" | 2, 7 |
| 4 | `horizon.empty`: "Nothing here yet" / 这段时间还没有记录 | "You didn't record anything this week" | 4 |
| 5 | `recap.generateFailed`: "Could not generate story" / 生成失败 | "You need more entries to get a story" | 4 |
| 6 | `landing.faq.medical.a`: "It is not a medical or diagnostic tool, and you don't need a diagnosis to use it." | "Clinically proven to reduce ADHD symptoms" | 5 |

Note on #2: the key is named `missed`, but what users see is the softer word.
Key names are internal; only the displayed value has to follow these rules.

## Checklist for a copy change

- [ ] Both `zh` and `en` values added under one key in `useLanguage.tsx`
- [ ] Label is a short verb phrase; optional steps say "optional"
- [ ] No guilt words, no medical words (see [brand position](brand-position.md#words-we-do-not-use))
- [ ] Any number is traceable to [metric-definitions.md](../metrics/metric-definitions.md)
- [ ] Checked in the running app at `/demo-app` in both languages

## Visual rules live elsewhere

This guide covers words only. For color, type and timeline-block styling, follow
the existing sources instead of restating them here:

- [`src/index.css`](../../src/index.css) — theme CSS variables (HSL) and base styles
- [`src/styles/tokens.css`](../../src/styles/tokens.css) — design tokens
- [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) —
  timeline block color rules (dark mode is the primary surface)

## Known follow-up

> TODO (owner): [`src/components/FirstRunChecklist.tsx`](../../src/components/FirstRunChecklist.tsx)
> builds its labels with inline `zh ? '…' : '…'` ternaries (for example
> "Add one thing to do today", "Optional · tap ▶ on a task to time it",
> "Log a moment") instead of `useLanguage` keys. The wording already follows
> rules 2–4; move the strings to keys in a separate change. Not fixed here.

> TODO (owner): validate this tone with real users (e.g. whether "Skipped" still
> reads as judgment in either language) and record findings via the
> user-feedback issue template.

---

Method adapted from Columbia AI Startup Studio coursework (rewritten; no course text reproduced).
