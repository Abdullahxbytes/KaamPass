-- Verified records are immutable and service_role has no UPDATE privilege on them.
create or replace function public.set_public_work_share(p_worker_id uuid, p_record_id uuid, p_summary text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.verified_work_records where id = p_record_id and worker_id = p_worker_id;
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
