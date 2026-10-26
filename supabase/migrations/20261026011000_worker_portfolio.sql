create table public.worker_portfolio (
  id uuid primary key default extensions.gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(user_id) on delete cascade,
  storage_path text not null unique,
  caption text not null check (char_length(btrim(caption)) between 1 and 200),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index worker_portfolio_owner_idx on public.worker_portfolio(worker_id, created_at desc);
alter table public.worker_portfolio enable row level security;
revoke all on public.worker_portfolio from public, anon, authenticated;
grant select, insert, update, delete on public.worker_portfolio to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-portfolio', 'worker-portfolio', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
