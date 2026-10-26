-- Update a profile and its selected skills in one transaction. Only the API's
-- service role can call this function; the API derives p_user_id from the token.
create function public.save_worker_profile(p_user_id uuid, p_profile jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  chosen_profession public.worker_profession := (p_profile ->> 'profession')::public.worker_profession;
  saved_profession public.worker_profession;
  expected_count integer;
  actual_count integer;
begin
  -- Serialize updates even on first creation, including concurrent requests.
  perform 1 from public.profiles where id = p_user_id and role = 'worker' for update;
  if not found then raise exception 'Worker account required' using errcode = '42501'; end if;
  select profession into saved_profession from public.worker_profiles where user_id = p_user_id;
  if saved_profession is not null and saved_profession <> chosen_profession then
    raise exception 'Profession is locked' using errcode = 'P0001';
  end if;
  select count(*) into expected_count from jsonb_array_elements_text(p_profile -> 'skills');
  select count(*) into actual_count from public.skills
    where profession = chosen_profession and slug in (select jsonb_array_elements_text(p_profile -> 'skills'));
  if expected_count <> actual_count then raise exception 'Invalid skills' using errcode = '22023'; end if;

  insert into public.worker_profiles (user_id, profession, service_area, experience_years, bio, availability, typical_rate_minor, currency_code, trade_details)
  values (p_user_id, chosen_profession, p_profile ->> 'service_area', (p_profile ->> 'experience_years')::smallint,
    p_profile ->> 'bio', p_profile ->> 'availability', (p_profile ->> 'typical_rate_minor')::bigint, 'PKR', p_profile -> 'trade_details')
  on conflict (user_id) do update set service_area = excluded.service_area, experience_years = excluded.experience_years,
    bio = excluded.bio, availability = excluded.availability, typical_rate_minor = excluded.typical_rate_minor,
    trade_details = excluded.trade_details;
  delete from public.worker_skills where worker_id = p_user_id;
  insert into public.worker_skills (worker_id, skill_id, profession)
    select p_user_id, id, chosen_profession from public.skills
    where profession = chosen_profession and slug in (select jsonb_array_elements_text(p_profile -> 'skills'));
end;
$$;
revoke all on function public.save_worker_profile(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_worker_profile(uuid, jsonb) to service_role;
