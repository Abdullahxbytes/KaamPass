import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Server } from 'node:http'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parse } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import { loadEnvironment } from '../config/env.js'

const enabled = process.env.KAAMPASS_LOCAL_INTEGRATION === '1'
const password = 'LocalAgreement123!'

describe.skipIf(!enabled)('local agreement integration', () => {
  let server: Server
  let apiUrl: string
  let admin: SupabaseClient
  let publicUrl: string
  let publicKey: string
  let employerId: string
  let workerId: string
  let otherWorkerId: string
  let otherEmployerId: string
  let employerToken: string
  let workerToken: string
  let otherWorkerToken: string
  let otherEmployerToken: string
  const agreementIds: string[] = []

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
      throw new Error('Agreement tests may only use local Supabase.')
    }
    publicUrl = environment.SUPABASE_URL
    publicKey = webEnv.VITE_SUPABASE_ANON_KEY
    admin = createClient(
      environment.SUPABASE_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    )

    const employer = await createUser('Agreement Employer', 'employer')
    const worker = await createUser('Agreement Worker', 'worker')
    const otherWorker = await createUser('Other Worker', 'worker')
    const otherEmployer = await createUser('Other Employer', 'employer')
    employerId = employer.id
    workerId = worker.id
    otherWorkerId = otherWorker.id
    otherEmployerId = otherEmployer.id

    const workerProfiles = await admin.from('worker_profiles').insert([
      {
        user_id: workerId,
        profession: 'electrician',
        service_area: 'Lahore',
      },
      {
        user_id: otherWorkerId,
        profession: 'plumber',
        service_area: 'Rawalpindi',
      },
    ])
    const employerProfile = await admin.from('employer_profiles').insert([
      { user_id: employerId, employer_type: 'household' },
      { user_id: otherEmployerId, employer_type: 'household' },
    ])
    if (workerProfiles.error || employerProfile.error)
      throw new Error('Agreement test profile setup failed.')

    employerToken = await signIn(employer.email)
    workerToken = await signIn(worker.email)
    otherWorkerToken = await signIn(otherWorker.email)
    otherEmployerToken = await signIn(otherEmployer.email)

    server = createApp(environment).listen(0, '127.0.0.1')
    await new Promise<void>((resolveListen) =>
      server.once('listening', resolveListen),
    )
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Agreement test API did not start.')
    apiUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    if (server)
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      )
    if (admin && employerId)
      await admin.from('work_agreements').delete().eq('employer_id', employerId)
    for (const id of [employerId, workerId, otherWorkerId, otherEmployerId]) {
      if (id && admin) await admin.auth.admin.deleteUser(id)
    }
  })

  it('allows only an employer with a profile to create canonical terms', async () => {
    expect((await fetch(`${apiUrl}/agreements/workers`)).status).toBe(401)
    const workers = await request('/agreements/workers', employerToken)
    expect(workers.status).toBe(200)
    expect((await workers.json()).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: workerId,
          full_name: 'Agreement Worker',
          profession: 'electrician',
        }),
      ]),
    )

    const terms = agreementTerms()
    expect(
      (await request('/agreements', workerToken, 'POST', terms)).status,
    ).toBe(403)
    expect(
      (
        await request('/agreements', employerToken, 'POST', {
          ...terms,
          profession: 'plumber',
          trade_details: { work_type: 'Pipe fitting' },
        })
      ).status,
    ).toBe(409)

    const created = await request('/agreements', employerToken, 'POST', terms)
    const createdBody = await created.json()
    expect(created.status, JSON.stringify(createdBody)).toBe(201)
    const agreement = createdBody.data
    agreementIds.push(agreement.id)
    expect(agreement).toMatchObject({
      employer_id: employerId,
      worker_id: workerId,
      amount_minor: 200000,
      total_minor: 600000,
      status: 'pending',
    })
  })

  it('keeps agreement details private to their participants', async () => {
    const agreementId = agreementIds[0]!
    expect(
      (await request(`/agreements/${agreementId}`, otherWorkerToken)).status,
    ).toBe(404)
    expect(
      (await request(`/agreements/${agreementId}`, employerToken)).status,
    ).toBe(200)
    const workerList = await request('/agreements', workerToken)
    expect((await workerList.json()).data[0]).toMatchObject({
      id: agreementId,
      status: 'pending',
    })
  })

  it('allows the intended worker to respond only once', async () => {
    const agreementId = agreementIds[0]!
    expect(
      (
        await request(
          `/agreements/${agreementId}/accept`,
          employerToken,
          'POST',
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await request(
          `/agreements/${agreementId}/accept`,
          otherWorkerToken,
          'POST',
        )
      ).status,
    ).toBe(404)
    const responses = await Promise.all([
      request(`/agreements/${agreementId}/accept`, workerToken, 'POST'),
      request(`/agreements/${agreementId}/accept`, workerToken, 'POST'),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ])
    const jobs = await admin
      .from('jobs')
      .select('*')
      .eq('agreement_id', agreementId)
    expect(jobs.error).toBeNull()
    expect(jobs.data).toHaveLength(1)
    for (const token of [workerToken, employerToken]) {
      const visible = await request('/agreements/jobs', token)
      expect((await visible.json()).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agreement_id: agreementId,
            status: 'active',
          }),
        ]),
      )
    }
    const otherJobs = await request('/agreements/jobs', otherWorkerToken)
    expect((await otherJobs.json()).data).toHaveLength(0)
    expect((await fetch(`${apiUrl}/agreements/jobs`)).status).toBe(401)
    const directJobs = await createClient(publicUrl, publicKey, {
      auth: { persistSession: false },
    })
      .from('jobs')
      .select('*')
    expect(directJobs.error).not.toBeNull()
    const immutable = await admin
      .from('work_agreements')
      .update({ description: 'Changed accepted terms' })
      .eq('id', agreementId)
    expect(immutable.error).not.toBeNull()
    expect(
      (
        await request(
          `/agreements/${agreementId}/reject`,
          workerToken,
          'POST',
          { reason: null },
        )
      ).status,
    ).toBe(409)
  })

  it('records completion and atomically verifies only after worker confirmation', async () => {
    const jobs = await admin
      .from('jobs')
      .select('id')
      .eq('agreement_id', agreementIds[0]!)
      .single()
    const jobId = jobs.data!.id as string
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/feedback`,
          employerToken,
          'POST',
          { rating: 5, comment: null },
        )
      ).status,
    ).toBe(404)
    const complete = { completed_days: 4, paid_amount_minor: 650000 }
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/complete`,
          otherEmployerToken,
          'POST',
          complete,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await fetch(`${apiUrl}/agreements/jobs/${jobId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(complete),
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/respond`,
          workerToken,
          'POST',
          { confirm: true, reason: null },
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/complete`,
          workerToken,
          'POST',
          complete,
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/complete`,
          employerToken,
          'POST',
          { ...complete, completed_days: 0 },
        )
      ).status,
    ).toBe(400)
    const completed = await request(
      `/agreements/jobs/${jobId}/complete`,
      employerToken,
      'POST',
      complete,
    )
    expect(completed.status).toBe(200)
    expect((await completed.json()).data).toMatchObject({
      status: 'awaiting_confirmation',
      completed_days: 4,
      paid_amount_minor: 650000,
      agreement: { work_days: 3, total_minor: 600000 },
    })
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/complete`,
          employerToken,
          'POST',
          complete,
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/complete`,
          employerToken,
          'POST',
          { ...complete, completed_days: 5 },
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await admin
          .from('verified_work_records')
          .select('*')
          .eq('job_id', jobId)
      ).data,
    ).toHaveLength(0)
    expect(
      (await (await request('/account/worker-history', workerToken)).json())
        .data.stats,
    ).toMatchObject({
      verified_jobs: 0,
      work_days: 0,
      income_minor: 0,
      repeat_employers: 0,
    })
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/respond`,
          otherWorkerToken,
          'POST',
          { confirm: true, reason: null },
        )
      ).status,
    ).toBe(404)
    const responses = await Promise.all([
      request(`/agreements/jobs/${jobId}/respond`, workerToken, 'POST', {
        confirm: true,
        reason: null,
      }),
      request(`/agreements/jobs/${jobId}/respond`, workerToken, 'POST', {
        confirm: true,
        reason: null,
      }),
    ])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const records = await admin
      .from('verified_work_records')
      .select('*')
      .eq('job_id', jobId)
    expect(records.data).toHaveLength(1)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/feedback`,
          otherEmployerToken,
          'POST',
          { rating: 5, comment: null },
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/feedback`,
          workerToken,
          'POST',
          { rating: 5, comment: null },
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/feedback`,
          employerToken,
          'POST',
          { rating: 6, comment: null },
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/feedback`,
          employerToken,
          'POST',
          { rating: 5, comment: 'Good work' },
        )
      ).status,
    ).toBe(201)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/feedback`,
          employerToken,
          'POST',
          { rating: 4, comment: null },
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await (
          await request(`/agreements/jobs/${jobId}/feedback`, workerToken)
        ).json()
      ).data,
    ).toEqual({ rating: 5, comment: 'Good work' })
    expect(
      (await request(`/agreements/jobs/${jobId}/feedback`, otherWorkerToken))
        .status,
    ).toBe(404)
    expect(records.data![0]).toMatchObject({
      worker_id: workerId,
      employer_id: employerId,
      work_days: 4,
      paid_amount_minor: 650000,
    })
    const history = await (
      await request('/account/worker-history', workerToken)
    ).json()
    expect(history.data.stats).toEqual({
      verified_jobs: 1,
      work_days: 4,
      income_minor: 650000,
      repeat_employers: 0,
    })
    expect(history.data.records).toEqual([
      expect.objectContaining({
        job_id: jobId,
        work_days: 4,
        paid_amount_minor: 650000,
        employer_name: 'Agreement Employer',
      }),
    ])
    expect(
      (await request('/account/worker-history', employerToken)).status,
    ).toBe(403)
    expect((await fetch(`${apiUrl}/account/worker-history`)).status).toBe(401)
    expect(
      (
        await (
          await request(
            '/account/worker-history?worker_id=' + workerId,
            otherWorkerToken,
          )
        ).json()
      ).data.stats.verified_jobs,
    ).toBe(0)
    const changed = await admin
      .from('verified_work_records')
      .update({ work_days: 5 })
      .eq('job_id', jobId)
    expect(changed.error).not.toBeNull()
    const publicRecords = await createClient(publicUrl, publicKey, {
      auth: { persistSession: false },
    })
      .from('verified_work_records')
      .select('*')
    expect(publicRecords.error).not.toBeNull()
    const browserClient = createClient(publicUrl, publicKey, {
      auth: { persistSession: false },
    })
    const signedIn = await browserClient.auth.signInWithPassword({
      email: (await admin.auth.admin.getUserById(workerId)).data.user!.email!,
      password,
    })
    expect(signedIn.error).toBeNull()
    expect(
      (await browserClient.from('verified_work_records').select('*')).error,
    ).not.toBeNull()
    expect(
      (
        await browserClient
          .from('jobs')
          .update({ status: 'verified' })
          .eq('id', jobId)
      ).error,
    ).not.toBeNull()
    const directHistory = await browserClient.rpc('worker_history', {
      p_worker_id: workerId,
      p_offset: 0,
    })
    expect(directHistory.error).not.toBeNull()
    const directResponse = await browserClient.rpc('respond_job_completion', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_confirm: true,
      p_reason: null,
    })
    expect(directResponse.error).not.toBeNull()
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/respond`,
          workerToken,
          'POST',
          { confirm: false, reason: null },
        )
      ).status,
    ).toBe(409)
  })

  it('matches the three-day demo and excludes unrelated employers', async () => {
    const terms = {
      ...agreementTerms(),
      worker_id: otherWorkerId,
      profession: 'plumber',
      trade_details: { work_type: 'Pipe repair' },
    }
    const created = await request('/agreements', employerToken, 'POST', terms)
    expect(created.status).toBe(201)
    const agreement = (await created.json()).data
    agreementIds.push(agreement.id)
    await request(
      `/agreements/${agreement.id}/accept`,
      otherWorkerToken,
      'POST',
    )
    const row = await admin
      .from('jobs')
      .select('id')
      .eq('agreement_id', agreement.id)
      .single()
    const jobId = row.data!.id as string
    const before = await (
      await request('/account/worker-history', otherWorkerToken)
    ).json()
    expect(before.data.stats).toEqual({
      verified_jobs: 0,
      work_days: 0,
      income_minor: 0,
      repeat_employers: 0,
    })
    const termsCompleted = { completed_days: 3, paid_amount_minor: 600000 }
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/complete`,
          otherEmployerToken,
          'POST',
          termsCompleted,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/complete`,
          employerToken,
          'POST',
          termsCompleted,
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await (
          await request('/account/worker-history', otherWorkerToken)
        ).json()
      ).data.stats.verified_jobs,
    ).toBe(0)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/respond`,
          otherWorkerToken,
          'POST',
          { confirm: true, reason: null },
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await request(
          `/agreements/jobs/${jobId}/respond`,
          otherWorkerToken,
          'POST',
          { confirm: true, reason: null },
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await (
          await request('/account/worker-history', otherWorkerToken)
        ).json()
      ).data.stats,
    ).toEqual({
      verified_jobs: 1,
      work_days: 3,
      income_minor: 600000,
      repeat_employers: 0,
    })
  })

  it('serializes competing confirmation and dispute responses', async () => {
    const terms = {
      ...agreementTerms(),
      worker_id: otherWorkerId,
      profession: 'plumber',
      trade_details: { work_type: 'Pipe repair' },
    }
    const created = await request('/agreements', employerToken, 'POST', terms)
    const agreement = (await created.json()).data
    agreementIds.push(agreement.id)
    await request(
      `/agreements/${agreement.id}/accept`,
      otherWorkerToken,
      'POST',
    )
    const row = await admin
      .from('jobs')
      .select('id')
      .eq('agreement_id', agreement.id)
      .single()
    const jobId = row.data!.id as string
    await request(`/agreements/jobs/${jobId}/complete`, employerToken, 'POST', {
      completed_days: 1,
      paid_amount_minor: 0,
    })
    const responses = await Promise.all([
      request(`/agreements/jobs/${jobId}/respond`, otherWorkerToken, 'POST', {
        confirm: true,
        reason: null,
      }),
      request(`/agreements/jobs/${jobId}/respond`, otherWorkerToken, 'POST', {
        confirm: false,
        reason: 'Review needed',
      }),
    ])
    expect(responses.map((item) => item.status).sort()).toEqual([200, 409])
    const job = await admin
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .single()
    const records = await admin
      .from('verified_work_records')
      .select('id')
      .eq('job_id', jobId)
    expect(records.data).toHaveLength(job.data!.status === 'verified' ? 1 : 0)
    expect(['verified', 'confirmation_disputed']).toContain(job.data!.status)
  })

  it('counts a repeat employer only after a second verified job', async () => {
    const created = await request(
      '/agreements',
      employerToken,
      'POST',
      agreementTerms(),
    )
    const agreement = (await created.json()).data
    agreementIds.push(agreement.id)
    await request(`/agreements/${agreement.id}/accept`, workerToken, 'POST')
    const job = await admin
      .from('jobs')
      .select('id')
      .eq('agreement_id', agreement.id)
      .single()
    const jobId = job.data!.id as string
    await request(`/agreements/jobs/${jobId}/complete`, employerToken, 'POST', {
      completed_days: 3,
      paid_amount_minor: 600000,
    })
    await request(`/agreements/jobs/${jobId}/respond`, workerToken, 'POST', {
      confirm: true,
      reason: null,
    })
    const history = await (
      await request('/account/worker-history', workerToken)
    ).json()
    expect(history.data.stats).toEqual({
      verified_jobs: 2,
      work_days: 7,
      income_minor: 1250000,
      repeat_employers: 1,
    })
    expect(history.data.records).toHaveLength(2)
    const next = await (
      await request('/account/worker-history?offset=20', workerToken)
    ).json()
    expect(next.data.records).toHaveLength(0)
    expect(next.data.stats).toEqual(history.data.stats)
  })

  it('keeps a disputed completion unverified', async () => {
    const created = await request(
      '/agreements',
      employerToken,
      'POST',
      agreementTerms(),
    )
    const agreement = (await created.json()).data
    agreementIds.push(agreement.id)
    await request(`/agreements/${agreement.id}/accept`, workerToken, 'POST')
    const job = await admin
      .from('jobs')
      .select('id')
      .eq('agreement_id', agreement.id)
      .single()
    const jobId = job.data!.id as string
    await request(`/agreements/jobs/${jobId}/complete`, employerToken, 'POST', {
      completed_days: 3,
      paid_amount_minor: 600000,
    })
    const disputed = await request(
      `/agreements/jobs/${jobId}/respond`,
      workerToken,
      'POST',
      { confirm: false, reason: 'Payment not received' },
    )
    expect(disputed.status).toBe(200)
    expect((await disputed.json()).data).toMatchObject({
      status: 'confirmation_disputed',
      dispute_reason: 'Payment not received',
    })
    expect(
      (
        await admin
          .from('verified_work_records')
          .select('id')
          .eq('job_id', jobId)
      ).data,
    ).toHaveLength(0)
    expect(
      (await (await request('/account/worker-history', workerToken)).json())
        .data.stats.verified_jobs,
    ).toBe(2)
  })

  it('stores an optional private rejection reason', async () => {
    const created = await request(
      '/agreements',
      employerToken,
      'POST',
      agreementTerms(),
    )
    const agreement = (await created.json()).data
    agreementIds.push(agreement.id)
    const rejected = await request(
      `/agreements/${agreement.id}/reject`,
      workerToken,
      'POST',
      { reason: 'Dates are not available.' },
    )
    expect(rejected.status).toBe(200)
    expect((await rejected.json()).data).toMatchObject({
      status: 'rejected',
      rejection_reason: 'Dates are not available.',
    })
    const jobs = await admin
      .from('jobs')
      .select('id')
      .eq('agreement_id', agreement.id)
    expect(jobs.data).toHaveLength(0)
    expect(
      (await request(`/agreements/${agreement.id}`, otherWorkerToken)).status,
    ).toBe(404)
  })

  it('publishes only an explicitly enabled and allowlisted public profile', async () => {
    expect((await fetch(`${apiUrl}/account/public-profile`)).status).toBe(401)
    expect(
      (await request('/account/public-profile', employerToken)).status,
    ).toBe(403)
    const settings = await (
      await request('/account/public-profile', workerToken)
    ).json()
    const publicId = settings.data.public_id as string
    expect(publicId).not.toBe(workerId)
    expect(settings.data.is_public).toBe(false)
    expect(settings.data.public_service_area).toBeNull()
    expect((await fetch(`${apiUrl}/public-profiles/${publicId}`)).status).toBe(
      404,
    )
    expect((await fetch(`${apiUrl}/public-profiles/not-a-uuid`)).status).toBe(
      404,
    )
    expect(
      (await fetch(`${apiUrl}/public-profiles/${crypto.randomUUID()}`)).status,
    ).toBe(404)
    const headers = {
      Authorization: `Bearer ${workerToken}`,
      'Content-Type': 'application/json',
    }
    const privateArea = await admin
      .from('worker_profiles')
      .update({ service_area: 'PRIVATE ADDRESS 42' })
      .eq('user_id', workerId)
    expect(privateArea.error).toBeNull()
    expect(
      (
        await fetch(`${apiUrl}/account/public-profile`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ is_public: true }),
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await fetch(`${apiUrl}/account/public-profile`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            is_public: true,
            public_service_area: 'Lahore',
            user_id: otherWorkerId,
          }),
        })
      ).status,
    ).toBe(400)
    const enabled = await fetch(`${apiUrl}/account/public-profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ is_public: true, public_service_area: 'Lahore' }),
    })
    expect(enabled.status).toBe(200)
    const response = await fetch(`${apiUrl}/public-profiles/${publicId}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = await response.json()
    expect(body.data).toEqual({
      public_id: publicId,
      full_name: 'Agreement Worker',
      profession: 'electrician',
      service_area: 'Lahore',
      experience_years: 0,
      skills: [],
      records: [],
      stats: { verified_jobs: 2, work_days: 7, repeat_employers: 1 },
    })
    const text = JSON.stringify(body)
    for (const sensitive of [
      workerId,
      employerId,
      'paid_amount_minor',
      'income_minor',
      'description',
      'email',
      'phone',
      'trade_details',
      'Install a distribution board',
      'PRIVATE ADDRESS 42',
    ])
      expect(text).not.toContain(sensitive)
    const history = await (
      await request('/account/worker-history', workerToken)
    ).json()
    const recordId = history.data.records[0].id as string
    const shareUrl = `${apiUrl}/account/public-records/${recordId}`
    expect(
      (
        await fetch(shareUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${otherWorkerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ summary: 'Other worker' }),
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await fetch(shareUrl, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            summary: 'Installed wiring',
            employer_id: employerId,
          }),
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await fetch(shareUrl, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ summary: 'Installed wiring' }),
        })
      ).status,
    ).toBe(200)
    const shared = await (
      await fetch(`${apiUrl}/public-profiles/${publicId}`)
    ).json()
    expect(shared.data.records).toHaveLength(1)
    expect(shared.data.records[0].summary).toBe('Installed wiring')
    expect(JSON.stringify(shared.data.records)).not.toContain(
      'paid_amount_minor',
    )
    expect(JSON.stringify(shared.data.records)).not.toContain(employerId)
    expect(
      (
        await fetch(shareUrl, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ summary: null }),
        })
      ).status,
    ).toBe(200)
    expect(
      (await (await fetch(`${apiUrl}/public-profiles/${publicId}`)).json()).data
        .records,
    ).toEqual([])
    const browserClient = createClient(publicUrl, publicKey, {
      auth: { persistSession: false },
    })
    expect(
      (await browserClient.rpc('public_kaampass', { p_public_id: publicId }))
        .error,
    ).not.toBeNull()
    for (const table of [
      'worker_profiles',
      'public_work_shares',
      'verified_work_records',
      'work_agreements',
    ]) {
      const result = await browserClient.from(table).select('*').limit(1)
      expect(result.error).not.toBeNull()
    }
    expect(
      (
        await fetch(shareUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: 'unauthorized' }),
        })
      ).status,
    ).toBe(401)
    const disabled = await fetch(`${apiUrl}/account/public-profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ is_public: false }),
    })
    expect(disabled.status).toBe(200)
    expect((await fetch(`${apiUrl}/public-profiles/${publicId}`)).status).toBe(
      404,
    )
  })

  it('keeps portfolio images private until both sharing settings are enabled', async () => {
    const settings = await (
      await request('/account/public-profile', workerToken)
    ).json()
    const publicId = settings.data.public_id as string
    const form = new FormData()
    form.append('caption', 'Example work')
    form.append(
      'image',
      new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
        type: 'image/png',
      }),
      'example.png',
    )
    const uploaded = await fetch(`${apiUrl}/portfolio`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` },
      body: form,
    })
    expect(uploaded.status).toBe(201)
    const item = (await uploaded.json()).data
    const itemUrl = `${apiUrl}/portfolio/${item.id}`
    const imageUrl = `${apiUrl}/portfolio/public/${publicId}/${item.id}/image`
    const headers = {
      Authorization: `Bearer ${workerToken}`,
      'Content-Type': 'application/json',
    }
    try {
      expect(item.is_public).toBe(false)
      expect(item.storage_path).toBeUndefined()
      expect(
        (
          await fetch(`${itemUrl}/image`, {
            headers: { Authorization: `Bearer ${otherWorkerToken}` },
          })
        ).status,
      ).toBe(404)
      expect(
        (
          await fetch(itemUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${otherWorkerToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ caption: 'Wrong owner', is_public: true }),
          })
        ).status,
      ).toBe(404)
      expect((await fetch(imageUrl)).status).toBe(404)
      await admin
        .from('worker_profiles')
        .update({ is_public: true, public_service_area: 'Lahore' })
        .eq('user_id', workerId)
      expect((await fetch(imageUrl)).status).toBe(404)
      expect(
        (
          await fetch(itemUrl, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ caption: 'Example work', is_public: true }),
          })
        ).status,
      ).toBe(200)
      const image = await fetch(imageUrl)
      expect(image.status).toBe(200)
      expect(image.headers.get('cache-control')).toBe('no-store')
      expect(
        (await (await fetch(`${apiUrl}/portfolio/public/${publicId}`)).json())
          .data,
      ).toHaveLength(1)
      await admin
        .from('worker_profiles')
        .update({ is_public: false })
        .eq('user_id', workerId)
      expect((await fetch(imageUrl)).status).toBe(404)
    } finally {
      await fetch(itemUrl, { method: 'DELETE', headers })
      await admin
        .from('worker_profiles')
        .update({ is_public: false })
        .eq('user_id', workerId)
    }
    expect((await fetch(`${itemUrl}/image`, { headers })).status).toBe(404)
  })

  async function createUser(name: string, role: 'worker' | 'employer') {
    const email = `agreement-${crypto.randomUUID()}@example.test`
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
      throw new Error('Agreement test user setup failed.')
    return { id: result.data.user.id, email }
  }

  async function signIn(email: string) {
    const client = createClient(publicUrl, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await client.auth.signInWithPassword({ email, password })
    if (result.error || !result.data.session)
      throw new Error('Agreement test sign-in failed.')
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

  function agreementTerms() {
    return {
      worker_id: workerId,
      profession: 'electrician',
      description: 'Install a distribution board safely',
      work_days: 3,
      pricing_model: 'daily_rate',
      amount_minor: 200000,
      currency_code: 'PKR',
      materials_responsibility: 'employer',
      trade_details: { work_type: 'DB installation', circuit_count: 6 },
    }
  }
})
