alter table public.jobs
  add column completed_days integer check (completed_days between 1 and 365),
  add column paid_amount_minor bigint check (paid_amount_minor between 0 and 1000000000),
  add column completed_at timestamptz,
  add column responded_at timestamptz,
  add column dispute_reason text check (char_length(dispute_reason) between 1 and 500),
  add constraint jobs_completion_consistent check (
    (status = 'active' and completed_days is null and paid_amount_minor is null and completed_at is null and responded_at is null and dispute_reason is null)
    or (status = 'awaiting_confirmation' and completed_days is not null and paid_amount_minor is not null and completed_at is not null and responded_at is null and dispute_reason is null)
    or (status = 'verified' and completed_days is not null and paid_amount_minor is not null and completed_at is not null and responded_at is not null and dispute_reason is null)
    or (status = 'confirmation_disputed' and completed_days is not null and paid_amount_minor is not null and completed_at is not null and responded_at is not null)
  );

create table public.verified_work_records (
  id uuid primary key default extensions.gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(user_id),
  employer_id uuid not null references public.employer_profiles(user_id),
  work_days integer not null check (work_days between 1 and 365),
  paid_amount_minor bigint not null check (paid_amount_minor between 0 and 1000000000),
  verified_at timestamptz not null default now()
);
alter table public.verified_work_records enable row level security;
revoke all on public.verified_work_records from public, anon, authenticated;
grant select, insert, delete on public.verified_work_records to service_role;

create function public.complete_job(p_job_id uuid, p_employer_id uuid, p_days integer, p_paid bigint)
returns text language plpgsql security invoker set search_path = '' as $$
declare j public.jobs%rowtype;
begin
  if p_days is null or p_days not between 1 and 365 or p_paid is null or p_paid not between 0 and 1000000000 then
    return 'invalid';
  end if;
  select jobs.* into j from public.jobs jobs
    join public.work_agreements a on a.id = jobs.agreement_id
    where jobs.id = p_job_id and a.employer_id = p_employer_id for update of jobs;
  if not found then return 'not_found'; end if;
  if j.status <> 'active' then
    if j.completed_days = p_days and j.paid_amount_minor = p_paid then return 'ok'; end if;
    return 'conflict';
  end if;
  update public.jobs set status = 'awaiting_confirmation', completed_days = p_days,
    paid_amount_minor = p_paid, completed_at = now() where id = p_job_id;
  return 'ok';
end;
$$;

create function public.respond_job_completion(p_job_id uuid, p_worker_id uuid, p_confirm boolean, p_reason text)
returns text language plpgsql security invoker set search_path = '' as $$
declare j public.jobs%rowtype; a public.work_agreements%rowtype;
begin
  if p_confirm is null or (p_confirm and p_reason is not null)
    or (p_reason is not null and char_length(btrim(p_reason)) not between 1 and 500) then return 'invalid'; end if;
  select jobs.* into j from public.jobs jobs
    join public.work_agreements agreement on agreement.id = jobs.agreement_id
    where jobs.id = p_job_id and agreement.worker_id = p_worker_id for update of jobs;
  if not found then return 'not_found'; end if;
  if j.status <> 'awaiting_confirmation' then
    if (p_confirm and j.status = 'verified') or
      (not p_confirm and j.status = 'confirmation_disputed' and j.dispute_reason is not distinct from p_reason) then return 'ok'; end if;
    return 'conflict';
  end if;
  if p_confirm then
    select * into a from public.work_agreements where id = j.agreement_id;
    insert into public.verified_work_records(job_id, worker_id, employer_id, work_days, paid_amount_minor)
      values (j.id, a.worker_id, a.employer_id, j.completed_days, j.paid_amount_minor);
    update public.jobs set status = 'verified', responded_at = now() where id = p_job_id;
  else
    update public.jobs set status = 'confirmation_disputed', responded_at = now(), dispute_reason = p_reason where id = p_job_id;
  end if;
  return 'ok';
end;
$$;

revoke all on function public.complete_job(uuid, uuid, integer, bigint) from public, anon, authenticated;
revoke all on function public.respond_job_completion(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.complete_job(uuid, uuid, integer, bigint) to service_role;
grant execute on function public.respond_job_completion(uuid, uuid, boolean, text) to service_role;
