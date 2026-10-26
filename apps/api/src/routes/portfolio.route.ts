import { randomUUID } from 'node:crypto'
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
import { hasExpectedImageSignature } from '../services/job-post.service.js'

const id = z.uuid()
const itemFields = 'id, caption, is_public, created_at'
const updateSchema = z.strictObject({
  caption: z.string().trim().min(1).max(200),
  is_public: z.boolean(),
})
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})
const parseUpload: RequestHandler = (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (error)
      return next(
        new ApiError(
          400,
          'INVALID_IMAGE',
          'Choose a JPEG, PNG or WebP image under 5 MB.',
        ),
      )
    next()
  })
}

export function createPortfolioRouter(env: ApiEnvironment) {
  const router = Router()
  const client = () => createServerSupabaseClient(env)
  const unavailable = () =>
    new ApiError(503, 'PORTFOLIO_UNAVAILABLE', 'Unable to access portfolio.')
  const notFound = () =>
    new ApiError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio image not found.')
  const parseId = (value: string | undefined) => {
    const parsed = id.safeParse(value)
    if (!parsed.success) throw notFound()
    return parsed.data
  }

  // Public reads always re-check both the profile and individual image visibility.
  async function publicWorker(publicId: string | undefined) {
    const { data, error } = await client()
      .from('worker_profiles')
      .select('user_id')
      .eq('public_id', parseId(publicId))
      .eq('is_public', true)
      .maybeSingle()
    if (error) throw unavailable()
    if (!data) throw notFound()
    return data.user_id as string
  }
  router.get('/public/:publicId', async (req, res) => {
    const worker = await publicWorker(req.params.publicId)
    const { data, error } = await client()
      .from('worker_portfolio')
      .select(itemFields)
      .eq('worker_id', worker)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    if (error) throw unavailable()
    res.set('Cache-Control', 'no-store').json({ data })
  })
  router.get('/public/:publicId/:id/image', async (req, res) => {
    const worker = await publicWorker(req.params.publicId)
    const { data, error } = await client()
      .from('worker_portfolio')
      .select('storage_path')
      .eq('worker_id', worker)
      .eq('id', parseId(req.params.id))
      .eq('is_public', true)
      .maybeSingle()
    if (error) throw unavailable()
    if (!data) throw notFound()
    const result = await client()
      .storage.from('worker-portfolio')
      .download(data.storage_path)
    if (result.error || !result.data) throw notFound()
    res
      .set({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': result.data.type,
      })
      .send(Buffer.from(await result.data.arrayBuffer()))
  })
  router.use(authenticate(client), requireRole('worker'))
  router.get('/:id/image', async (req, res) => {
    const account = res.locals.account as AuthenticatedAccount
    const { data, error } = await client()
      .from('worker_portfolio')
      .select('storage_path')
      .eq('worker_id', account.id)
      .eq('id', parseId(req.params.id))
      .maybeSingle()
    if (error) throw unavailable()
    if (!data) throw notFound()
    const result = await client()
      .storage.from('worker-portfolio')
      .download(data.storage_path)
    if (result.error || !result.data) throw notFound()
    res
      .set({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': result.data.type,
      })
      .send(Buffer.from(await result.data.arrayBuffer()))
  })
  router.get('/', async (_req, res) => {
    const account = res.locals.account as AuthenticatedAccount
    const { data, error } = await client()
      .from('worker_portfolio')
      .select(itemFields)
      .eq('worker_id', account.id)
      .order('created_at', { ascending: false })
    if (error) throw unavailable()
    res.set('Cache-Control', 'no-store').json({ data })
  })
  router.post('/', parseUpload, async (req, res) => {
    const account = res.locals.account as AuthenticatedAccount
    const caption = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .safeParse(req.body.caption)
    if (!caption.success || !req.file || !hasExpectedImageSignature(req.file))
      throw new ApiError(
        400,
        'INVALID_IMAGE',
        'Add a caption and choose a JPEG, PNG or WebP image under 5 MB.',
      )
    const path = `${account.id}/${randomUUID()}`
    const storage = client().storage.from('worker-portfolio')
    const result = await storage.upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
    })
    if (result.error) throw unavailable()
    const saved = await client()
      .from('worker_portfolio')
      .insert({
        worker_id: account.id,
        storage_path: path,
        caption: caption.data,
      })
      .select(itemFields)
      .single()
    if (saved.error) {
      await storage.remove([path])
      throw unavailable()
    }
    res.status(201).set('Cache-Control', 'no-store').json({ data: saved.data })
  })
  router.patch('/:id', async (req, res) => {
    const account = res.locals.account as AuthenticatedAccount
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success)
      throw new ApiError(
        400,
        'INVALID_PORTFOLIO',
        'Enter a caption and a valid visibility setting.',
      )
    const { data, error } = await client()
      .from('worker_portfolio')
      .update(parsed.data)
      .eq('worker_id', account.id)
      .eq('id', parseId(req.params.id))
      .select(itemFields)
      .maybeSingle()
    if (error) throw unavailable()
    if (!data) throw notFound()
    res.set('Cache-Control', 'no-store').json({ data })
  })
  router.delete('/:id', async (req, res) => {
    const account = res.locals.account as AuthenticatedAccount
    const itemId = parseId(req.params.id)
    const { data, error } = await client()
      .from('worker_portfolio')
      .select('storage_path')
      .eq('worker_id', account.id)
      .eq('id', itemId)
      .maybeSingle()
    if (error) throw unavailable()
    if (!data) throw notFound()
    const removed = await client()
      .storage.from('worker-portfolio')
      .remove([data.storage_path])
    if (removed.error) throw unavailable()
    const deleted = await client()
      .from('worker_portfolio')
      .delete()
      .eq('worker_id', account.id)
      .eq('id', itemId)
    if (deleted.error) throw unavailable()
    res.json({ data: true })
  })
  return router
}
