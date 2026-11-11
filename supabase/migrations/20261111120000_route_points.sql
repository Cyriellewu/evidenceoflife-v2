-- Day route: location points recorded by the web app while it is open
-- (opt-in switch in Map → Day route). Synced so a route recorded on the
-- phone shows on the desktop Recap.
--
-- Kept deliberately small for egress: the client reads only (t, lat, lng)
-- for one user and one day at a time, paged and ordered by t, and only asks
-- for points newer than the last one it already has.
-- (user_id, t) is unique so a retried upload is a no-op (insert … on
-- conflict do nothing; there is no update policy).
-- Retention: the client deletes its own rows older than 90 days, at most
-- once a day (pg_cron is not enabled on this project).

create table if not exists public.route_points (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  t timestamptz not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  acc integer check (acc is null or acc >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, t),
  -- `day` is the device's local day; it can differ from the UTC date by one.
  check (day between (t at time zone 'UTC')::date - 1 and (t at time zone 'UTC')::date + 1)
);

create index if not exists route_points_user_day_t_idx on public.route_points(user_id, day, t);

alter table public.route_points enable row level security;

create policy "Users can view their own route points"
  on public.route_points for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can add their own route points"
  on public.route_points for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own route points"
  on public.route_points for delete to authenticated
  using (auth.uid() = user_id);

-- Server-side limits the client also applies: points must be recent (not
-- backfilled history or future-dated) and a day holds at most 1500 points.
-- Rows that break a limit, or that are already stored, are skipped quietly
-- (return null) so one bad point never fails a whole upload batch.
create or replace function public.route_points_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.t < now() - interval '35 days' or new.t > now() + interval '1 day' then
    return null;
  end if;
  if exists (select 1 from public.route_points where user_id = new.user_id and t = new.t) then
    return null;
  end if;
  if (select count(*) from public.route_points
      where user_id = new.user_id and day = new.day) >= 1500 then
    return null;
  end if;
  return new;
end;
$$;

create trigger route_points_guard
  before insert on public.route_points
  for each row execute function public.route_points_guard();
