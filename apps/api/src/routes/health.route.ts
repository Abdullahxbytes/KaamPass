import type { HealthResponse } from '@kaampass/contracts'
import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  const body: HealthResponse = {
    data: {
      status: 'ok',
      service: 'kaampass-api',
      timestamp: new Date().toISOString(),
    },
  }

  response.status(200).json(body)
})
