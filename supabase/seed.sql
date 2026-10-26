-- LOCAL DEVELOPMENT ONLY. These fictional accounts share a public demo
-- password and must never be seeded into a hosted or production project.
-- Existing users and profiles are never overwritten.

insert into public.skills (profession, slug) values
  ('electrician', 'residential_wiring'), ('electrician', 'commercial_wiring'),
  ('electrician', 'db_installation'), ('electrician', 'fault_diagnosis'),
  ('electrician', 'appliance_installation'), ('electrician', 'solar_installation'),
  ('electrician', 'maintenance'), ('electrician', 'switch_socket_installation'),
  ('electrician', 'safety_experience'), ('electrician', 'emergency_service'),
  ('plumber', 'pipe_fitting'), ('plumber', 'leakage_repair'),
  ('plumber', 'bathroom_installation'), ('plumber', 'drainage_work'),
  ('plumber', 'water_tank_installation'), ('plumber', 'geyser_installation'),
  ('plumber', 'water_pump_work'), ('plumber', 'fixture_installation'),
  ('plumber', 'maintenance'), ('plumber', 'emergency_service'),
  ('painter', 'interior_painting'), ('painter', 'exterior_painting'),
  ('painter', 'wall_preparation'), ('painter', 'wall_putty'),
  ('painter', 'texture_work'), ('painter', 'wood_polish'),
  ('painter', 'spray_painting'), ('painter', 'finishing'),
  ('painter', 'repainting'), ('painter', 'surface_preparation')
on conflict (profession, slug) do nothing;

-- Password: KaamPassDemo123! (local demo accounts only).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  demo.id::uuid, 'authenticated', 'authenticated', demo.email,
  extensions.crypt('KaamPassDemo123!', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', demo.full_name, 'role', demo.role, 'preferred_language', demo.language),
  now(), now(), '', '', '', ''
from (values
  ('10000000-0000-4000-8000-000000000001', 'ahmed@example.test', 'Ahmed', 'worker', 'en'),
  ('10000000-0000-4000-8000-000000000002', 'bilal@example.test', 'Bilal', 'worker', 'ur-roman'),
  ('10000000-0000-4000-8000-000000000003', 'sana@example.test', 'Sana', 'worker', 'ur'),
  ('10000000-0000-4000-8000-000000000004', 'ali@example.test', 'Ali Raza', 'employer', 'en')
) as demo(id, email, full_name, role, language)
on conflict do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now()
from auth.users u
where (u.id, u.email) in (
  ('10000000-0000-4000-8000-000000000001'::uuid, 'ahmed@example.test'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'bilal@example.test'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'sana@example.test'),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'ali@example.test')
)
on conflict do nothing;

insert into public.worker_profiles (user_id, profession, service_area, experience_years, availability, typical_rate_minor, trade_details)
select p.id, demo.profession::public.worker_profession, demo.service_area, demo.experience, demo.availability, demo.rate, demo.details::jsonb
from (values
  ('10000000-0000-4000-8000-000000000001', 'electrician', 'Lahore', 5, 'Weekdays', 200000::bigint, '{"tools":["tester","drill"],"safety_experience":"Residential installations","emergency_available":true}'),
  ('10000000-0000-4000-8000-000000000002', 'plumber', 'Rawalpindi', 7, 'Weekends', 300000::bigint, '{"tools":["pipe wrench"],"materials":["PVC","PPR"],"emergency_available":true}'),
  ('10000000-0000-4000-8000-000000000003', 'painter', 'Islamabad', 4, 'Available next week', 350000::bigint, '{"paint_types":["emulsion"],"area_experience":"Apartment interiors"}')
) as demo(id, profession, service_area, experience, availability, rate, details)
join public.profiles p on p.id = demo.id::uuid and p.role = 'worker'
join auth.users u on u.id = p.id and u.email in ('ahmed@example.test', 'bilal@example.test', 'sana@example.test')
on conflict (user_id) do nothing;

