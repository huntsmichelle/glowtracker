-- GlowTracker Initial Schema
-- Run this in the Supabase SQL Editor (Database > SQL Editor > New query)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- Extends Supabase auth.users with app-specific fields.
-- A row is created automatically on signup via a trigger.
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Trigger: auto-create profile on new user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- CATEGORIES
-- Built-in categories seeded below; users can add custom ones.
-- ============================================================
create table categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  -- NULL user_id = system/default category visible to all users
  name text not null,
  color text default '#6B7280',  -- tailwind gray-500 hex
  is_default boolean default false,
  created_at timestamptz default now() not null
);

create index categories_user_id_idx on categories(user_id);

alter table categories enable row level security;

create policy "Users see own + default categories"
  on categories for select
  using (user_id = auth.uid() or user_id is null);

create policy "Users manage own categories"
  on categories for all
  using (user_id = auth.uid());

-- Seed default categories (user_id = NULL means system-wide)
insert into categories (name, color, is_default) values
  ('Hair', '#EC4899', true),
  ('Skin', '#F97316', true),
  ('Makeup', '#A855F7', true),
  ('Hair Removal', '#06B6D4', true),
  ('Nails', '#EAB308', true);

-- ============================================================
-- PRODUCTS
-- Exist as independent entities; can be shared across series.
-- ============================================================
create table products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  uses_per_supply_unit int,       -- e.g. 4 means 1 bottle = 4 colorings
  supply_warning_threshold int,   -- warn when Nth upcoming occurrence is near
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index products_user_id_idx on products(user_id);

alter table products enable row level security;

create policy "Users manage own products"
  on products for all using (user_id = auth.uid());

-- ============================================================
-- SERIES
-- A recurring routine (e.g., "Hair Color").
-- interval_min/max are stored in DAYS for precision.
-- ============================================================
create table series (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,                        -- shown on every occurrence
  interval_min_days int not null,          -- minimum days between occurrences
  interval_max_days int not null,          -- maximum days between occurrences
  default_reminder_days int default 2      -- days before due date to remind
    check (default_reminder_days >= 0 and default_reminder_days <= 14),
  is_active boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index series_user_id_idx on series(user_id);
create index series_category_id_idx on series(category_id);

alter table series enable row level security;

create policy "Users manage own series"
  on series for all using (user_id = auth.uid());

-- ============================================================
-- OCCURRENCES
-- Individual scheduled instances of a series.
-- ============================================================
create type occurrence_status as enum (
  'upcoming', 'due', 'completed', 'skipped', 'snoozed'
);

create table occurrences (
  id uuid primary key default uuid_generate_v4(),
  series_id uuid not null references series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Scheduling
  due_date_start date not null,            -- earliest date in the window
  due_date_end date not null,              -- latest date in the window
  interval_anchor_date date,               -- the completion date this was anchored to (audit trail)
  snooze_until date,                       -- set when status = snoozed

  -- Outcome
  status occurrence_status default 'upcoming' not null,
  actual_completion_date date,             -- logged by user; may differ from due dates
  notes text,                              -- occurrence-specific notes

  -- Media (Phase 2)
  before_photo_url text,
  after_photo_url text,

  -- Google Calendar (Phase 3) — field exists now, wired up later
  google_calendar_event_id text,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index occurrences_series_id_idx on occurrences(series_id);
create index occurrences_user_id_idx on occurrences(user_id);
create index occurrences_status_idx on occurrences(status);
create index occurrences_due_date_start_idx on occurrences(due_date_start);

alter table occurrences enable row level security;

create policy "Users manage own occurrences"
  on occurrences for all using (user_id = auth.uid());

-- ============================================================
-- SERIES_PRODUCTS
-- Junction: which products are linked to which series.
-- ============================================================
create table series_products (
  id uuid primary key default uuid_generate_v4(),
  series_id uuid not null references series(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(series_id, product_id)
);

create index series_products_series_id_idx on series_products(series_id);
create index series_products_product_id_idx on series_products(product_id);

alter table series_products enable row level security;

create policy "Users manage own series_products"
  on series_products for all using (user_id = auth.uid());

-- ============================================================
-- PREP_STEPS
-- Optional steps attached to a series, each with its own
-- reminder timing (e.g., "Buy developer 2 days before").
-- ============================================================
create table prep_steps (
  id uuid primary key default uuid_generate_v4(),
  series_id uuid not null references series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  reminder_days_before int default 1        -- days before due date to remind
    check (reminder_days_before >= 0 and reminder_days_before <= 30),
  sort_order int default 0,
  created_at timestamptz default now() not null
);

create index prep_steps_series_id_idx on prep_steps(series_id);

alter table prep_steps enable row level security;

create policy "Users manage own prep_steps"
  on prep_steps for all using (user_id = auth.uid());

-- ============================================================
-- LINKED_SERIES (Phase 4)
-- Two series whose occurrences may collide and need resolution.
-- ============================================================
create table linked_series (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_a_id uuid not null references series(id) on delete cascade,
  series_b_id uuid not null references series(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(series_a_id, series_b_id)
);

alter table linked_series enable row level security;

create policy "Users manage own linked_series"
  on linked_series for all using (user_id = auth.uid());

-- ============================================================
-- LINK_RESOLUTION_RULES (Phase 4)
-- Per-collision rule: do_both | reset | delay
-- ============================================================
create type link_resolution as enum ('do_both', 'reset', 'delay');

create table link_resolution_rules (
  id uuid primary key default uuid_generate_v4(),
  linked_series_id uuid not null references linked_series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resolution link_resolution not null default 'do_both',
  delay_days int,                   -- used when resolution = 'delay'
  which_series_delays uuid references series(id) on delete set null,
  created_at timestamptz default now() not null
);

alter table link_resolution_rules enable row level security;

create policy "Users manage own link_resolution_rules"
  on link_resolution_rules for all using (user_id = auth.uid());

-- ============================================================
-- UPDATED_AT trigger helper
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger series_updated_at before update on series
  for each row execute procedure update_updated_at();

create trigger occurrences_updated_at before update on occurrences
  for each row execute procedure update_updated_at();

create trigger products_updated_at before update on products
  for each row execute procedure update_updated_at();

create trigger profiles_updated_at before update on profiles
  for each row execute procedure update_updated_at();
