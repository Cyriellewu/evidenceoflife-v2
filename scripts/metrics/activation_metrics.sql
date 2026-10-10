-- ============================================================================
-- Evidence of Life — activation & early-retention metrics (read-only)
-- ----------------------------------------------------------------------------
-- SAFE: SELECT-only, aggregate-only. Returns no ids, names, emails, text,
-- photos or coordinates. Definitions: docs/metrics/metric-definitions.md
-- ("Activation and retention").
--
-- BEFORE RUNNING: put maintainer/test emails in excluded_users.
-- ============================================================================

with excluded_users as (
  select id
  from auth.users
  where lower(email) = any (array[
    'REPLACE_MAINTAINER_EMAIL@example.com'
  ])
),

registered as (
  select u.id, u.created_at
  from auth.users u
  where u.id not in (select id from excluded_users)
),

-- Plan items only: steps ('_step_') and deadlines ('_due_…') are not plan items.
plan_items as (
  select user_id, created_at
  from public.todos
  where date <> '_step_' and date not like '\_due\_%' escape '\'
),

moment_rows as (
  select user_id, created_at, coalesce('focus-session' = any(tags), false) as is_focus_session
  from public.moments
),

per_user as (
  select
    r.id,
    r.created_at,
    exists (
      select 1 from plan_items p
      where p.user_id = r.id and p.created_at < r.created_at + interval '72 hours'
    ) as planned_72h,
    exists (
      select 1 from moment_rows m
      where m.user_id = r.id and m.created_at < r.created_at + interval '72 hours'
    ) as moment_72h,
    exists (
      select 1 from moment_rows m
      where m.user_id = r.id and not m.is_focus_session
        and m.created_at < r.created_at + interval '72 hours'
    ) as manual_moment_72h,
    exists (
      select 1 from (
        select user_id, created_at from plan_items
        union all
        select user_id, created_at from moment_rows
      ) a
      where a.user_id = r.id
        and a.created_at::date > r.created_at::date
        and a.created_at < r.created_at + interval '7 days'
    ) as returned_d1_7
  from registered r
)

select
  count(*)                                                                  as registered_users,
  count(*) filter (where created_at <= now() - interval '72 hours')         as eligible_72h,
  count(*) filter (where created_at <= now() - interval '72 hours'
                     and planned_72h and moment_72h)                        as activated_72h_incl_focus,
  count(*) filter (where created_at <= now() - interval '72 hours'
                     and planned_72h and manual_moment_72h)                 as activated_72h_manual_only,
  count(*) filter (where created_at <= now() - interval '7 days')           as eligible_d7,
  count(*) filter (where created_at <= now() - interval '7 days'
                     and returned_d1_7)                                     as returned_d1_7
from per_user;
