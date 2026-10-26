import {
  accountProfileSchema,
  updateLanguageSchema,
  workerProfileSchema,
  employerProfileSchema,
  type AccountProfile,
  workerHistorySchema,
  updatePublicProfileSettingsSchema,
} from '@kaampass/contracts'
import { Router } from 'express'
import { z } from 'zod'

import type { ApiEnvironment } from '../config/env.js'
import { ApiError } from '../middleware/error-handler.js'
import {
  authenticate,
  requireRole,
  type AuthenticatedAccount,
} from '../middleware/authorization.js'
import { createServerSupabaseClient } from '../platform/supabase/client.js'

export function createAccountRouter(environment: ApiEnvironment) {
  const router = Router()

  function getSupabase() {
    if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ApiError(
        503,
        'AUTH_UNAVAILABLE',
        'Authentication is not configured.',
      )
    }
    return createServerSupabaseClient(environment)
  }

  router.use(authenticate(getSupabase))

  async function loadProfile(userId: string): Promise<AccountProfile> {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('id, full_name, role, preferred_language')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      throw new ApiError(
        503,
        'PROFILE_UNAVAILABLE',
        'Unable to load your account.',
      )
    }
    if (!data) {
      throw new ApiError(
        404,
        'PROFILE_NOT_FOUND',
        'Your account profile was not found.',
      )
    }

    return accountProfileSchema.parse({
      id: data.id,
      fullName: data.full_name,
      role: data.role,
      preferredLanguage: data.preferred_language,
    })
  }

  router.get('/me', async (_request, response) => {
    const profile = await loadProfile(
      (response.locals.account as AuthenticatedAccount).id,
    )
    response.json({ data: profile })
  })

  router.patch('/preferences', async (request, response) => {
    const parsed = updateLanguageSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ApiError(
        400,
        'INVALID_PREFERENCE',
        'Choose a supported language.',
      )
    }

    const userId = (response.locals.account as AuthenticatedAccount).id
    const { error } = await getSupabase()
      .from('profiles')
      .update({ preferred_language: parsed.data.preferredLanguage })
      .eq('id', userId)
    if (error) {
      throw new ApiError(
        503,
        'PROFILE_UNAVAILABLE',
        'Unable to save your preference.',
      )
    }

    response.json({ data: await loadProfile(userId) })
  })

  // These private reads are scoped exclusively to the verified account.
  router.get(
    '/public-profile',
    requireRole('worker'),
    async (_request, response) => {
      const account = response.locals.account as AuthenticatedAccount
      const { data, error } = await getSupabase()
        .from('worker_profiles')
        .select('public_id, is_public, public_service_area')
        .eq('user_id', account.id)
        .maybeSingle()
      if (error)
        throw new ApiError(
          503,
          'PUBLIC_PROFILE_UNAVAILABLE',
          'Unable to load sharing settings.',
        )
      response.set('Cache-Control', 'no-store').json({ data })
    },
  )

  router.patch(
    '/public-profile',
    requireRole('worker'),
    async (request, response) => {
      const parsed = updatePublicProfileSettingsSchema.safeParse(request.body)
      if (!parsed.success)
        throw new ApiError(
          400,
          'INVALID_PUBLIC_SETTINGS',
          'Choose a valid sharing setting.',
        )
      const account = response.locals.account as AuthenticatedAccount
      const { data, error } = await getSupabase()
        .from('worker_profiles')
        .update(parsed.data)
        .eq('user_id', account.id)
        .select('public_id, is_public, public_service_area')
        .maybeSingle()
      if (error)
        throw new ApiError(
          503,
          'PUBLIC_PROFILE_UNAVAILABLE',
          'Unable to update sharing settings.',
        )
      if (!data)
        throw new ApiError(
          409,
          'WORKER_PROFILE_REQUIRED',
          'Complete your worker profile first.',
        )
      response.set('Cache-Control', 'no-store').json({ data })
    },
  )

  router.patch(
    '/public-records/:id',
    requireRole('worker'),
    async (request, response) => {
      const id = z.uuid().safeParse(request.params.id)
      const body = z
        .strictObject({ summary: z.string().trim().min(1).max(200).nullable() })
        .safeParse(request.body)
      if (!id.success || !body.success)
        throw new ApiError(
          400,
          'INVALID_PUBLIC_RECORD',
          'Enter a valid public summary.',
        )
      const account = response.locals.account as AuthenticatedAccount
      const { data, error } = await getSupabase().rpc('set_public_work_share', {
        p_worker_id: account.id,
        p_record_id: id.data,
        p_summary: body.data.summary,
      })
      if (error)
        throw new ApiError(
          503,
          'PUBLIC_RECORD_UNAVAILABLE',
          'Unable to update the shared record.',
        )
      if (!data)
        throw new ApiError(404, 'RECORD_NOT_FOUND', 'Work record not found.')
      response.set('Cache-Control', 'no-store').json({ data: body.data })
    },
  )

  router.get(
    '/worker-history',
    requireRole('worker'),
    async (request, response) => {
      const parsed = z.coerce
        .number()
        .int()
        .min(0)
        .max(1000000)
        .safeParse(request.query.offset ?? 0)
      if (!parsed.success)
        throw new ApiError(400, 'INVALID_HISTORY_PAGE', 'Invalid history page.')
      const account = response.locals.account as AuthenticatedAccount
      const { data, error } = await getSupabase().rpc('worker_history', {
        p_worker_id: account.id,
        p_offset: parsed.data,
      })
      if (error)
        throw new ApiError(
          503,
          'HISTORY_UNAVAILABLE',
          'Unable to load verified work history.',
        )
      response.json({ data: workerHistorySchema.parse(data) })
    },
  )

  router.get(
    '/worker-profile',
    requireRole('worker'),
    async (_request, response) => {
      const account = response.locals.account as AuthenticatedAccount
      const { data, error } = await getSupabase()
        .from('worker_profiles')
        .select(
          'profession, service_area, experience_years, bio, availability, typical_rate_minor, currency_code, trade_details',
        )
        .eq('user_id', account.id)
        .maybeSingle()
      if (error)
        throw new ApiError(
          503,
          'PROFILE_UNAVAILABLE',
          'Unable to load your profile.',
        )
      if (!data) return void response.json({ data: null })
      const skills = await getSupabase()
        .from('worker_skills')
        .select('skills(slug)')
        .eq('worker_id', account.id)
      if (skills.error)
        throw new ApiError(
          503,
          'PROFILE_UNAVAILABLE',
          'Unable to load your skills.',
        )
      response.json({
        data: {
          ...data,
          skills: skills.data.map(
            (item) => (item.skills as unknown as { slug: string }).slug,
          ),
        },
      })
    },
  )

  router.patch(
    '/worker-profile',
    requireRole('worker'),
    async (request, response) => {
      const parsed = workerProfileSchema.safeParse(request.body)
      if (!parsed.success)
        throw new ApiError(
          400,
          'INVALID_PROFILE',
          'Check your profile details.',
        )
      const account = response.locals.account as AuthenticatedAccount
      const { error } = await getSupabase().rpc('save_worker_profile', {
        p_user_id: account.id,
        p_profile: parsed.data,
      })
      if (error?.code === 'P0001')
        throw new ApiError(
          409,
          'PROFESSION_LOCKED',
          'Your profession cannot be changed.',
        )
      if (error)
        throw new ApiError(
          503,
          'PROFILE_UNAVAILABLE',
          'Unable to save your profile.',
        )
      response.json({ data: parsed.data })
    },
  )

  router.patch(
    '/employer-profile',
    requireRole('employer'),
    async (request, response) => {
      const parsed = employerProfileSchema.safeParse(request.body)
      if (!parsed.success)
        throw new ApiError(
          400,
          'INVALID_PROFILE',
          'Check your profile details.',
        )
      const account = response.locals.account as AuthenticatedAccount
      const { error } = await getSupabase()
        .from('employer_profiles')
        .upsert({ user_id: account.id, ...parsed.data })
      if (error)
        throw new ApiError(
          503,
          'PROFILE_UNAVAILABLE',
          'Unable to save your profile.',
        )
      response.json({ data: parsed.data })
    },
  )

  router.get(
    '/employer-profile',
    requireRole('employer'),
    async (_request, response) => {
      const account = response.locals.account as AuthenticatedAccount
      const { data, error } = await getSupabase()
        .from('employer_profiles')
        .select('employer_type, organization_name')
        .eq('user_id', account.id)
        .maybeSingle()
      if (error)
        throw new ApiError(
          503,
          'PROFILE_UNAVAILABLE',
          'Unable to load your profile.',
        )
      response.json({ data })
    },
  )

  return router
}
