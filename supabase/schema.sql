-- Oshi Log: cloud sync schema for Supabase.
-- Run this once in your project's SQL Editor (Supabase dashboard → SQL Editor → New query → paste → Run).
-- Every row belongs to the signed-in user; row level security keeps each user's data private.

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table if not exists public.entries (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists entries_user_updated on public.entries (user_id, updated_at);
alter table public.entries enable row level security;
drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before insert or update on public.entries
  for each row execute function public.touch_updated_at();

create table if not exists public.members (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists members_user_updated on public.members (user_id, updated_at);
alter table public.members enable row level security;
drop policy if exists "own members" on public.members;
create policy "own members" on public.members for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists members_touch on public.members;
create trigger members_touch before insert or update on public.members
  for each row execute function public.touch_updated_at();

-- Private bucket for cheki scans, marche photos and videos. Files live under <user id>/<photo id>.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;

drop policy if exists "own photos select" on storage.objects;
drop policy if exists "own photos insert" on storage.objects;
drop policy if exists "own photos update" on storage.objects;
drop policy if exists "own photos delete" on storage.objects;
create policy "own photos select" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos insert" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos update" on storage.objects for update
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
