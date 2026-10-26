import {
  createAgreementSchema,
  rejectAgreementSchema,
  completeJobSchema,
  respondJobCompletionSchema,
} from '@kaampass/contracts'
import { Router } from 'express'
import { z } from 'zod'

import type { ApiEnvironment } from '../config/env.js'
import {
  authenticate,
  requireRole,
  type AuthenticatedAccount,
} from '../middleware/authorization.js'
import { ApiError } from '../middleware/error-handler.js'
import { createServerSupabaseClient } from '../platform/supabase/client.js'
import { AgreementService } from '../services/agreement.service.js'

const agreementIdSchema = z.uuid()

export function createAgreementRouter(environment: ApiEnvironment) {
  const router = Router()

  function getService() {
    if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ApiError(
        503,
        'AGREEMENTS_UNAVAILABLE',
        'Agreements are not configured.',
      )
    }
    return new AgreementService(createServerSupabaseClient(environment))
  }

  router.use(authenticate(() => createServerSupabaseClient(environment)))

  router.get(
    '/workers',
    requireRole('employer'),
    async (_request, response) => {
      response.json({ data: await getService().listWorkers() })
    },
  )

  router.post('/', requireRole('employer'), async (request, response) => {
    const parsed = createAgreementSchema.safeParse(request.body)
    if (!parsed.success)
      throw new ApiError(
        400,
        'INVALID_AGREEMENT',
        'Check every agreement term and try again.',
      )
    const account = response.locals.account as AuthenticatedAccount
    const agreement = await getService().createAgreement(
      account.id,
      parsed.data,
    )
    response.status(201).json({ data: agreement })
  })

  router.get('/', async (_request, response) => {
    const account = response.locals.account as AuthenticatedAccount
    response.json({ data: await getService().listAgreements(account) })
  })

  router.get('/jobs', async (_request, response) => {
    const account = response.locals.account as AuthenticatedAccount
    response.json({ data: await getService().listJobs(account) })
  })

  router.get('/jobs/:id/feedback', async (request, response) => {
    const id = parseAgreementId(request.params.id)
    const account = response.locals.account as AuthenticatedAccount
    const client = createServerSupabaseClient(environment)
    const record = await client
      .from('verified_work_records')
      .select('job_id')
      .eq('job_id', id)
      .eq(account.role === 'employer' ? 'employer_id' : 'worker_id', account.id)
      .maybeSingle()
    if (record.error)
      throw new ApiError(
        503,
        'FEEDBACK_UNAVAILABLE',
        'Unable to load feedback.',
      )
    if (!record.data)
      throw new ApiError(
        404,
        'VERIFIED_JOB_NOT_FOUND',
        'Verified job not found.',
      )
    const feedback = await client
      .from('job_feedback')
      .select('rating, comment')
      .eq('job_id', id)
      .maybeSingle()
    if (feedback.error)
      throw new ApiError(
        503,
        'FEEDBACK_UNAVAILABLE',
        'Unable to load feedback.',
      )
    response.set('Cache-Control', 'no-store').json({ data: feedback.data })
  })

  router.post(
    '/jobs/:id/feedback',
    requireRole('employer'),
    async (request, response) => {
      const id = parseAgreementId(request.params.id)
      const input = z
        .strictObject({
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().min(1).max(500).nullable(),
        })
        .safeParse(request.body)
      if (!input.success)
        throw new ApiError(
          400,
          'INVALID_FEEDBACK',
          'Choose a rating and check your comment.',
        )
      const account = response.locals.account as AuthenticatedAccount
      const { data, error } = await createServerSupabaseClient(environment).rpc(
        'submit_job_feedback',
        {
          p_job_id: id,
          p_employer_id: account.id,
          p_rating: input.data.rating,
          p_comment: input.data.comment,
        },
      )
      if (error)
        throw new ApiError(
          503,
          'FEEDBACK_UNAVAILABLE',
          'Unable to save feedback.',
        )
      if (data === 'not_found')
        throw new ApiError(
          404,
          'VERIFIED_JOB_NOT_FOUND',
          'Verified job not found.',
        )
      if (data === 'exists')
        throw new ApiError(
          409,
          'FEEDBACK_EXISTS',
          'Feedback has already been submitted.',
        )
      if (data !== 'created')
        throw new ApiError(
          400,
          'INVALID_FEEDBACK',
          'Choose a rating and check your comment.',
        )
      response.status(201).json({ data: input.data })
    },
  )

  router.post(
    '/jobs/:id/complete',
    requireRole('employer'),
    async (request, response) => {
      const id = parseAgreementId(request.params.id)
      const parsed = completeJobSchema.safeParse(request.body)
      if (!parsed.success)
        throw new ApiError(
          400,
          'INVALID_JOB_UPDATE',
          'Check the completed days and payment amount.',
        )
      const account = response.locals.account as AuthenticatedAccount
      response.json({
        data: await getService().completeJob(account, id, parsed.data),
      })
    },
  )

  router.post(
    '/jobs/:id/respond',
    requireRole('worker'),
    async (request, response) => {
      const id = parseAgreementId(request.params.id)
      const parsed = respondJobCompletionSchema.safeParse(request.body)
      if (!parsed.success)
        throw new ApiError(
          400,
          'INVALID_JOB_UPDATE',
          'Check your response and reason.',
        )
      const account = response.locals.account as AuthenticatedAccount
      response.json({
        data: await getService().respondJobCompletion(account, id, parsed.data),
      })
    },
  )

  router.get('/:id', async (request, response) => {
    const id = parseAgreementId(request.params.id)
    const account = response.locals.account as AuthenticatedAccount
    response.json({ data: await getService().getAgreement(account, id) })
  })

  router.post(
    '/:id/accept',
    requireRole('worker'),
    async (request, response) => {
      const id = parseAgreementId(request.params.id)
      const account = response.locals.account as AuthenticatedAccount
      response.json({
        data: await getService().acceptAgreement(account.id, id),
      })
    },
  )

  router.post(
    '/:id/reject',
    requireRole('worker'),
    async (request, response) => {
      const id = parseAgreementId(request.params.id)
      const parsed = rejectAgreementSchema.safeParse(request.body)
      if (!parsed.success)
        throw new ApiError(
          400,
          'INVALID_REJECTION',
          'The rejection reason must be 500 characters or fewer.',
        )
      const account = response.locals.account as AuthenticatedAccount
      response.json({
        data: await getService().rejectAgreement(
          account.id,
          id,
          parsed.data.reason,
        ),
      })
    },
  )

  return router
}

function parseAgreementId(value: unknown) {
  const parsed = agreementIdSchema.safeParse(value)
  if (!parsed.success)
    throw new ApiError(400, 'INVALID_AGREEMENT_ID', 'Invalid agreement ID.')
  return parsed.data
}
