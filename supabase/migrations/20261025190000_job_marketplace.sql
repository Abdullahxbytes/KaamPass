create type public.job_post_status as enum ('open', 'selected', 'closed');
create type public.job_bid_status as enum ('submitted', 'selected', 'not_selected');

create table public.job_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(user_id) on delete restrict,
  profession public.worker_profession not null,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  service_area text not null check (char_length(btrim(service_area)) between 1 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  preferred_start_date date,
  materials_responsibility public.materials_responsibility not null,
  trade_details jsonb not null check (public.valid_agreement_trade_details(profession, trade_details)),
  status public.job_post_status not null default 'open',
  selected_bid_id uuid,
  selected_agreement_id uuid references public.work_agreements(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, profession),
  check (
    (status = 'open' and selected_bid_id is null and selected_agreement_id is null)
    or (status = 'selected' and selected_bid_id is not null and selected_agreement_id is not null)
    or status = 'closed'
  )
);

create table public.job_bids (
  id uuid primary key default extensions.gen_random_uuid(),
  job_post_id uuid not null,
  worker_id uuid not null,
  profession public.worker_profession not null,
  pricing_model public.agreement_pricing_model not null,
  amount_minor bigint not null check (amount_minor between 1 and 1000000000),
  total_minor bigint not null check (total_minor between 1 and 1000000000),
  estimated_days smallint not null check (estimated_days between 1 and 365),
  message text check (char_length(message) between 1 and 1000),
  status public.job_bid_status not null default 'submitted',
  created_at timestamptz not null default now(),
  foreign key (job_post_id, profession) references public.job_posts(id, profession) on delete cascade,
  foreign key (worker_id, profession) references public.worker_profiles(user_id, profession) on delete restrict,
  unique (job_post_id, worker_id),
  unique (id, job_post_id),
  check (
    total_minor = case
      when pricing_model = 'daily_rate' then amount_minor * estimated_days
      else amount_minor
    end
  )
);

alter table public.job_posts
  add constraint job_posts_selected_bid_belongs_to_post_fk
  foreign key (selected_bid_id, id) references public.job_bids(id, job_post_id)
  deferrable initially deferred;

create table public.job_post_images (
  id uuid primary key default extensions.gen_random_uuid(),
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 1 and 500),
  display_order smallint not null check (display_order between 0 and 2),
  created_at timestamptz not null default now(),
  unique (job_post_id, display_order)
);

create index job_posts_profession_status_created_idx
  on public.job_posts(profession, status, created_at desc);
create index job_posts_employer_created_idx
  on public.job_posts(employer_id, created_at desc);
create index job_bids_job_status_idx
  on public.job_bids(job_post_id, status, created_at);
create index job_bids_worker_created_idx
  on public.job_bids(worker_id, created_at desc);

create trigger job_posts_updated_at before update on public.job_posts
for each row execute function public.set_updated_at();

alter table public.job_posts enable row level security;
alter table public.job_bids enable row level security;
alter table public.job_post_images enable row level security;
revoke all on public.job_posts, public.job_bids, public.job_post_images
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.job_posts, public.job_bids, public.job_post_images
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-problems',
  'job-problems',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.select_job_bid(p_employer_id uuid, p_bid_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_post public.job_posts%rowtype;
  selected_bid public.job_bids%rowtype;
  agreement_id uuid;
begin
  select jp.* into selected_post
  from public.job_posts jp
  join public.job_bids jb on jb.job_post_id = jp.id
  where jb.id = p_bid_id and jp.employer_id = p_employer_id
  for update of jp;

  if not found then
    raise exception 'Job post or bid not found' using errcode = '42501';
  end if;
  select * into selected_bid
  from public.job_bids
  where id = p_bid_id and job_post_id = selected_post.id
  for update;
  if selected_post.status <> 'open' or selected_bid.status <> 'submitted' then
    raise exception 'Job post or bid already resolved' using errcode = 'P0001';
  end if;

  insert into public.work_agreements (
    employer_id,
    worker_id,
    profession,
    description,
    work_days,
    pricing_model,
    amount_minor,
    total_minor,
    currency_code,
    materials_responsibility,
    trade_details
  ) values (
    selected_post.employer_id,
    selected_bid.worker_id,
    selected_post.profession,
    selected_post.description,
    selected_bid.estimated_days,
    selected_bid.pricing_model,
    selected_bid.amount_minor,
    selected_bid.total_minor,
    'PKR',
    selected_post.materials_responsibility,
    selected_post.trade_details
  ) returning id into agreement_id;

  update public.job_bids
  set status = case when id = selected_bid.id then 'selected'::public.job_bid_status else 'not_selected'::public.job_bid_status end
  where job_post_id = selected_post.id and status = 'submitted';

  update public.job_posts
  set status = 'selected', selected_bid_id = selected_bid.id, selected_agreement_id = agreement_id
  where id = selected_post.id;

  return agreement_id;
end;
$$;

revoke all on function public.select_job_bid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.select_job_bid(uuid, uuid) to service_role;
