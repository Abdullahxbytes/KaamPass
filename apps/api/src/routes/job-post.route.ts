import { createJobBidSchema, createJobPostSchema } from '@kaampass/contracts'
import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import { z } from 'zod'

import type { ApiEnvironment } from '../config/env.js'
import {
  authenticate,
  requireRole,
  type AuthenticatedAccount,
} from '../middleware/authorization.js'
import { ApiError } from '../middleware/error-handler.js'
import { createServerSupabaseClient } from '../platform/supabase/client.js'
import { JobPostService } from '../services/job-post.service.js'

const idSchema = z.uuid()
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 3, fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, allowedImageTypes.has(file.mimetype))
  },
})

const parseImages: RequestHandler = (request, response, next) => {
  imageUpload.array('images', 3)(request, response, (error) => {
    if (error)
      return next(
        new ApiError(
          400,
          'INVALID_IMAGES',
          'Upload up to three JPEG, PNG, or WebP images, each no larger than 5 MB.',
        ),
      )
    next()
  })
}

export function createJobPostRouter(environment: ApiEnvironment) {
  const router = Router()
  const getClient = () => createServerSupabaseClient(environment)
  const getService = () => new JobPostService(getClient())

  router.use(authenticate(getClient))

  router.get('/', async (_request, response) => {
    const account = response.locals.account as AuthenticatedAccount
    response.json({ data: await getService().listJobPosts(account) })
  })

  router.post('/', requireRole('employer'), async (request, response) => {
    const parsed = createJobPostSchema.safeParse(request.body)
    if (!parsed.success)
      throw new ApiError(
        400,
        'INVALID_JOB_POST',
        'Check the work request details and try again.',
      )
    const account = response.locals.account as AuthenticatedAccount
    response.status(201).json({
      data: await getService().createJobPost(account.id, parsed.data),
    })
  })

  router.post(
    '/:id/images',
    requireRole('employer'),
    parseImages,
    async (request, response) => {
      const account = response.locals.account as AuthenticatedAccount
      response.json({
        data: await getService().uploadImages(
          account.id,
          parseId(request.params.id, 'work request'),
          request.files as Express.Multer.File[],
        ),
      })
    },
  )

  router.post('/:id/bids', requireRole('worker'), async (request, response) => {
    const parsed = createJobBidSchema.safeParse(request.body)
    if (!parsed.success)
      throw new ApiError(
        400,
        'INVALID_BID',
        'Check the bid amount, estimated days, and message.',
      )
    const account = response.locals.account as AuthenticatedAccount
    response.status(201).json({
      data: await getService().createBid(
        account.id,
        parseId(request.params.id, 'work request'),
        parsed.data,
      ),
    })
  })

  router.post(
    '/:id/bids/:bidId/select',
    requireRole('employer'),
    async (request, response) => {
      const account = response.locals.account as AuthenticatedAccount
      const jobPostId = parseId(request.params.id, 'work request')
      const bidId = parseId(request.params.bidId, 'bid')
      const result = await getService().selectBid(account.id, jobPostId, bidId)
      response.json({ data: result })
    },
  )

  return router
}

function parseId(value: unknown, label: string) {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success)
    throw new ApiError(400, 'INVALID_ID', `Invalid ${label} ID.`)
  return parsed.data
}
