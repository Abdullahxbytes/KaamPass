-- Supabase default privileges may grant service_role more than the explicit grants.
revoke update on public.verified_work_records from service_role;
