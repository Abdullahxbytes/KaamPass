-- pg_column_size is STABLE. Textual byte length is deterministic, allowing
-- this check-constraint helper to remain correctly IMMUTABLE.
create or replace function public.valid_trade_details(
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
  if jsonb_typeof(details) <> 'object' or octet_length(details::text) > 4096 then
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
