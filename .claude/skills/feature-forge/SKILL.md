---
name: feature-forge
description: >-
  Lightweight feature workflow for Evidence of Life changes that touch three or
  more files: a one-page brief with a measurable success metric, a test list
  written before code, then the AGENTS.md review loop, then a post-merge metric
  check. Use for "new feature", "build X", "feature-forge". Skip for typos,
  one-file fixes and docs-only edits.
---

# Feature forge

A thin layer on top of `AGENTS.md`. It adds two things AGENTS.md does not ask
for: a success metric decided *before* building, and a follow-up that checks it
*after* merging. Everything else (planning roles, critics, verification,
security PR split) stays in AGENTS.md and is not repeated here.

## When to use

- The change touches **3+ files**, or adds user-visible behaviour.
- Not for: typo fixes, single-file bug fixes, dependency bumps, docs-only work.

## 1. One-page brief (before any edit)

Write it in the PR description draft or the reply. Keep it to one screen:

```markdown
### Brief: <feature>
- Problem: <who hits what, in one or two sentences; cite a feedback issue or
  interview snapshot if one exists, otherwise say "assumption">
- Change: <what the user will be able to do>
- Success metric (required): <event and/or SQL definition from
  docs/metrics/metric-definitions.md> — expected direction (up/down), and
  the check date
- Guardrail: <a metric that must not get worse, if any>
- Alternatives considered: <2–3 options incl. "do nothing" / cut a feature,
  and why rejected>
- Will not change: <data model, auth, design tokens, demo mode, copy … as relevant>
- Risk class: <data/egress, auth, UI, docs>
```

Rules for the metric:

- It must name something that already exists in
  `docs/metrics/metric-definitions.md` (an event such as `first_run_step_completed`
  or a SQL definition such as `activated_72h` / `returned_d1_7`).
- If nothing fits, the brief says so and proposes the new event or query as its
  own small change first, documented in that file. Do not invent a metric in
  the PR text only.
- State a direction, not a made-up target number. No baseline exists until the
  read-only SQL in `scripts/metrics/` has been run and reviewed.
- Events must respect the privacy rules in that file (no task/note/moment
  text, no emails, no coordinates, nothing from demo mode).

## 2. Test list first

Before implementation, list the tests by name and what each proves:

- unit tests (Vitest + Testing Library) for new logic and edge cases;
- whether the `/demo-app` Playwright smoke or its selectors are affected;
- analytics: a test that the metric's event fires (or does not fire in demo).

Write the failing tests first where practical, then make them pass. If a test
is not feasible, say why in the PR.

## 3. Build and review: defer to AGENTS.md

Follow `AGENTS.md` for the planner → critics → orchestrator → implementer →
verifier loop (`.claude/agents/`), the required verification commands, and the
rule that security-sensitive paths go in a separate PR. Feed the brief and the
test list into the planner; critics may challenge the metric choice too.

In the PR, fill `.github/PULL_REQUEST_TEMPLATE.md`, including the optional
success-metric line under Summary.

## 4. After merge: check the metric

1. Pick N days in the brief (long enough for the event or SQL window to fill,
   e.g. the 72h activation window plus enough new sign-ups to read anything).
2. On the check date, run the read-only query or look at the event in the
   analytics tool. Record the exact query, project, date range and known gaps,
   as `metric-definitions.md` requires for any number.
3. Write the outcome as a comment on the merged PR or a linked issue:
   moved as expected / no visible change / worse / not measurable (and why).
4. If worse or not measurable, open an issue to revisit, revert or cut the
   feature. Small samples are reported as "too few to tell", not as a win.

Never publish these numbers outward (README, pitch, landing) unless they meet
the confidence-labelling rules in `docs/metrics/metric-definitions.md`.

Method adapted from Columbia AI Startup Studio coursework (rewritten; no course text or code reproduced).
