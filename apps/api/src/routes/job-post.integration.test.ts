import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Server } from 'node:http'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parse } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import { loadEnvironment } from '../config/env.js'

const enabled = process.env.KAAMPASS_LOCAL_INTEGRATION === '1'
const password = 'LocalMarketplace123!'

describe.skipIf(!enabled)('local job marketplace integration', () => {
  let server: Server
  let apiUrl: string
  let admin: SupabaseClient
  let publicUrl: string
  let publicKey: string
  let employerId: string
  let electricianId: string
  let plumberId: string
  let employerToken: string
  let electricianToken: string
  let plumberToken: string
  let jobPostId: string | undefined
  let bidId: string | undefined
  let agreementId: string | undefined

  beforeAll(async () => {
    const apiEnv = parse(readFileSync(resolve('apps/api/.env')))
    const webEnv = parse(readFileSync(resolve('apps/web/.env.local')))
    const environment = loadEnvironment({ ...apiEnv, NODE_ENV: 'test' })
    if (
      !environment.SUPABASE_URL ||
      !environment.SUPABASE_SERVICE_ROLE_KEY ||
      !webEnv.VITE_SUPABASE_ANON_KEY
    )
      throw new Error('Local Supabase environment is not configured.')
    if (!/^http:\/\/127\.0\.0\.1:55321\/?$/.test(environment.SUPABASE_URL))
      throw new Error('Marketplace tests may only use local Supabase.')

    publicUrl = environment.SUPABASE_URL
    publicKey = webEnv.VITE_SUPABASE_ANON_KEY
    admin = createClient(
      environment.SUPABASE_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    )
    const employer = await createUser('Marketplace Employer', 'employer')
    const electrician = await createUser('Marketplace Electrician', 'worker')
    const plumber = await createUser('Marketplace Plumber', 'worker')
    employerId = employer.id
    electricianId = electrician.id
    plumberId = plumber.id

    const employerProfile = await admin
      .from('employer_profiles')
      .insert({ user_id: employerId, employer_type: 'household' })
    const workerProfiles = await admin.from('worker_profiles').insert([
      {
        user_id: electricianId,
        profession: 'electrician',
        service_area: 'Lahore',
      },
      {
        user_id: plumberId,
        profession: 'plumber',
        service_area: 'Lahore',
      },
    ])
    if (employerProfile.error || workerProfiles.error)
      throw new Error('Marketplace profile setup failed.')

    employerToken = await signIn(employer.email)
    electricianToken = await signIn(electrician.email)
    plumberToken = await signIn(plumber.email)
    server = createApp(environment).listen(0, '127.0.0.1')
    await new Promise<void>((resolveListen) =>
      server.once('listening', resolveListen),
    )
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Marketplace test API did not start.')
    apiUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    if (server)
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      )
    if (admin && jobPostId) {
      const objects = await admin.storage.from('job-problems').list(jobPostId)
      if (objects.data?.length)
        await admin.storage
          .from('job-problems')
          .remove(objects.data.map((object) => `${jobPostId}/${object.name}`))
    }
    if (admin && employerId)
      await admin.from('job_posts').delete().eq('employer_id', employerId)
    if (admin && employerId)
      await admin.from('work_agreements').delete().eq('employer_id', employerId)
    for (const id of [employerId, electricianId, plumberId]) {
      if (id && admin) await admin.auth.admin.deleteUser(id)
    }
  })

  it('lets an employer post work visible only to the matching profession', async () => {
    expect((await fetch(`${apiUrl}/job-posts`)).status).toBe(401)
    const create = await request(
      '/job-posts',
      employerToken,
      'POST',
      postInput(),
    )
    expect(create.status).toBe(201)
    const created = (await create.json()).data
    jobPostId = created.id
    expect(created).toMatchObject({
      employer_id: employerId,
      profession: 'electrician',
      status: 'open',
      bids: [],
    })

    const electricianPosts = await request('/job-posts', electricianToken)
    expect((await electricianPosts.json()).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: jobPostId })]),
    )
    const plumberPosts = await request('/job-posts', plumberToken)
    expect((await plumberPosts.json()).data).toHaveLength(0)
  })

  it('stores problem images privately and returns signed participant URLs', async () => {
    const invalidForm = new FormData()
    invalidForm.append(
      'images',
      new Blob(['not an image'], { type: 'image/png' }),
      'fake.png',
    )
    expect(
      (
        await fetch(`${apiUrl}/job-posts/${jobPostId}/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${employerToken}` },
          body: invalidForm,
        })
      ).status,
    ).toBe(400)

    const form = new FormData()
    const png = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
        'base64',
      ),
    )
    form.append('images', new Blob([png], { type: 'image/png' }), 'problem.png')
    const uploaded = await fetch(`${apiUrl}/job-posts/${jobPostId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employerToken}` },
      body: form,
    })
    expect(uploaded.status).toBe(200)
    const image = (await uploaded.json()).data.images[0]
    expect(image.url).toContain('/storage/v1/object/sign/job-problems/')
    expect((await fetch(image.url)).status).toBe(200)

    const direct = await createClient(publicUrl, publicKey, {
      auth: { persistSession: false },
    })
      .from('job_post_images')
      .select('storage_path')
    expect(direct.error).not.toBeNull()
    const stored = await admin
      .from('job_post_images')
      .select('storage_path')
      .eq('job_post_id', jobPostId)
      .single()
    expect(stored.error).toBeNull()
    const rawUrl = `${publicUrl}/storage/v1/object/public/job-problems/${stored.data!.storage_path}`
    expect((await fetch(rawUrl)).ok).toBe(false)
  })

  it('accepts one bid only from a matching worker', async () => {
    const terms = {
      pricing_model: 'daily_rate',
      amount_minor: 200000,
      estimated_days: 3,
      message: 'Available this week.',
    }
    expect(
      (
        await request(
          `/job-posts/${jobPostId}/bids`,
          plumberToken,
          'POST',
          terms,
        )
      ).status,
    ).toBe(403)
    const bid = await request(
      `/job-posts/${jobPostId}/bids`,
      electricianToken,
      'POST',
      terms,
    )
    expect(bid.status).toBe(201)
    const ownPost = (await bid.json()).data
    bidId = ownPost.bids[0].id
    expect(ownPost.bids[0]).toMatchObject({
      worker_id: electricianId,
      total_minor: 600000,
      status: 'submitted',
    })
    expect(
      (
        await request(
          `/job-posts/${jobPostId}/bids`,
          electricianToken,
          'POST',
          terms,
        )
      ).status,
    ).toBe(409)
  })

  it('atomically selects one bid and creates one pending agreement', async () => {
    const selected = await request(
      `/job-posts/${jobPostId}/bids/${bidId}/select`,
      employerToken,
      'POST',
    )
    expect(selected.status).toBe(200)
    const body = (await selected.json()).data
    agreementId = body.agreement.id
    expect(body.job_post).toMatchObject({
      id: jobPostId,
      status: 'selected',
      selected_bid_id: bidId,
      selected_agreement_id: agreementId,
    })
    expect(body.agreement).toMatchObject({
      employer_id: employerId,
      worker_id: electricianId,
      total_minor: 600000,
      status: 'pending',
    })
    expect(
      (
        await request(
          `/job-posts/${jobPostId}/bids/${bidId}/select`,
          employerToken,
          'POST',
        )
      ).status,
    ).toBe(409)
    const agreements = await request('/agreements', electricianToken)
    expect((await agreements.json()).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: agreementId, status: 'pending' }),
      ]),
    )
    expect(
      (
        await request(
          `/agreements/${agreementId}/accept`,
          electricianToken,
          'POST',
        )
      ).status,
    ).toBe(200)
    const employerJobs = await request('/agreements/jobs', employerToken)
    expect((await employerJobs.json()).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agreement_id: agreementId,
          status: 'active',
        }),
      ]),
    )
  })

  async function createUser(name: string, role: 'worker' | 'employer') {
    const email = `marketplace-${crypto.randomUUID()}@example.test`
    const result = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        role,
        preferred_language: 'en',
      },
    })
    if (result.error || !result.data.user)
      throw new Error('Marketplace test user setup failed.')
    return { id: result.data.user.id, email }
  }

  async function signIn(email: string) {
    const client = createClient(publicUrl, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await client.auth.signInWithPassword({ email, password })
    if (result.error || !result.data.session)
      throw new Error('Marketplace test sign-in failed.')
    return result.data.session.access_token
  }

  function request(
    path: string,
    token: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
  ) {
    return fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  function postInput() {
    return {
      title: 'Repair distribution board',
      profession: 'electrician',
      service_area: 'Lahore',
      description: 'Inspect and repair a damaged distribution board safely.',
      preferred_start_date: null,
      materials_responsibility: 'employer',
      trade_details: { work_type: 'DB repair', circuit_count: 6 },
    }
  }
})
