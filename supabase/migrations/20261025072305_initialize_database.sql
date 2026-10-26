-- Supabase provides the extensions schema. Keep the UUID/cryptographic helpers
-- available for the application tables introduced in Module 2.
create extension if not exists pgcrypto with schema extensions;
