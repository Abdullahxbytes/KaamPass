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

-- Additional local-only accounts make the marketplace feel populated during a
-- demo. They use the same development-only password declared above.
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
  ('10000000-0000-4000-8000-000000000005', 'farah@example.test', 'Farah Khan', 'worker', 'en'),
  ('10000000-0000-4000-8000-000000000006', 'usman@example.test', 'Usman Tariq', 'worker', 'ur-roman'),
  ('10000000-0000-4000-8000-000000000007', 'ayesha@example.test', 'Ayesha Malik', 'worker', 'ur'),
  ('10000000-0000-4000-8000-000000000008', 'hamza@example.test', 'Hamza Iqbal', 'worker', 'en'),
  ('10000000-0000-4000-8000-000000000009', 'mariam@example.test', 'Mariam Noor', 'worker', 'ur'),
  ('10000000-0000-4000-8000-000000000010', 'zain@example.test', 'Zain Abbas', 'worker', 'ur-roman'),
  ('10000000-0000-4000-8000-000000000011', 'nida@example.test', 'Nida Homes', 'employer', 'en'),
  ('10000000-0000-4000-8000-000000000012', 'kamran@example.test', 'Kamran Builders', 'employer', 'ur-roman'),
  ('10000000-0000-4000-8000-000000000013', 'hira@example.test', 'Hira Boutique', 'employer', 'ur'),
  ('10000000-0000-4000-8000-000000000014', 'saad@example.test', 'Saad Workshop', 'employer', 'en')
) as demo(id, email, full_name, role, language)
on conflict do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now()
from auth.users u
where u.email in (
  'farah@example.test', 'usman@example.test', 'ayesha@example.test',
  'hamza@example.test', 'mariam@example.test', 'zain@example.test',
  'nida@example.test', 'kamran@example.test', 'hira@example.test', 'saad@example.test'
)
on conflict do nothing;

insert into public.worker_profiles (
  user_id, profession, service_area, experience_years, availability,
  typical_rate_minor, trade_details
)
select p.id, demo.profession::public.worker_profession, demo.service_area,
  demo.experience, demo.availability, demo.rate, demo.details::jsonb
from (values
  ('10000000-0000-4000-8000-000000000005', 'electrician', 'Lahore', 6, 'Weekends', 240000::bigint, '{"tools":["multimeter","drill"],"safety_experience":"Commercial wiring","emergency_available":true}'),
  ('10000000-0000-4000-8000-000000000006', 'electrician', 'Rawalpindi', 3, 'Evenings', 180000::bigint, '{"tools":["tester","pliers"],"safety_experience":"Home repairs","emergency_available":false}'),
  ('10000000-0000-4000-8000-000000000007', 'plumber', 'Islamabad', 5, 'Weekdays', 280000::bigint, '{"tools":["pipe wrench","cutter"],"materials":["PVC","PPR"],"emergency_available":true}'),
  ('10000000-0000-4000-8000-000000000008', 'plumber', 'Lahore', 4, 'Weekends', 250000::bigint, '{"tools":["pipe wrench"],"materials":["CPVC"],"emergency_available":false}'),
  ('10000000-0000-4000-8000-000000000009', 'painter', 'Rawalpindi', 8, 'Weekdays', 320000::bigint, '{"paint_types":["emulsion","weather shield"],"area_experience":"Homes and shops"}'),
  ('10000000-0000-4000-8000-000000000010', 'painter', 'Islamabad', 3, 'Evenings', 220000::bigint, '{"paint_types":["emulsion"],"area_experience":"Small interiors"}')
) as demo(id, profession, service_area, experience, availability, rate, details)
join public.profiles p on p.id = demo.id::uuid and p.role = 'worker'
on conflict (user_id) do nothing;

insert into public.employer_profiles (user_id, employer_type, organization_name)
select p.id, demo.employer_type, demo.organization_name
from (values
  ('10000000-0000-4000-8000-000000000011', 'household', null::text),
  ('10000000-0000-4000-8000-000000000012', 'construction_business', 'Kamran Builders'),
  ('10000000-0000-4000-8000-000000000013', 'shop', 'Hira Boutique'),
  ('10000000-0000-4000-8000-000000000014', 'workshop', 'Saad Workshop')
) as demo(id, employer_type, organization_name)
join public.profiles p on p.id = demo.id::uuid and p.role = 'employer'
on conflict (user_id) do nothing;

