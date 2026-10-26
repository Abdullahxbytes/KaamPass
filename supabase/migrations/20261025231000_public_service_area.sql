alter table public.worker_profiles add column public_service_area text
  check (char_length(btrim(public_service_area)) between 1 and 120);

create or replace function public.public_kaampass(p_public_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'public_id', w.public_id,
    'full_name', p.full_name,
    'profession', w.profession,
    'service_area', w.public_service_area,
    'experience_years', w.experience_years,
    'skills', coalesce((select jsonb_agg(s.slug order by s.slug)
      from public.worker_skills ws join public.skills s on s.id = ws.skill_id
      where ws.worker_id = w.user_id), '[]'::jsonb),
    'stats', jsonb_build_object(
      'verified_jobs', (select count(*) from public.verified_work_records r where r.worker_id = w.user_id),
      'work_days', (select coalesce(sum(r.work_days), 0) from public.verified_work_records r where r.worker_id = w.user_id),
      'repeat_employers', (select count(*) from (
        select employer_id from public.verified_work_records r where r.worker_id = w.user_id
        group by employer_id having count(*) >= 2
      ) repeats)
    )
  )
  from public.worker_profiles w join public.profiles p on p.id = w.user_id
  where w.public_id = p_public_id and w.is_public and w.public_service_area is not null;
$$;
