import { accountRoleSchema, type AccountRole } from '@kaampass/contracts'
import type { RequestHandler } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'

import { ApiError } from './error-handler.js'

export interface AuthenticatedAccount {
  id: string
  role: AccountRole
}

export function authenticate(getClient: () => SupabaseClient): RequestHandler {
  return async (request, response, next) => {
    const token = request
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1]
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.')

    const client = getClient()
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) {
      throw new ApiError(
        401,
        'UNAUTHENTICATED',
        'Your session is invalid or expired.',
      )
    }
    const profile = await client
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle()
    if (profile.error)
      throw new ApiError(
        503,
        'PROFILE_UNAVAILABLE',
        'Unable to load your account.',
      )
    if (!profile.data)
      throw new ApiError(
        404,
        'PROFILE_NOT_FOUND',
        'Your account profile was not found.',
      )
    const role = accountRoleSchema.parse(profile.data.role)
    response.locals.account = {
      id: data.user.id,
      role,
    } satisfies AuthenticatedAccount
    next()
  }
}

export function requireRole(role: AccountRole): RequestHandler {
  return (_request, response, next) => {
    const account = response.locals.account as AuthenticatedAccount | undefined
    if (!account) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.')
    if (account.role !== role)
      throw new ApiError(
        403,
        'FORBIDDEN',
        'This account cannot access that resource.',
      )
    next()
  }
}
