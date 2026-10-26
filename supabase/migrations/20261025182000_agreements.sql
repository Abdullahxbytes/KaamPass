create type public.agreement_pricing_model as enum ('fixed_total', 'daily_rate');
create type public.materials_responsibility as enum ('employer', 'worker', 'shared');
create type public.agreement_status as enum ('pending', 'accepted', 'rejected');

create function public.valid_agreement_trade_details(
  profession public.worker_profession,
  details jsonb
) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed_keys text[];
  numeric_key text;
  numeric_value integer;
begin
  if jsonb_typeof(details) <> 'object' or pg_column_size(details) > 4096 then
    return false;
  end if;
  if jsonb_typeof(details -> 'work_type') <> 'string'
    or char_length(btrim(details ->> 'work_type')) not between 2 and 120 then
    return false;
  end if;

  allowed_keys := case profession
    when 'electrician' then array['work_type', 'circuit_count']
    when 'plumber' then array['work_type', 'fixture_count']
    when 'painter' then array['work_type', 'area_square_feet', 'coats']
  end;
  if details - allowed_keys <> '{}'::jsonb then return false; end if;

  foreach numeric_key in array array['circuit_count', 'fixture_count', 'area_square_feet', 'coats'] loop
    if details ? numeric_key then
      if jsonb_typeof(details -> numeric_key) <> 'number'
        or (details ->> numeric_key) !~ '^[0-9]+$' then
        return false;
      end if;
      numeric_value := (details ->> numeric_key)::integer;
      if numeric_key in ('circuit_count', 'fixture_count') and numeric_value not between 1 and 100 then return false; end if;
      if numeric_key = 'area_square_feet' and numeric_value not between 1 and 1000000 then return false; end if;
      if numeric_key = 'coats' and numeric_value not between 1 and 10 then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

create table public.work_agreements (
  id uuid primary key default extensions.gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(user_id) on delete restrict,
  worker_id uuid not null,
  profession public.worker_profession not null,
  description text not null check (char_length(btrim(description)) between 5 and 2000),
  work_days smallint not null check (work_days between 1 and 365),
  pricing_model public.agreement_pricing_model not null,
  amount_minor bigint not null check (amount_minor between 1 and 1000000000),
  total_minor bigint not null check (total_minor between 1 and 1000000000),
  currency_code text not null default 'PKR' check (currency_code = 'PKR'),
  materials_responsibility public.materials_responsibility not null,
  trade_details jsonb not null check (public.valid_agreement_trade_details(profession, trade_details)),
  status public.agreement_status not null default 'pending',
  rejection_reason text check (char_length(rejection_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  foreign key (worker_id, profession) references public.worker_profiles(user_id, profession) on delete restrict,
  check (
    total_minor = case
      when pricing_model = 'daily_rate' then amount_minor * work_days
      else amount_minor
    end
  ),
  check (
    (status = 'pending' and responded_at is null and rejection_reason is null)
    or (status = 'accepted' and responded_at is not null and rejection_reason is null)
    or (status = 'rejected' and responded_at is not null)
  )
);

create index work_agreements_worker_status_idx
  on public.work_agreements(worker_id, status, created_at desc);
create index work_agreements_employer_created_idx
  on public.work_agreements(employer_id, created_at desc);

alter table public.work_agreements enable row level security;
revoke all on public.work_agreements from public, anon, authenticated;
grant select, insert, update, delete on public.work_agreements to service_role;
revoke all on function public.valid_agreement_trade_details(public.worker_profession, jsonb)
  from public, anon, authenticated;
