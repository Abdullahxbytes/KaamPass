-- Feedback belongs to one verified job and can only be created by its employer.
create table public.job_feedback (
  job_id uuid primary key references public.verified_work_records(job_id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(btrim(comment)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.job_feedback enable row level security;
revoke all on public.job_feedback from public, anon, authenticated;
grant select, insert, delete on public.job_feedback to service_role;

create function public.submit_job_feedback(p_job_id uuid, p_employer_id uuid, p_rating integer, p_comment text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if p_rating is null or p_rating not between 1 and 5 or
     (p_comment is not null and char_length(btrim(p_comment)) not between 1 and 500) then
    return 'invalid';
  end if;
  if not exists (select 1 from public.verified_work_records r
    where r.job_id = p_job_id and r.employer_id = p_employer_id) then
    return 'not_found';
  end if;
  insert into public.job_feedback (job_id, rating, comment)
  values (p_job_id, p_rating, p_comment) on conflict (job_id) do nothing;
  if not found then return 'exists'; end if;
  return 'created';
end;
$$;
revoke all on function public.submit_job_feedback(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.submit_job_feedback(uuid, uuid, integer, text) to service_role;
