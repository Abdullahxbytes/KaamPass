-- A worker writes a separate public summary; private job descriptions never leave the account.
create table public.public_work_shares (
  record_id uuid primary key references public.verified_work_records(id) on delete cascade,
  summary text not null check (char_length(btrim(summary)) between 1 and 200)
);
alter table public.public_work_shares enable row level security;
revoke all on public.public_work_shares from public, anon, authenticated;
grant all on public.public_work_shares to service_role;

create function public.set_public_work_share(p_worker_id uuid, p_record_id uuid, p_summary text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.verified_work_records where id = p_record_id and worker_id = p_worker_id for update;
  if not found then return false; end if;
  if p_summary is null then
    delete from public.public_work_shares where record_id = p_record_id;
  else
    insert into public.public_work_shares(record_id, summary) values (p_record_id, p_summary)
    on conflict (record_id) do update set summary = excluded.summary;
  end if;
  return true;
end;
$$;
revoke all on function public.set_public_work_share(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_public_work_share(uuid, uuid, text) to service_role;

create or replace function public.worker_history(p_worker_id uuid, p_offset integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with records as (
    select r.*, a.description, a.profession, p.full_name as employer_name, s.summary as public_summary
    from public.verified_work_records r
    join public.jobs j on j.id = r.job_id
    join public.work_agreements a on a.id = j.agreement_id
    join public.profiles p on p.id = r.employer_id
    left join public.public_work_shares s on s.record_id = r.id
    where r.worker_id = p_worker_id
  ), totals as (
    select count(*) as verified_jobs, coalesce(sum(work_days), 0) as work_days, coalesce(sum(paid_amount_minor), 0) as income_minor from records
  ), repeat_employers as (
    select count(*) as total from (select employer_id from records group by employer_id having count(*) >= 2) grouped
  ), page as (
    select id, job_id, description, profession, employer_name, work_days, paid_amount_minor, verified_at, public_summary
    from records order by verified_at desc, id desc limit 20 offset greatest(p_offset, 0)
  )
  select jsonb_build_object('stats', jsonb_build_object('verified_jobs', totals.verified_jobs, 'work_days', totals.work_days,
    'income_minor', totals.income_minor, 'repeat_employers', repeat_employers.total),
    'records', coalesce((select jsonb_agg(to_jsonb(page) order by verified_at desc, id desc) from page), '[]'::jsonb),
    'offset', greatest(p_offset, 0)) from totals cross join repeat_employers;
$$;

create or replace function public.public_kaampass(p_public_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'public_id', w.public_id, 'full_name', p.full_name, 'profession', w.profession,
    'service_area', w.public_service_area, 'experience_years', w.experience_years,
    'skills', coalesce((select jsonb_agg(s.slug order by s.slug) from public.worker_skills ws
      join public.skills s on s.id = ws.skill_id where ws.worker_id = w.user_id), '[]'::jsonb),
    'stats', jsonb_build_object(
      'verified_jobs', (select count(*) from public.verified_work_records r where r.worker_id = w.user_id),
      'work_days', (select coalesce(sum(r.work_days), 0) from public.verified_work_records r where r.worker_id = w.user_id),
      'repeat_employers', (select count(*) from (select employer_id from public.verified_work_records r
        where r.worker_id = w.user_id group by employer_id having count(*) >= 2) repeats)),
    'records', coalesce((select jsonb_agg(jsonb_build_object('summary', s.summary, 'work_days', r.work_days, 'verified_at', r.verified_at)
      order by r.verified_at desc, r.id desc) from public.verified_work_records r
      join public.public_work_shares s on s.record_id = r.id where r.worker_id = w.user_id), '[]'::jsonb)
  ) from public.worker_profiles w join public.profiles p on p.id = w.user_id
  where w.public_id = p_public_id and w.is_public and w.public_service_area is not null;
$$;
