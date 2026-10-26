import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Server } from 'node:http'

import { createClient } from '@supabase/supabase-js'
import { parse } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import { loadEnvironment } from '../config/env.js'

const enabled = process.env.KAAMPASS_LOCAL_INTEGRATION === '1'

describe.skipIf(!enabled)('local account and database integration', () => {
  let server: Server
  let apiUrl: string
  let userId: string | undefined
  let employerId: string | undefined
  let accessToken: string
  let employerToken: string
  let workerEmail: string
  let supabaseUrl: string
  let publishableKey: string
  const password = 'LocalIntegration123!'
  let publicClient: ReturnType<typeof createClient>
  let adminClient: ReturnType<typeof createClient>

  beforeAll(async () => {
    const apiEnv = parse(readFileSync(resolve('apps/api/.env')))
    const webEnv = parse(readFileSync(resolve('apps/web/.env.local')))
    const environment = loadEnvironment({ ...apiEnv, NODE_ENV: 'test' })
    if (
      !environment.SUPABASE_URL ||
      !environment.SUPABASE_SERVICE_ROLE_KEY ||
      !webEnv.VITE_SUPABASE_ANON_KEY
    ) {
      throw new Error('Local Supabase environment is not configured.')
    }
    if (!/^http:\/\/127\.0\.0\.1:55321\/?$/.test(environment.SUPABASE_URL)) {
      throw new Error(
        'Integration tests may only use the local Supabase endpoint.',
      )
    }
    supabaseUrl = environment.SUPABASE_URL
    publishableKey = webEnv.VITE_SUPABASE_ANON_KEY

    const storage = new Map<string, string>()
    const authStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    }
    publicClient = createClient(
      environment.SUPABASE_URL,
      webEnv.VITE_SUPABASE_ANON_KEY,
      {
        auth: {
          storage: authStorage,
          storageKey: 'kaampass-integration',
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    )
    adminClient = createClient(
      environment.SUPABASE_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )

    const email = `integration-${crypto.randomUUID()}@example.test`
    workerEmail = email
    const signup = await publicClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: 'Integration Worker',
          role: 'worker',
          preferred_language: 'ur',
        },
      },
    })
    if (signup.error || !signup.data.user)
      throw new Error('Local signup failed.')
    userId = signup.data.user.id
    const login = await publicClient.auth.signInWithPassword({
      email,
      password,
    })
    if (login.error || !login.data.session)
      throw new Error('Local login failed.')
    accessToken = login.data.session.access_token

    const employerClient = createClient(
      environment.SUPABASE_URL,
      webEnv.VITE_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )
    const employer = await employerClient.auth.signUp({
      email: `integration-${crypto.randomUUID()}@example.test`,
      password,
      options: {
        data: {
          full_name: 'Integration Employer',
          role: 'employer',
          preferred_language: 'en',
        },
      },
    })
    if (employer.error || !employer.data.user || !employer.data.session)
      throw new Error('Employer signup failed.')
    employerId = employer.data.user.id
    employerToken = employer.data.session.access_token
    const workerProfile = await adminClient.from('worker_profiles').insert({
      user_id: userId,
      profession: 'electrician',
      service_area: 'Lahore',
    })
    const employerProfile = await adminClient
      .from('employer_profiles')
      .insert({ user_id: employerId, employer_type: 'household' })
    if (workerProfile.error || employerProfile.error)
      throw new Error('Test profile setup failed.')

    const restoredClient = createClient(
      environment.SUPABASE_URL,
      webEnv.VITE_SUPABASE_ANON_KEY,
      {
        auth: {
          storage: authStorage,
          storageKey: 'kaampass-integration',
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    )
    const restored = await restoredClient.auth.getSession()
    if (restored.data.session?.user.id !== userId)
      throw new Error('Session restoration failed.')

    server = createApp(environment).listen(0, '127.0.0.1')
    await new Promise<void>((resolveListen) =>
      server.once('listening', resolveListen),
    )
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('API server did not start.')
    apiUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    if (server)
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      )
    if (userId && adminClient) await adminClient.auth.admin.deleteUser(userId)
    if (employerId && adminClient)
      await adminClient.auth.admin.deleteUser(employerId)
  })

  it('requires a valid access token and restores the registered role and language', async () => {
    expect((await fetch(`${apiUrl}/account/me`)).status).toBe(401)
    expect(
      (
        await fetch(`${apiUrl}/account/me`, {
          headers: { Authorization: 'Bearer invalid' },
        })
      ).status,
    ).toBe(401)
    const response = await fetch(`${apiUrl}/account/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toMatchObject({
      id: userId,
      fullName: 'Integration Worker',
      role: 'worker',
      preferredLanguage: 'ur',
    })
  })

  it('saves only a valid language and does not accept a role change', async () => {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
    const invalid = await fetch(`${apiUrl}/account/preferences`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ preferredLanguage: 'fr' }),
    })
    expect(invalid.status).toBe(400)
    const response = await fetch(`${apiUrl}/account/preferences`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ preferredLanguage: 'ur-roman', role: 'employer' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toMatchObject({
      role: 'worker',
      preferredLanguage: 'ur-roman',
    })
    const reread = await fetch(`${apiUrl}/account/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect((await reread.json()).data.preferredLanguage).toBe('ur-roman')
    const freshClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const signedIn = await freshClient.auth.signInWithPassword({
      email: workerEmail,
      password,
    })
    expect(signedIn.error).toBeNull()
    const restored = await fetch(`${apiUrl}/account/me`, {
      headers: {
        Authorization: `Bearer ${signedIn.data.session!.access_token}`,
      },
    })
    expect((await restored.json()).data.preferredLanguage).toBe('ur-roman')
  })

  it('blocks direct client access, mismatched roles, and invalid trade fields', async () => {
    const direct = await publicClient
      .from('profiles')
      .select('id')
      .eq('id', userId!)
    expect(direct.error).not.toBeNull()
    const wrongRole = await adminClient
      .from('employer_profiles')
      .insert({ user_id: userId, employer_type: 'household' })
    expect(wrongRole.error).not.toBeNull()
    const invalidTrade = await adminClient
      .from('worker_profiles')
      .update({ trade_details: { materials: ['PVC'] } })
      .eq('user_id', userId!)
    expect(invalidTrade.error).not.toBeNull()
  })

  it('enforces the verified role and ignores attempts to select another owner', async () => {
    const worker = { Authorization: `Bearer ${accessToken}` }
    const employer = { Authorization: `Bearer ${employerToken}` }
    expect((await fetch(`${apiUrl}/account/worker-profile`)).status).toBe(401)
    expect(
      (await fetch(`${apiUrl}/account/worker-profile`, { headers: employer }))
        .status,
    ).toBe(403)
    expect(
      (await fetch(`${apiUrl}/account/employer-profile`, { headers: worker }))
        .status,
    ).toBe(403)
    const ownWorker = await fetch(
      `${apiUrl}/account/worker-profile?userId=${employerId}`,
      { headers: worker },
    )
    expect(ownWorker.status).toBe(200)
    expect((await ownWorker.json()).data).toMatchObject({
      profession: 'electrician',
      service_area: 'Lahore',
    })
    const ownEmployer = await fetch(
      `${apiUrl}/account/employer-profile?userId=${userId}`,
      { headers: employer },
    )
    expect(ownEmployer.status).toBe(200)
    expect((await ownEmployer.json()).data).toMatchObject({
      employer_type: 'household',
    })
    const directWrite = await publicClient
      .from('profiles')
      .update({ preferred_language: 'en' })
      .eq('id', employerId!)
    expect(directWrite.error).not.toBeNull()
    const attemptedChange = await fetch(`${apiUrl}/account/preferences`, {
      method: 'PATCH',
      headers: { ...worker, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: employerId, preferredLanguage: 'ur' }),
    })
    expect(attemptedChange.status).toBe(200)
    const employerAccount = await fetch(`${apiUrl}/account/me`, {
      headers: employer,
    })
    expect((await employerAccount.json()).data.preferredLanguage).toBe('en')
  })

  it('saves worker and employer profiles, rejects unauthorized and invalid edits, and locks profession', async () => {
    const workerHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
    const employerHeaders = {
      Authorization: `Bearer ${employerToken}`,
      'Content-Type': 'application/json',
    }
    const profile = {
      profession: 'electrician',
      service_area: 'Karachi',
      experience_years: 4,
      bio: 'Experienced worker',
      availability: null,
      typical_rate_minor: 250050,
      currency_code: 'PKR',
      trade_details: { tools: ['tester'], emergency_available: true },
      skills: ['residential_wiring', 'fault_diagnosis'],
    }
    const save = (headers: Record<string, string>, body: unknown) =>
      fetch(`${apiUrl}/account/worker-profile`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      })
    expect((await save({}, profile)).status).toBe(401)
    expect((await save(employerHeaders, profile)).status).toBe(403)
    expect(
      (await save(workerHeaders, { ...profile, skills: ['pipe_fitting'] }))
        .status,
    ).toBe(400)
    expect(
      (await save(workerHeaders, { ...profile, user_id: employerId })).status,
    ).toBe(400)
    expect((await save(workerHeaders, profile)).status).toBe(200)
    const loaded = await fetch(`${apiUrl}/account/worker-profile`, {
      headers: workerHeaders,
    })
    const loadedProfile = (await loaded.json()).data
    expect(loadedProfile).toMatchObject({
      ...profile,
      skills: expect.arrayContaining(profile.skills),
    })
    expect(loadedProfile.skills).toHaveLength(2)
    expect(
      (
        await save(workerHeaders, {
          ...profile,
          profession: 'plumber',
          trade_details: {},
          skills: [],
        })
      ).status,
    ).toBe(409)
    const afterRejected = await fetch(`${apiUrl}/account/worker-profile`, {
      headers: workerHeaders,
    })
    expect((await afterRejected.json()).data.profession).toBe('electrician')
    const employerBody = {
      employer_type: 'shop',
      organization_name: 'Test shop',
    }
    expect(
      (
        await fetch(`${apiUrl}/account/employer-profile`, {
          method: 'PATCH',
          headers: workerHeaders,
          body: JSON.stringify(employerBody),
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await fetch(`${apiUrl}/account/employer-profile`, {
          method: 'PATCH',
          headers: employerHeaders,
          body: JSON.stringify(employerBody),
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await (
          await fetch(`${apiUrl}/account/employer-profile`, {
            headers: employerHeaders,
          })
        ).json()
      ).data,
    ).toEqual(employerBody)
  })

  it('signs out the browser session', async () => {
    const result = await publicClient.auth.signOut()
    expect(result.error).toBeNull()
    expect((await publicClient.auth.getSession()).data.session).toBeNull()
  })

  it('creates and reloads plumber and painter profiles with their own skills', async () => {
    for (const [profession, skill, tradeDetails] of [
      ['plumber', 'pipe_fitting', { materials: ['PVC'] }],
      ['painter', 'interior_painting', { paint_types: ['emulsion'] }],
    ] as const) {
      const { data: created, error } = await adminClient.auth.admin.createUser({
        email: `integration-${crypto.randomUUID()}@example.test`,
        password: 'LocalIntegration123!',
        email_confirm: true,
        user_metadata: {
          full_name: 'Trade Test',
          role: 'worker',
          preferred_language: 'en',
        },
      })
      if (error || !created.user) throw new Error('Trade test setup failed.')
      try {
        const apiEnv = parse(readFileSync(resolve('apps/api/.env')))
        const webEnv = parse(readFileSync(resolve('apps/web/.env.local')))
        const client = createClient(
          apiEnv.SUPABASE_URL!,
          webEnv.VITE_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false } },
        )
        const login = await client.auth.signInWithPassword({
          email: created.user.email!,
          password: 'LocalIntegration123!',
        })
        if (!login.data.session) throw new Error('Trade login failed.')
        const headers = {
          Authorization: `Bearer ${login.data.session.access_token}`,
          'Content-Type': 'application/json',
        }
        const profile = {
          profession,
          service_area: 'Lahore',
          experience_years: 2,
          bio: null,
          availability: null,
          typical_rate_minor: null,
          currency_code: 'PKR',
          trade_details: tradeDetails,
          skills: [skill],
        }
        expect(
          (
            await fetch(`${apiUrl}/account/worker-profile`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify(profile),
            })
          ).status,
        ).toBe(200)
        expect(
          (
            await (
              await fetch(`${apiUrl}/account/worker-profile`, { headers })
            ).json()
          ).data,
        ).toEqual(profile)
      } finally {
        await adminClient.auth.admin.deleteUser(created.user.id)
      }
    }
  })
})