insert into public.employer_profiles (user_id, employer_type)
select p.id, 'household'
from public.profiles p join auth.users u on u.id = p.id
where p.id = '10000000-0000-4000-8000-000000000004'::uuid
  and p.role = 'employer' and u.email = 'ali@example.test'
on conflict (user_id) do nothing;

insert into public.worker_skills (worker_id, skill_id, profession)
select w.user_id, s.id, w.profession
from public.worker_profiles w
join public.skills s on s.profession = w.profession
where (w.user_id, s.slug) in (
  ('10000000-0000-4000-8000-000000000001'::uuid, 'residential_wiring'),
  ('10000000-0000-4000-8000-000000000001'::uuid, 'db_installation'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'leakage_repair'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'bathroom_installation'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'interior_painting'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'finishing')
)
on conflict (worker_id, skill_id) do nothing;

-- Stable fictional work requests let each worker immediately see a job that
-- matches their saved profession. They remain open so the bid flow can be
-- demonstrated without manually creating a request first.
insert into public.job_posts (
  id, employer_id, profession, title, service_area, description,
  preferred_start_date, materials_responsibility, trade_details
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004',
    'electrician',
    'Repair a home distribution board',
    'Lahore',
    'Inspect and repair a household distribution board with two affected circuits.',
    current_date + 7,
    'employer',
    '{"work_type":"Distribution board repair","circuit_count":2}'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000004',
    'plumber',
    'Fix a bathroom pipe leak',
    'Rawalpindi',
    'Find and repair a leak under the bathroom basin. The home has one affected fixture.',
    current_date + 9,
    'employer',
    '{"work_type":"Bathroom leak repair","fixture_count":1}'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    'painter',
    'Paint two apartment rooms',
    'Islamabad',
    'Prepare and paint two rooms with two coats of interior emulsion paint.',
    current_date + 12,
    'employer',
    '{"work_type":"Interior painting","area_square_feet":600,"coats":2}'
  )
on conflict (id) do nothing;

-- A small, verified history makes profile, feedback and sharing screens useful
-- immediately after a database reset. All people, jobs and amounts are fictional.
insert into public.work_agreements (
  id, employer_id, worker_id, profession, description, work_days,
  pricing_model, amount_minor, total_minor, materials_responsibility,
  trade_details, status, responded_at
) values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'electrician',
    'Repair a household distribution board and restore two circuits.',
    3, 'fixed_total', 600000, 600000, 'employer',
    '{"work_type":"Distribution board repair","circuit_count":2}',
    'accepted', now() - interval '21 days'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    'plumber',
    'Repair a bathroom leak and replace one damaged pipe fitting.',
    2, 'fixed_total', 450000, 450000, 'employer',
    '{"work_type":"Bathroom leak repair","fixture_count":1}',
    'accepted', now() - interval '16 days'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000003',
    'painter',
    'Prepare and paint an apartment living room with two coats.',
    4, 'fixed_total', 1800000, 1800000, 'employer',
    '{"work_type":"Interior painting","area_square_feet":500,"coats":2}',
    'accepted', now() - interval '10 days'
  )
on conflict (id) do nothing;

select public.complete_job(
  job.id,
  '10000000-0000-4000-8000-000000000004',
  case agreement.id
    when '30000000-0000-4000-8000-000000000001' then 3
    when '30000000-0000-4000-8000-000000000002' then 2
    else 4
  end,
  case agreement.id
    when '30000000-0000-4000-8000-000000000001' then 600000
    when '30000000-0000-4000-8000-000000000002' then 450000
    else 1800000
  end
)
from public.jobs job
join public.work_agreements agreement on agreement.id = job.agreement_id
where agreement.id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003'
);

select public.respond_job_completion(job.id, agreement.worker_id, true, null)
from public.jobs job
join public.work_agreements agreement on agreement.id = job.agreement_id
where agreement.id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003'
);

select public.submit_job_feedback(
  job.id,
  '10000000-0000-4000-8000-000000000004',
  5,
  'Fictional demo feedback: clear communication and completed work.'
)
from public.jobs job
where job.agreement_id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003'
);
