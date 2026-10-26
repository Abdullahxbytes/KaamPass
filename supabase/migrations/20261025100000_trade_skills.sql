-- Stable trade skills are application data and are available outside local demo seeding.
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