insert into public.worker_skills (worker_id, skill_id, profession)
select mapping.worker_id::uuid, skill.id, mapping.profession::public.worker_profession
from (values
  ('10000000-0000-4000-8000-000000000005', 'electrician', 'fault_diagnosis'),
  ('10000000-0000-4000-8000-000000000005', 'electrician', 'commercial_wiring'),
  ('10000000-0000-4000-8000-000000000006', 'electrician', 'switch_socket_installation'),
  ('10000000-0000-4000-8000-000000000007', 'plumber', 'pipe_fitting'),
  ('10000000-0000-4000-8000-000000000007', 'plumber', 'drainage_work'),
  ('10000000-0000-4000-8000-000000000008', 'plumber', 'geyser_installation'),
  ('10000000-0000-4000-8000-000000000009', 'painter', 'exterior_painting'),
  ('10000000-0000-4000-8000-000000000009', 'painter', 'texture_work'),
  ('10000000-0000-4000-8000-000000000010', 'painter', 'interior_painting')
) as mapping(worker_id, profession, slug)
join public.skills skill on skill.profession = mapping.profession::public.worker_profession and skill.slug = mapping.slug
on conflict (worker_id, skill_id) do nothing;

-- Twelve open requests and fifteen matching bids are enough to demonstrate
-- browsing, filtering, comparison and selection without invented real data.
insert into public.job_posts (
  id, employer_id, profession, title, service_area, description,
  preferred_start_date, materials_responsibility, trade_details
) values
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000011', 'electrician', 'Install kitchen sockets', 'Lahore', 'Install four safe kitchen sockets and check the existing circuit.', current_date + 4, 'employer', '{"work_type":"Kitchen socket installation","circuit_count":1}'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000012', 'electrician', 'Check office wiring', 'Rawalpindi', 'Inspect office wiring and report faults across three circuits.', current_date + 10, 'employer', '{"work_type":"Office wiring inspection","circuit_count":3}'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000013', 'electrician', 'Replace shop lights', 'Islamabad', 'Replace faulty lighting connections in a small retail shop.', current_date + 14, 'shared', '{"work_type":"Lighting replacement","circuit_count":2}'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000014', 'electrician', 'Workshop safety check', 'Lahore', 'Check the workshop power points and repair one unsafe connection.', current_date + 18, 'employer', '{"work_type":"Workshop safety repair","circuit_count":2}'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000011', 'plumber', 'Install a kitchen tap', 'Rawalpindi', 'Install one kitchen tap and check the water connection for leaks.', current_date + 5, 'employer', '{"work_type":"Kitchen tap installation","fixture_count":1}'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000012', 'plumber', 'Repair drainage line', 'Islamabad', 'Clear and repair a short blocked drainage line for two fixtures.', current_date + 11, 'shared', '{"work_type":"Drainage repair","fixture_count":2}'),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000013', 'plumber', 'Service a water heater', 'Lahore', 'Service a household water heater and replace a leaking fitting if needed.', current_date + 15, 'employer', '{"work_type":"Water heater service","fixture_count":1}'),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000014', 'plumber', 'Fit shop wash basin', 'Rawalpindi', 'Fit one wash basin in a workshop staff area.', current_date + 20, 'employer', '{"work_type":"Wash basin fitting","fixture_count":1}'),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000011', 'painter', 'Repaint a bedroom', 'Islamabad', 'Prepare and repaint one bedroom with two coats.', current_date + 6, 'employer', '{"work_type":"Bedroom repainting","area_square_feet":250,"coats":2}'),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000012', 'painter', 'Paint office reception', 'Lahore', 'Prepare and paint a small office reception area with two coats.', current_date + 13, 'shared', '{"work_type":"Office reception painting","area_square_feet":400,"coats":2}'),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000013', 'painter', 'Refresh boutique walls', 'Rawalpindi', 'Refresh boutique display walls with two coats of emulsion paint.', current_date + 17, 'employer', '{"work_type":"Boutique wall painting","area_square_feet":350,"coats":2}'),
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000014', 'painter', 'Paint workshop office', 'Islamabad', 'Prepare and paint a workshop office with two coats.', current_date + 22, 'employer', '{"work_type":"Workshop office painting","area_square_feet":300,"coats":2}')
on conflict (id) do nothing;

