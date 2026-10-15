---
name: synthetic-user-testing
description: >-
  Quick, cheap pre-check of Evidence of Life copy or a short flow using
  model-simulated personas, before showing it to real people. Use when asked to
  "synthetic test", "pressure-test this copy", or compare wording options for
  the landing page, FAQ, first-run checklist or other zh/en strings. Output is a
  hypothesis list, never user evidence.
---

# Synthetic user testing (copy and flows)

Simulated personas are a lint pass for wording: they surface likely confusion
and objections fast. They do not tell us what real people think.

## Hard rules

1. **Hypotheses only.** Never cite synthetic results as user evidence in
   `README.md`, `docs/USER_FEEDBACK.md`, pitches, investor or course decks,
   growth docs, or `docs/metrics/`. Every summary is labelled *synthetic*.
2. **No invented quotes from real users.** Persona text is attributed to a
   persona ID (`P07-privacy_skeptic`), never to a name, a real person, or
   "a user said". Do not paste it into interview snapshots or syntheses.
3. **Voice and position still apply.** Any rewrite you suggest must follow
   `docs/product/voice-and-tone.md` and `docs/product/brand-position.md`:
   zh + en together, no guilt words, and no medical claims (nothing that says
   the app treats, diagnoses or improves ADHD).
4. **No numbers outward.** Scores are for comparing variants inside one run.
   Do not turn them into percentages or claims for marketing.
5. **Real research wins.** If a finding matters, turn it into a question for
   `docs/research/interview-guide.md` and test it with real, consented people.

## Steps

1. **Pick the target.** Default when the request is vague:
   - landing hero: `landing.eyebrow`, `landing.heroTitle1/2`, `landing.heroSub`,
     `landing.hero.note` in `src/hooks/useLanguage.tsx`;
   - landing FAQ: all `landing.faq.*` keys;
   - first-run checklist labels in `src/components/FirstRunChecklist.tsx`
     (inline `zh ? … : …` strings, not yet keys).
   Test **both zh and en**. Copy the exact current strings into the run file
   so the result can be traced to a commit (`git rev-parse --short HEAD`).
2. **Choose N and buckets.** Spread personas evenly across these hypothesis
   buckets (drop or add one only with a stated reason):

   | Bucket | Hypothesis it probes |
   | --- | --- |
   | `planner_graveyard` | Has abandoned many planners; expects this one to die too |
   | `time_blind_student` | Loses hours without noticing; needs the timer idea to land instantly |
   | `journal_guilt` | Stopped journalling and feels bad about it; alert to "another chore" |
   | `privacy_skeptic` | Reads the data answer closely; reacts to analytics and AI mentions |
   | `medical_claim_wary` | Distrusts anything that sounds like an ADHD cure or diagnosis |
   | `non_adhd_power_user` | No ADHD framing; wonders if the product is for them at all |

   Keep N small enough to read every response (a handful per bucket is plenty).
   Give each persona an ID such as `P01`, a bucket, a language (`zh`/`en`), and
   two or three sentences of context. No names, no photos, no real demographics
   copied from any person.
3. **Run each persona separately.** One prompt per persona (subagents are fine)
   containing: the persona card, how they arrived (e.g. shared link, search),
   the exact copy in their language, and the response schema below. Ask for
   JSON only. Do not show personas each other's answers.
4. **Collect** one JSON object per line into a scratch file (keep raw output
   out of the repo unless it is short and clearly labelled synthetic).
5. **Aggregate** with the bundled script, then read the raw objections yourself:
   `python3 -I .claude/skills/synthetic-user-testing/scripts/aggregate.py run.jsonl`
6. **Write the summary** to `docs/research/synthetic/<yyyymmdd>-<topic>.md`
   (template below) and stop there. Copy changes go through the normal PR flow.

## Response schema (one JSON object per line)

| Field | Type | Meaning |
| --- | --- | --- |
| `persona_id` | string | e.g. `P03` |
| `bucket` | string | one of the bucket names above |
| `lang` | `"zh"` or `"en"` | language of the copy shown |
| `target` | string | what was shown, e.g. `landing.hero` |
| `comprehension` | int 1–5 | could they say what the product does? |
| `trust` | int 1–5 | do they believe it and feel safe trying it? |
| `would_try` | int 1–5 | would they click through to the demo or sign up? |
| `objection` | string | the single biggest reason not to try, in their words |
| `confusing_phrases` | list of strings | exact phrases from the copy that confused them |
| `restatement` | string, optional | the product in one sentence, as they understood it |

`confusing_phrases` must quote the copy verbatim so phrases can be counted.
The script skips malformed lines and lists them. `scripts/sample.jsonl` is a
made-up fixture for checking the script, not test data.

## Summary template

```markdown
# Synthetic test: <topic> (<yyyy-mm-dd>)

> SYNTHETIC — model-simulated personas. Hypotheses only; not user evidence.
> Do not cite in README, USER_FEEDBACK.md, pitches or metrics.

- Target and commit: <keys / file> @ <short sha>; languages: zh, en
- Personas: <N> across <buckets>; model: <model id>
- Aggregate table: <paste script output>
- Top objections by bucket: <2–4 bullets, attributed to persona IDs>
- Phrases to look at: <phrase → which buckets stumbled>
- Proposed copy changes (zh + en, voice-checked): <bullets or "none">
- Questions to test with real people: <bullets>
```

## Limits to state in every summary

Personas come from the same model that may have written the copy, so they
share its blind spots; they over-read carefully and never bounce the way a
real visitor does; scores are not comparable across runs or models.

Method adapted from Columbia AI Startup Studio coursework (rewritten; no course text or code reproduced).
