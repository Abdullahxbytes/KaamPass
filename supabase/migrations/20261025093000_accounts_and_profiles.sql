create type public.account_role as enum ('worker', 'employer');
create type public.worker_profession as enum ('electrician', 'plumber', 'painter');
create type public.preferred_language as enum ('en', 'ur-roman', 'ur');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.account_role not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 100),
  preferred_language public.preferred_language not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, role)
);

-- Restrict both the shape and size of the optional profession-specific fields.
create function public.valid_trade_details(
  profession public.worker_profession,
  details jsonb
) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed_keys text[];
  array_key text;
begin
  if jsonb_typeof(details) <> 'object' or pg_column_size(details) > 4096 then
    return false;
  end if;

  allowed_keys := case profession
    when 'electrician' then array['tools', 'safety_experience', 'emergency_available']
    when 'plumber' then array['tools', 'materials', 'emergency_available']
    when 'painter' then array['paint_types', 'area_experience']
  end;

  if details - allowed_keys <> '{}'::jsonb then
    return false;
  end if;

  foreach array_key in array array['tools', 'materials', 'paint_types'] loop
    if details ? array_key then
      if jsonb_typeof(details -> array_key) <> 'array' then
        return false;
      end if;
      if jsonb_array_length(details -> array_key) > 20 or exists (
        select 1 from jsonb_array_elements(details -> array_key) as item
        where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 100
      ) then
        return false;
      end if;
    end if;
  end loop;

  if details ? 'emergency_available' and jsonb_typeof(details -> 'emergency_available') <> 'boolean' then
    return false;
  end if;
  if details ? 'safety_experience' and (jsonb_typeof(details -> 'safety_experience') <> 'string' or char_length(details ->> 'safety_experience') > 500) then
    return false;
  end if;
  if details ? 'area_experience' and (jsonb_typeof(details -> 'area_experience') <> 'string' or char_length(details ->> 'area_experience') > 500) then
    return false;
  end if;
  return true;
end;
$$;

create table public.worker_profiles (
  user_id uuid primary key,
  profile_role public.account_role not null default 'worker' check (profile_role = 'worker'),
  profession public.worker_profession not null,
  public_id uuid not null unique default extensions.gen_random_uuid(),
  service_area text not null check (char_length(btrim(service_area)) between 1 and 120),
  experience_years smallint not null default 0 check (experience_years between 0 and 100),
  bio text check (char_length(bio) <= 2000),
  availability text check (char_length(availability) <= 200),
  typical_rate_minor bigint check (typical_rate_minor >= 0),
  currency_code text not null default 'PKR' check (currency_code = 'PKR'),
  trade_details jsonb not null default '{}'::jsonb check (public.valid_trade_details(profession, trade_details)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, profile_role) references public.profiles(id, role) on delete cascade,
  unique (user_id, profession)
);

create table public.employer_profiles (
  user_id uuid primary key,
  profile_role public.account_role not null default 'employer' check (profile_role = 'employer'),
  employer_type text not null check (employer_type in ('household', 'contractor', 'small_business', 'shop', 'workshop', 'construction_business')),
  organization_name text check (char_length(organization_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, profile_role) references public.profiles(id, role) on delete cascade
);

create table public.skills (
  id uuid primary key default extensions.gen_random_uuid(),
  profession public.worker_profession not null,
  slug text not null check (slug ~ '^[a-z][a-z0-9_]{1,63}$'),
  unique (profession, slug),
  unique (id, profession)
);

create table public.worker_skills (
  worker_id uuid not null,
  skill_id uuid not null,
  profession public.worker_profession not null,
  created_at timestamptz not null default now(),
  primary key (worker_id, skill_id),
  foreign key (worker_id, profession) references public.worker_profiles(user_id, profession) on delete cascade,
  foreign key (skill_id, profession) references public.skills(id, profession) on delete restrict
);

create index worker_profiles_profession_idx on public.worker_profiles(profession);
create index worker_skills_skill_id_idx on public.worker_skills(skill_id);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger worker_profiles_updated_at before update on public.worker_profiles
for each row execute function public.set_updated_at();
create trigger employer_profiles_updated_at before update on public.employer_profiles
for each row execute function public.set_updated_at();

-- Registration metadata chooses only an ordinary worker/employer role. It never
-- grants elevated database privileges; invalid or missing values fail closed.
create function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, preferred_language)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'role')::public.account_role,
    btrim(new.raw_user_meta_data ->> 'full_name'),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en')::public.preferred_language
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.employer_profiles enable row level security;
alter table public.skills enable row level security;
alter table public.worker_skills enable row level security;

-- Module 2.3 will add carefully scoped policies. Until then all application
-- data access goes through the verified Express API and its server-only client.
revoke all on public.profiles, public.worker_profiles, public.employer_profiles, public.skills, public.worker_skills from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.worker_profiles, public.employer_profiles, public.skills, public.worker_skills to service_role;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