insert into public.job_bids (
  id, job_post_id, worker_id, profession, pricing_model, amount_minor,
  total_minor, estimated_days, message
) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'electrician', 'fixed_total', 180000, 180000, 1, 'I can install the sockets safely this weekend.'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', 'electrician', 'fixed_total', 200000, 200000, 1, 'I have experience with residential kitchen circuits.'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000006', 'electrician', 'daily_rate', 180000, 360000, 2, 'I can inspect and report the office wiring faults.'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 'electrician', 'fixed_total', 250000, 250000, 2, 'Available for the shop lighting replacement.'),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'plumber', 'fixed_total', 160000, 160000, 1, 'I can install the tap and test all joints for leaks.'),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000007', 'plumber', 'fixed_total', 175000, 175000, 1, 'I carry the tools needed for this tap installation.'),
  ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000007', 'plumber', 'daily_rate', 280000, 560000, 2, 'I can repair and test the drainage line.'),
  ('40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000008', 'plumber', 'fixed_total', 230000, 230000, 1, 'Available on the weekend for the water heater service.'),
  ('40000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000003', 'painter', 'fixed_total', 400000, 400000, 2, 'I can prepare and repaint the bedroom next week.'),
  ('40000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000009', 'painter', 'fixed_total', 420000, 420000, 2, 'I can provide a clean two-coat bedroom finish.'),
  ('40000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000009', 'painter', 'daily_rate', 320000, 640000, 2, 'I have experience painting office reception areas.'),
  ('40000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000010', 'painter', 'fixed_total', 350000, 350000, 2, 'Available in the evenings for the boutique repainting.'),
  ('40000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000003', 'painter', 'fixed_total', 330000, 330000, 2, 'I can prepare the office and apply two even coats.'),
  ('40000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'electrician', 'fixed_total', 300000, 300000, 2, 'I can inspect the workshop points and repair the unsafe connection.'),
  ('40000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000008', 'plumber', 'fixed_total', 210000, 210000, 1, 'I can fit and test the workshop wash basin.')
on conflict (id) do nothing;

-- One completed fictional job for every additional worker provides feedback
-- and history examples without selecting any of the still-open requests above.
insert into public.work_agreements (
  id, employer_id, worker_id, profession, description, work_days,
  pricing_model, amount_minor, total_minor, materials_responsibility,
  trade_details, status, responded_at
) values
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000005', 'electrician', 'Inspect and repair electrical connections in a kitchen.', 2, 'fixed_total', 400000, 400000, 'employer', '{"work_type":"Kitchen electrical repair","circuit_count":2}', 'accepted', now() - interval '28 days'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000006', 'electrician', 'Replace damaged switches in a small office.', 1, 'fixed_total', 220000, 220000, 'employer', '{"work_type":"Switch replacement","circuit_count":1}', 'accepted', now() - interval '24 days'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000007', 'plumber', 'Repair the boutique washroom drainage line.', 2, 'fixed_total', 500000, 500000, 'employer', '{"work_type":"Drainage repair","fixture_count":2}', 'accepted', now() - interval '19 days'),
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000008', 'plumber', 'Service the workshop water heater.', 1, 'fixed_total', 260000, 260000, 'employer', '{"work_type":"Water heater service","fixture_count":1}', 'accepted', now() - interval '15 days'),
  ('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000009', 'painter', 'Repaint a home exterior wall with two coats.', 3, 'fixed_total', 960000, 960000, 'employer', '{"work_type":"Exterior wall painting","area_square_feet":700,"coats":2}', 'accepted', now() - interval '12 days'),
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000010', 'painter', 'Prepare and repaint a small office wall.', 2, 'fixed_total', 440000, 440000, 'employer', '{"work_type":"Office wall painting","area_square_feet":280,"coats":2}', 'accepted', now() - interval '8 days')
on conflict (id) do nothing;

select public.complete_job(
  job.id,
  agreement.employer_id,
  agreement.work_days,
  agreement.total_minor
)
from public.jobs job
join public.work_agreements agreement on agreement.id = job.agreement_id
where agreement.id in (
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000008',
  '30000000-0000-4000-8000-000000000009'
);

select public.respond_job_completion(job.id, agreement.worker_id, true, null)
from public.jobs job
join public.work_agreements agreement on agreement.id = job.agreement_id
where agreement.id in (
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000008',
  '30000000-0000-4000-8000-000000000009'
);

select public.submit_job_feedback(
  job.id,
  agreement.employer_id,
  5,
  'Fictional demo feedback: reliable work and clear communication.'
)
from public.jobs job
join public.work_agreements agreement on agreement.id = job.agreement_id
where agreement.id in (
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000007',
  '30000000-0000-4000-8000-000000000008',
  '30000000-0000-4000-8000-000000000009'
);
