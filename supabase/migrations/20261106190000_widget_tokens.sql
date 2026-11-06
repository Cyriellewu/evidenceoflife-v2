-- Personal access keys for the iOS home-screen widget (Scriptable).
--
-- The widget cannot do an OAuth or email sign-in, so the signed-in web app
-- mints a random key through the widget-api edge function. Only a SHA-256
-- hash is stored; the raw key is shown to the owner once. Keys are scoped
-- by the edge function to: read today's todos/places, add or tick a todo,
-- and add a moment (photo + location). Owners can list and revoke them.

create table if not exists public.widget_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'iPhone widget',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists widget_tokens_user_id_idx on public.widget_tokens(user_id);

alter table public.widget_tokens enable row level security;

create policy "Users can view their own widget tokens"
  on public.widget_tokens for select
  using (auth.uid() = user_id);

create policy "Users can delete their own widget tokens"
  on public.widget_tokens for delete
  using (auth.uid() = user_id);

-- No insert/update policies on purpose: keys are minted and touched only by
-- the widget-api edge function (service role), never written from the client.
