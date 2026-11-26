-- HRMS Manager database: tables, constraints and security (RLS).
--
-- 1. Run this whole file once in the Supabase SQL Editor.
-- 2. Then set the laboratory password, in a separate query:
--      select public.set_lab_password('the laboratory password');
--
-- No user accounts are needed: the website sends the password with every request and
-- the database only answers when it matches. The file is safe to run again; it keeps every sample.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.samples (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,
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

-- Earlier versions tied each sample to a Supabase account. Samples no longer need one,
-- and deleting an old account must never delete samples.
alter table public.samples alter column user_id drop not null;
alter table public.samples alter column user_id drop default;
alter table public.samples drop constraint if exists samples_user_id_fkey;

create index if not exists samples_created_idx on public.samples (created_at desc);

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

-- Laboratory password: stored only as a bcrypt hash, never readable from the website.
create table if not exists public.lab_settings (
  id            boolean primary key default true check (id),
  password_hash text not null,
  updated_at    timestamptz not null default now()
);
alter table public.lab_settings enable row level security;
revoke all on public.lab_settings from anon, authenticated;

create or replace function public.set_lab_password(new_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(new_password, '')) < 6 then
    raise exception 'The password must have at least 6 characters.';
  end if;
  insert into public.lab_settings (id, password_hash)
  values (true, extensions.crypt(new_password, extensions.gen_salt('bf', 8)))
  on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now();
end;
$$;
revoke all on function public.set_lab_password(text) from public, anon, authenticated;

-- True when the request carries the laboratory password in the x-lab-password header.
create or replace function public.lab_password_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.password_hash = extensions.crypt(h.pw, s.password_hash)
    from public.lab_settings s,
         (select nullif(current_setting('request.headers', true), '')::json ->> 'x-lab-password' as pw) h
    where h.pw is not null
  ), false);
$$;
revoke all on function public.lab_password_ok() from public;
grant execute on function public.lab_password_ok() to anon, authenticated;

-- Row Level Security: the shared database answers only to requests with the password.
alter table public.samples enable row level security;

drop policy if exists "samples_select_own" on public.samples;
drop policy if exists "samples_insert_own" on public.samples;
drop policy if exists "samples_update_own" on public.samples;
drop policy if exists "samples_delete_own" on public.samples;
drop policy if exists "samples_select_shared" on public.samples;
drop policy if exists "samples_insert_shared" on public.samples;
drop policy if exists "samples_update_shared" on public.samples;
drop policy if exists "samples_delete_shared" on public.samples;

drop policy if exists "samples_select_lab" on public.samples;
create policy "samples_select_lab" on public.samples
  for select to anon, authenticated
  using ((select public.lab_password_ok()));

drop policy if exists "samples_insert_lab" on public.samples;
create policy "samples_insert_lab" on public.samples
  for insert to anon, authenticated
  with check ((select public.lab_password_ok()));

drop policy if exists "samples_update_lab" on public.samples;
create policy "samples_update_lab" on public.samples
  for update to anon, authenticated
  using ((select public.lab_password_ok()))
  with check ((select public.lab_password_ok()));

drop policy if exists "samples_delete_lab" on public.samples;
create policy "samples_delete_lab" on public.samples
  for delete to anon, authenticated
  using ((select public.lab_password_ok()));

grant select, insert, update, delete on public.samples to anon, authenticated;
