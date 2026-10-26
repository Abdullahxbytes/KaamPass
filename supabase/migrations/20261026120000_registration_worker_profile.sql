-- New worker sign-ups provide their trade and broad service area together.
-- Older clients and seeded accounts without these fields can still complete
-- their profile after signing in.
create or replace function public.create_profile_for_new_user() returns trigger
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
  if new.raw_user_meta_data ->> 'role' = 'worker'
     and new.raw_user_meta_data ->> 'profession' is not null
     and new.raw_user_meta_data ->> 'service_area' is not null then
    insert into public.worker_profiles (user_id, profession, service_area)
    values (
      new.id,
      (new.raw_user_meta_data ->> 'profession')::public.worker_profession,
      btrim(new.raw_user_meta_data ->> 'service_area')
    );
  end if;
  return new;
end;
$$;
