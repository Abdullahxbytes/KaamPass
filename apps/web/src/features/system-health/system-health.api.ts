import { healthResponseSchema } from '@kaampass/contracts'

import { apiClient } from '../../lib/api/api-client'

export type SystemHealthState =
  | { status: 'checking' }
  | { status: 'ready'; checkedAt: string }
  | { status: 'unavailable'; message: string }

export function getSystemHealth(signal?: AbortSignal) {
  return signal
    ? apiClient.get('/health', healthResponseSchema, { signal })
    : apiClient.get('/health', healthResponseSchema)
}
