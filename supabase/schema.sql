-- HRMS Manager: taules, restriccions i polítiques de seguretat (RLS).
-- Executa aquest fitxer sencer al SQL Editor de Supabase. Es pot tornar a executar.

create table if not exists public.samples (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sample_code       text not null check (char_length(btrim(sample_code)) between 1 and 35),
  molecular_formula text not null check (char_length(molecular_formula) between 1 and 80),
  monoisotopic_mass numeric(16, 6) not null check (monoisotopic_mass > 0),
  mz_1              numeric(16, 6) not null check (mz_1 > 0),
  mz_2              numeric(16, 6) not null check (mz_2 > 0),
  mz_3              numeric(16, 6) not null check (mz_3 > 0),
  mz_4              numeric(16, 6) not null check (mz_4 > 0),
  mz_5              numeric(16, 6) not null check (mz_5 > 0),
  mz_6              numeric(16, 6) not null check (mz_6 > 0),
  mz_7              numeric(16, 6) not null check (mz_7 > 0),
  mz_8              numeric(16, 6) not null check (mz_8 > 0),
  confidence        text not null check (confidence in ('High', 'Medium', 'Low')),
  purity            text not null check (purity in ('Pure', 'Impure')),
  publication       text not null check (publication in ('Yes', 'No')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.samples add column if not exists author text not null default ''
  check (char_length(author) <= 80);
alter table public.samples add column if not exists analyzed_by text not null default ''
  check (char_length(analyzed_by) <= 80);

create index if not exists samples_user_created_idx on public.samples (user_id, created_at desc);

create table if not exists public.user_preferences (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name           text not null default '' check (char_length(name) <= 120),
  email          text not null default '' check (char_length(email) <= 160),
  research_group text not null default '' check (char_length(research_group) <= 160),
  updated_at     timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists samples_set_updated_at on public.samples;
create trigger samples_set_updated_at
  before update on public.samples
  for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- Row Level Security: cada usuari només veu i modifica les seves files.
alter table public.samples enable row level security;
alter table public.user_preferences enable row level security;

drop policy if exists "samples_select_own" on public.samples;
create policy "samples_select_own" on public.samples
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "samples_insert_own" on public.samples;
create policy "samples_insert_own" on public.samples
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "samples_update_own" on public.samples;
create policy "samples_update_own" on public.samples
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "samples_delete_own" on public.samples;
create policy "samples_delete_own" on public.samples
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "preferences_select_own" on public.user_preferences;
create policy "preferences_select_own" on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "preferences_insert_own" on public.user_preferences;
create policy "preferences_insert_own" on public.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "preferences_update_own" on public.user_preferences;
create policy "preferences_update_own" on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Sense sessió iniciada no hi ha cap accés.
revoke all on public.samples from anon;
revoke all on public.user_preferences from anon;
grant select, insert, update, delete on public.samples to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
