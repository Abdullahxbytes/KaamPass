import type { ApiErrorResponse } from '@kaampass/contracts'
import type { ErrorRequestHandler, RequestHandler } from 'express'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const notFoundHandler: RequestHandler = (request, response) => {
  const body: ApiErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `No endpoint exists at ${request.method} ${request.path}.`,
    },
  }

  response.status(404).json(body)
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  void next

  const status = error instanceof ApiError ? error.status : 500
  const body: ApiErrorResponse = {
    error: {
      code: error instanceof ApiError ? error.code : 'INTERNAL_SERVER_ERROR',
      message:
        error instanceof ApiError
          ? error.message
          : 'An unexpected error occurred.',
    },
  }

  if (!(error instanceof ApiError)) {
    console.error(error)
  }

  response.status(status).json(body)
}
