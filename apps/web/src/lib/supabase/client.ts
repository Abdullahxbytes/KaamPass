import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '../config/env'

let client: SupabaseClient | undefined

export function getBrowserSupabaseClient() {
  if (client) {
    return client
  }

  if (!env.supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }

  client = createClient(env.supabase.url, env.supabase.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  })

  return client
}
