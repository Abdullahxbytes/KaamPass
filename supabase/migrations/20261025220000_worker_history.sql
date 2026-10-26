create index verified_work_records_worker_date_idx
  on public.verified_work_records(worker_id, verified_at desc, id desc);

create function public.worker_history(p_worker_id uuid, p_offset integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with records as (
    select r.*, a.description, a.profession, p.full_name as employer_name
    from public.verified_work_records r
    join public.jobs j on j.id = r.job_id
    join public.work_agreements a on a.id = j.agreement_id
    join public.profiles p on p.id = r.employer_id
    where r.worker_id = p_worker_id
  ),
  totals as (
    select count(*) as verified_jobs, coalesce(sum(work_days), 0) as work_days,
      coalesce(sum(paid_amount_minor), 0) as income_minor
    from records
  ),
  repeat_employers as (
    select count(*) as total from (
      select employer_id from records group by employer_id having count(*) >= 2
    ) grouped
  ),
  page as (
    select id, job_id, description, profession, employer_name, work_days, paid_amount_minor, verified_at
    from records order by verified_at desc, id desc limit 20 offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'stats', jsonb_build_object('verified_jobs', totals.verified_jobs, 'work_days', totals.work_days,
      'income_minor', totals.income_minor, 'repeat_employers', repeat_employers.total),
    'records', coalesce((select jsonb_agg(to_jsonb(page) order by verified_at desc, id desc) from page), '[]'::jsonb),
    'offset', greatest(p_offset, 0)
  ) from totals cross join repeat_employers;
$$;

revoke all on function public.worker_history(uuid, integer) from public, anon, authenticated;
grant execute on function public.worker_history(uuid, integer) to service_role;
