-- pg_column_size is STABLE. Textual byte length is deterministic, allowing
-- this check-constraint helper to remain correctly IMMUTABLE.
create or replace function public.valid_agreement_trade_details(
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
  if jsonb_typeof(details) <> 'object' or octet_length(details::text) > 4096 then
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
