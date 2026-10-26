import { publicProfileSchema } from '@kaampass/contracts'
import { Router } from 'express'
import { z } from 'zod'
import type { ApiEnvironment } from '../config/env.js'
import { ApiError } from '../middleware/error-handler.js'
import { createServerSupabaseClient } from '../platform/supabase/client.js'

export function createPublicProfileRouter(environment: ApiEnvironment) {
  const router = Router()
  router.get('/:id', async (request, response) => {
    response.set('Cache-Control', 'no-store')
    const id = z.uuid().safeParse(request.params.id)
    if (!id.success)
      throw new ApiError(
        404,
        'PUBLIC_PROFILE_NOT_FOUND',
        'Public profile not found.',
      )
    if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY)
      throw new ApiError(
        503,
        'PUBLIC_PROFILE_UNAVAILABLE',
        'Public profiles are unavailable.',
      )
    const { data, error } = await createServerSupabaseClient(environment).rpc(
      'public_kaampass',
      { p_public_id: id.data },
    )
    if (error)
      throw new ApiError(
        503,
        'PUBLIC_PROFILE_UNAVAILABLE',
        'Public profiles are unavailable.',
      )
    if (!data)
      throw new ApiError(
        404,
        'PUBLIC_PROFILE_NOT_FOUND',
        'Public profile not found.',
      )
    response.json({ data: publicProfileSchema.parse(data) })
  })
  return router
}
