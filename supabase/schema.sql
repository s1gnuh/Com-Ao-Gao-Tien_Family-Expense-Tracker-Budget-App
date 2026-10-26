-- Cơm Áo Gạo Tiền — schema + RLS
-- Run in Supabase SQL Editor. Idempotent enough to re-run during setup.

create extension if not exists "pgcrypto";

do $$ begin create type wallet_type as enum ('personal', 'shared'); exception when duplicate_object then null; end $$;
do $$ begin create type category_kind as enum ('fixed', 'variable'); exception when duplicate_object then null; end $$;
do $$ begin create type transaction_type as enum ('income', 'expense'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_emoji text default '🙂',
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type wallet_type not null default 'personal',
  owner_id uuid references public.profiles (id) on delete cascade,
  currency text not null default 'VND',
  created_at timestamptz not null default now(),
  -- A personal wallet always has an owner; the shared family wallet never does.
  constraint wallet_owner_matches_type check (
    (type = 'personal' and owner_id is not null) or
    (type = 'shared' and owner_id is null)
  )
);

-- At most one shared family wallet.
create unique index if not exists wallets_one_shared on public.wallets (type) where type = 'shared';
create index if not exists wallets_owner_idx on public.wallets (owner_id);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  kind category_kind not null default 'variable',
  is_system boolean not null default false
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  type transaction_type not null default 'expense',
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  occurred_at date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'ai_receipt')),
  receipt_url text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_wallet_date_idx on public.transactions (wallet_id, occurred_at desc);
create index if not exists transactions_category_idx on public.transactions (category_id);
-- The reporting functions below scan by date across every wallet the caller can
-- reach, which the wallet-leading index above cannot serve.
create index if not exists transactions_date_idx on public.transactions (occurred_at desc);
create index if not exists transactions_author_idx on public.transactions (created_by);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  limit_amount numeric(14, 2) not null check (limit_amount > 0),
  period text not null default 'monthly' check (period = 'monthly'),
  unique (wallet_id, category_id, period)
);

-- ---------------------------------------------------------------- helpers

-- security definer so the policy below can read wallets without recursing into
-- the wallets policy itself.
create or replace function public.can_access_wallet(w uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.wallets
    where id = w and (owner_id = auth.uid() or type = 'shared')
  );
$$;

-- Every new auth user gets a profile and their own personal wallet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name text := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, display_name) values (new.id, name)
  on conflict (id) do nothing;

  insert into public.wallets (name, type, owner_id)
  values ('Ví của ' || name, 'personal', new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

-- Profiles: the four household members can see each other (shared-wallet rows
-- show who added them), but only edit themselves.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Wallets: your own personal wallet, plus the shared one.
drop policy if exists wallets_select on public.wallets;
create policy wallets_select on public.wallets
  for select to authenticated using (owner_id = auth.uid() or type = 'shared');

drop policy if exists wallets_insert_own on public.wallets;
create policy wallets_insert_own on public.wallets
  for insert to authenticated with check (type = 'personal' and owner_id = auth.uid());

drop policy if exists wallets_update_own on public.wallets;
create policy wallets_update_own on public.wallets
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists wallets_delete_own on public.wallets;
create policy wallets_delete_own on public.wallets
  for delete to authenticated using (owner_id = auth.uid());

-- Categories are a shared vocabulary for the household.
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated using (true);

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all to authenticated using (not is_system) with check (not is_system);

-- Transactions: readable in any wallet you can reach. Only the author can
-- change or delete a row, so shared-wallet history cannot be rewritten by others.
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated using (public.can_access_wallet(wallet_id));

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (public.can_access_wallet(wallet_id) and created_by = auth.uid());

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
  for delete to authenticated using (created_by = auth.uid());

-- Budgets follow wallet access; the shared budget is set collaboratively.
drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets
  for select to authenticated using (public.can_access_wallet(wallet_id));

drop policy if exists budgets_write on public.budgets;
create policy budgets_write on public.budgets
  for all to authenticated
  using (public.can_access_wallet(wallet_id)) with check (public.can_access_wallet(wallet_id));

-- ---------------------------------------------------------------- views

-- Balance is a sum over every transaction a wallet ever had, so computing it in
-- the client would mean shipping the whole history to the phone on each load.
-- security_invoker keeps the caller's RLS in force, so this exposes no wallet
-- the caller could not already read.
create or replace view public.wallet_balances
with (security_invoker = true) as
select
  w.id as wallet_id,
  w.name,
  w.type,
  w.owner_id,
  coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0)::numeric(14, 2) as balance
from public.wallets w
left join public.transactions t on t.wallet_id = w.id
group by w.id, w.name, w.type, w.owner_id;

-- ------------------------------------------------------- reporting functions

-- These aggregate in Postgres and return a handful of rows, so a phone never
-- downloads raw transactions just to add them up. All are security invoker, so
-- the caller's RLS decides which wallets are counted — they can reveal nothing
-- a plain select would not.

create or replace function public.monthly_cashflow(
  p_months int default 6,
  p_wallet uuid default null
)
returns table (month date, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc('month', t.occurred_at)::date,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
  from public.transactions t
  where t.occurred_at >= (date_trunc('month', current_date) - make_interval(months => greatest(p_months, 1) - 1))::date
    and (p_wallet is null or t.wallet_id = p_wallet)
  group by 1
  order by 1;
$$;

create or replace function public.daily_totals(
  p_from date,
  p_to date,
  p_wallet uuid default null
)
returns table (day date, income numeric, expense numeric, tx_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.occurred_at,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(*)
  from public.transactions t
  where t.occurred_at between p_from and p_to
    and (p_wallet is null or t.wallet_id = p_wallet)
  group by t.occurred_at
  order by t.occurred_at;
$$;

create or replace function public.category_breakdown(
  p_from date,
  p_to date,
  p_wallet uuid default null
)
returns table (category_id uuid, name text, icon text, kind category_kind, spent numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.icon,
    c.kind,
    coalesce(sum(t.amount), 0)
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.type = 'expense'
    and t.occurred_at between p_from and p_to
    and (p_wallet is null or t.wallet_id = p_wallet)
  group by c.id, c.name, c.icon, c.kind
  order by 5 desc;
$$;

-- ---------------------------------------------------------------- realtime

alter table public.transactions replica identity full;
alter table public.budgets replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.budgets;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- seed

insert into public.wallets (name, type, owner_id)
select 'Ví gia đình', 'shared', null
where not exists (select 1 from public.wallets where type = 'shared');

insert into public.categories (name, icon, kind, is_system) values
  ('Ăn uống',    '🍜', 'variable', true),
  ('Chợ búp',    '🛒', 'variable', true),
  ('Di chuyển',  '🛵', 'variable', true),
  ('Mua sắm',    '🛍️', 'variable', true),
  ('Giải trí',   '🎬', 'variable', true),
  ('Sức khoẻ',   '💊', 'variable', true),
  ('Nhà cửa',    '🏠', 'fixed',    true),
  ('Hoá đơn',    '💡', 'fixed',    true),
  ('Giáo dục',   '📚', 'fixed',    true),
  ('Bảo hiểm',   '🛡️', 'fixed',    true),
  ('Thu nhập',   '💰', 'fixed',    true),
  ('Khác',       '📦', 'variable', true)
on conflict (name) do nothing;
