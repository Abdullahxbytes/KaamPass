import cors from 'cors'
import express from 'express'

import type { ApiEnvironment } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { createAccountRouter } from './routes/account.route.js'
import { createAgreementRouter } from './routes/agreement.route.js'
import { healthRouter } from './routes/health.route.js'
import { createJobPostRouter } from './routes/job-post.route.js'
import { createPublicProfileRouter } from './routes/public-profile.route.js'
import { createPortfolioRouter } from './routes/portfolio.route.js'

export function createApp(env: ApiEnvironment) {
  const app = express()

  app.disable('x-powered-by')
  app.use(cors({ origin: env.WEB_ORIGIN }))
  app.use(express.json({ limit: '100kb' }))

  app.use('/health', healthRouter)
  app.use('/account', createAccountRouter(env))
  app.use('/portfolio', createPortfolioRouter(env))
  app.use('/agreements', createAgreementRouter(env))
  app.use('/job-posts', createJobPostRouter(env))
  app.use('/public-profiles', createPublicProfileRouter(env))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
