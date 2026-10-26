create type public.job_status as enum ('active', 'awaiting_confirmation', 'verified', 'confirmation_disputed');

create table public.jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  agreement_id uuid not null unique references public.work_agreements(id) on delete cascade,
  status public.job_status not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;
revoke all on public.jobs from public, anon, authenticated;
grant select, insert, update, delete on public.jobs to service_role;

create function public.protect_accepted_agreement() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'accepted' and new is distinct from old then
    raise exception 'Accepted agreement terms cannot be changed';
  end if;
  return new;
end;
$$;

create trigger protect_accepted_agreement before update on public.work_agreements
for each row execute function public.protect_accepted_agreement();

create function public.create_job_for_accepted_agreement() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'accepted' then
    insert into public.jobs (agreement_id) values (new.id)
    on conflict (agreement_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger create_job_for_accepted_agreement
after insert or update of status on public.work_agreements
for each row execute function public.create_job_for_accepted_agreement();

insert into public.jobs (agreement_id, created_at)
select id, coalesce(responded_at, created_at) from public.work_agreements
where status = 'accepted' on conflict (agreement_id) do nothing;

revoke all on function public.protect_accepted_agreement() from public, anon, authenticated;
revoke all on function public.create_job_for_accepted_agreement() from public, anon, authenticated;
