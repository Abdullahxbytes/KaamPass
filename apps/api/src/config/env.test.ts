import { describe, expect, it } from 'vitest'

import { loadEnvironment } from './env.js'

const baseEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '3001',
  WEB_ORIGIN: 'http://localhost:5173',
}

describe('API environment', () => {
  it('allows Supabase to remain unconfigured during foundation work', () => {
    const environment = loadEnvironment(baseEnvironment)

    expect(environment.SUPABASE_URL).toBeUndefined()
    expect(environment.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
  })

  it('accepts a complete server Supabase configuration', () => {
    const environment = loadEnvironment({
      ...baseEnvironment,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })

    expect(environment.SUPABASE_URL).toBe('https://example.supabase.co')
  })

  it('rejects a partial server Supabase configuration', () => {
    expect(() =>
      loadEnvironment({
        ...baseEnvironment,
        SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  })
})
