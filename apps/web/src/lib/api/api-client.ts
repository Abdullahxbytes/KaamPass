import {
  apiErrorResponseSchema,
  type ApiErrorResponse,
} from '@kaampass/contracts'
import type { ZodType } from 'zod'

import { env } from '../config/env'

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, response: ApiErrorResponse) {
    super(response.error.message)
    this.name = 'ApiClientError'
    this.code = response.error.code
    this.status = status
  }
}

async function get<T>(
  path: string,
  schema: ZodType<T>,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const requestOptions: RequestInit = {
    headers: { Accept: 'application/json' },
  }

  if (options.signal) {
    requestOptions.signal = options.signal
  }

  const response = await fetch(`${env.apiUrl}${path}`, requestOptions)

  const payload: unknown = await response.json()

  if (!response.ok) {
    const errorResponse = apiErrorResponseSchema.safeParse(payload)

    if (errorResponse.success) {
      throw new ApiClientError(response.status, errorResponse.data)
    }

    throw new Error(`The API returned status ${response.status}.`)
  }

  return schema.parse(payload)
}

async function authenticatedRequest<T>(
  path: string,
  token: string,
  schema: ZodType<T>,
  options: { method: 'GET' | 'PATCH' | 'POST' | 'DELETE'; body?: unknown },
): Promise<T> {
  const response = await fetch(`${env.apiUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  })

  const payload: unknown = await response.json()
  if (!response.ok) {
    const errorResponse = apiErrorResponseSchema.safeParse(payload)
    if (errorResponse.success) {
      throw new ApiClientError(response.status, errorResponse.data)
    }
    throw new Error(`The API returned status ${response.status}.`)
  }
  return schema.parse(payload)
}

async function authenticatedUpload<T>(
  path: string,
  token: string,
  schema: ZodType<T>,
  body: FormData,
): Promise<T> {
  const response = await fetch(`${env.apiUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
  })
  const payload: unknown = await response.json()
  if (!response.ok) {
    const errorResponse = apiErrorResponseSchema.safeParse(payload)
    if (errorResponse.success)
      throw new ApiClientError(response.status, errorResponse.data)
    throw new Error(`The API returned status ${response.status}.`)
  }
  return schema.parse(payload)
}

export const apiClient = { get, authenticatedRequest, authenticatedUpload }
