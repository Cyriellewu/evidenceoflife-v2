# Roadmap

> Direction, not promises. This is a spare-time, single-maintainer project;
> priorities shift with real usage. No dates are committed.

## Now (stability & openness)

- Complete the OSS foundation (license, governance docs, templates) — largely done.
- Apply pre-public hardening migration (private photos, calendar token policies)
  and redeploy edge functions with auth helpers.
- Enable GitHub Private Vulnerability Reporting in repo Settings → Security.
- Phase 2 security/privacy audit: verify ownership-based RLS on all personal
  tables against the **live** database (migrations alone are not enough).
- CI: lint remains advisory until the remaining eslint debt is cleared.

## Next (correctness & trust)

- Reproducible, privacy-safe aggregate usage metrics across the old and new
  Supabase projects (no double counting).
- Regression coverage for core flows: task lifecycle, focus sessions,
  interrupted/unfinished work, timezone/date rollover, calendar sync boundaries.
- Account data export + deletion completeness.

## Later (contributor experience)

- A small set of genuine "good first issue" items from validated backlog.
- Self-hosting guide verified end-to-end by someone other than the maintainer.
- First tagged release with accurate release notes.

## Explicit non-goals

- No medical/therapeutic claims. Positioning is design goals for ADHD-friendly
  execution, not treatment.
- No growth-hacking, fake activity, or vanity metrics.
