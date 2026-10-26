import {
  jobBidSchema,
  jobPostSchema,
  type Agreement,
  type CreateJobBid,
  type CreateJobPost,
  type JobBid,
  type JobPost,
} from '@kaampass/contracts'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { AuthenticatedAccount } from '../middleware/authorization.js'
import { ApiError } from '../middleware/error-handler.js'
import { AgreementService } from './agreement.service.js'

interface JobPostRow {
  id: string
  employer_id: string
  title: string
  profession: 'electrician' | 'plumber' | 'painter'
  service_area: string
  description: string
  preferred_start_date: string | null
  materials_responsibility: 'employer' | 'worker' | 'shared'
  trade_details: Record<string, unknown>
  status: 'open' | 'selected' | 'closed'
  selected_bid_id: string | null
  selected_agreement_id: string | null
  created_at: string
}

interface JobBidRow {
  id: string
  job_post_id: string
  worker_id: string
  profession: 'electrician' | 'plumber' | 'painter'
  pricing_model: 'fixed_total' | 'daily_rate'
  amount_minor: number
  total_minor: number
  estimated_days: number
  message: string | null
  status: 'submitted' | 'selected' | 'not_selected'
  created_at: string
}

export class JobPostService {
  constructor(private readonly client: SupabaseClient) {}

  async createJobPost(
    employerId: string,
    input: CreateJobPost,
  ): Promise<JobPost> {
    await this.requireEmployerProfile(employerId)
    const result = await this.client
      .from('job_posts')
      .insert({ employer_id: employerId, ...input })
      .select('*')
      .single()
    if (result.error)
      throw new ApiError(
        503,
        'JOB_POST_CREATE_FAILED',
        'The work request could not be posted.',
      )
    return this.hydratePost(result.data as JobPostRow, {
      id: employerId,
      role: 'employer',
    })
  }

  async listJobPosts(account: AuthenticatedAccount): Promise<JobPost[]> {
    let rows: JobPostRow[]
    if (account.role === 'employer') {
      const result = await this.client
        .from('job_posts')
        .select('*')
        .eq('employer_id', account.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (result.error) throw this.unavailable('load work requests')
      rows = result.data as JobPostRow[]
    } else {
      const profile = await this.requireWorkerProfile(account.id)
      const posts = await this.client
        .from('job_posts')
        .select('*')
        .eq('profession', profile.profession)
        .in('status', ['open', 'selected'])
        .order('created_at', { ascending: false })
        .limit(100)
      if (posts.error) throw this.unavailable('load matching work requests')
      const ownBids = await this.client
        .from('job_bids')
        .select('job_post_id')
        .eq('worker_id', account.id)
      if (ownBids.error) throw this.unavailable('load your bids')
      const ownPostIds = new Set(
        ownBids.data.map((bid) => bid.job_post_id as string),
      )
      rows = (posts.data as JobPostRow[]).filter(
        (post) => post.status === 'open' || ownPostIds.has(post.id),
      )
    }
    return this.hydratePosts(rows, account)
  }

  async createBid(
    workerId: string,
    jobPostId: string,
    input: CreateJobBid,
  ): Promise<JobPost> {
    const worker = await this.requireWorkerProfile(workerId)
    const post = await this.loadJobPost(jobPostId)
    if (post.status !== 'open')
      throw new ApiError(
        409,
        'JOB_POST_CLOSED',
        'This work request is no longer accepting bids.',
      )
    if (post.profession !== worker.profession)
      throw new ApiError(
        403,
        'PROFESSION_MISMATCH',
        'Only workers in the requested profession can bid.',
      )

    const totalMinor =
      input.pricing_model === 'daily_rate'
        ? input.amount_minor * input.estimated_days
        : input.amount_minor
    const result = await this.client.from('job_bids').insert({
      job_post_id: post.id,
      worker_id: workerId,
      profession: worker.profession,
      pricing_model: input.pricing_model,
      amount_minor: input.amount_minor,
      total_minor: totalMinor,
      estimated_days: input.estimated_days,
      message: input.message,
    })
    if (result.error?.code === '23505')
      throw new ApiError(
        409,
        'BID_ALREADY_EXISTS',
        'You already submitted a bid for this work request.',
      )
    if (result.error)
      throw new ApiError(503, 'BID_CREATE_FAILED', 'The bid could not be sent.')
    return this.hydratePost(post, { id: workerId, role: 'worker' })
  }

  async selectBid(
    employerId: string,
    jobPostId: string,
    bidId: string,
  ): Promise<{ job_post: JobPost; agreement: Agreement }> {
    await this.loadOwnedOpenPost(employerId, jobPostId)
    const bid = await this.client
      .from('job_bids')
      .select('job_post_id')
      .eq('id', bidId)
      .eq('job_post_id', jobPostId)
      .maybeSingle()
    if (bid.error) throw this.unavailable('verify the selected bid')
    if (!bid.data) throw new ApiError(404, 'BID_NOT_FOUND', 'Bid not found.')

    const result = await this.client.rpc('select_job_bid', {
      p_employer_id: employerId,
      p_bid_id: bidId,
    })
    if (result.error?.code === 'P0001')
      throw new ApiError(
        409,
        'BID_ALREADY_RESOLVED',
        'This request or bid was already resolved.',
      )
    if (result.error?.code === '42501')
      throw new ApiError(404, 'BID_NOT_FOUND', 'Bid not found.')
    if (result.error || typeof result.data !== 'string')
      throw new ApiError(
        503,
        'BID_SELECTION_FAILED',
        'The worker could not be selected.',
      )

    const postResult = await this.client
      .from('job_posts')
      .select('*')
      .eq('selected_agreement_id', result.data)
      .eq('employer_id', employerId)
      .single()
    if (postResult.error) throw this.unavailable('reload the selected request')
    const account = { id: employerId, role: 'employer' as const }
    return {
      job_post: await this.hydratePost(postResult.data as JobPostRow, account),
      agreement: await new AgreementService(this.client).getAgreement(
        account,
        result.data,
      ),
    }
  }

  async uploadImages(
    employerId: string,
    jobPostId: string,
    files: Express.Multer.File[],
  ): Promise<JobPost> {
    if (files.length === 0)
      throw new ApiError(400, 'IMAGES_REQUIRED', 'Choose at least one image.')
    if (files.some((file) => !hasExpectedImageSignature(file)))
      throw new ApiError(
        400,
        'INVALID_IMAGES',
        'One or more files are not valid JPEG, PNG, or WebP images.',
      )
    const post = await this.loadOwnedOpenPost(employerId, jobPostId)
    const existing = await this.client
      .from('job_post_images')
      .select('id')
      .eq('job_post_id', jobPostId)
    if (existing.error) throw this.unavailable('check existing images')
    if (existing.data.length + files.length > 3)
      throw new ApiError(
        400,
        'IMAGE_LIMIT_EXCEEDED',
        'A work request can have at most three images.',
      )

    const uploadedPaths: string[] = []
    try {
      for (const [index, file] of files.entries()) {
        const extension =
          file.mimetype === 'image/png'
            ? 'png'
            : file.mimetype === 'image/webp'
              ? 'webp'
              : 'jpg'
        const path = `${jobPostId}/${crypto.randomUUID()}.${extension}`
        const upload = await this.client.storage
          .from('job-problems')
          .upload(path, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          })
        if (upload.error) throw upload.error
        uploadedPaths.push(path)
        const metadata = await this.client.from('job_post_images').insert({
          job_post_id: jobPostId,
          storage_path: path,
          display_order: existing.data.length + index,
        })
        if (metadata.error) throw metadata.error
      }
    } catch {
      if (uploadedPaths.length > 0) {
        await this.client.storage.from('job-problems').remove(uploadedPaths)
        await this.client
          .from('job_post_images')
          .delete()
          .in('storage_path', uploadedPaths)
      }
      throw new ApiError(
        503,
        'IMAGE_UPLOAD_FAILED',
        'The problem images could not be uploaded.',
      )
    }
    return this.hydratePost(post, { id: employerId, role: 'employer' })
  }

  private async hydratePosts(
    rows: JobPostRow[],
    account: AuthenticatedAccount,
  ) {
    return Promise.all(rows.map((row) => this.hydratePost(row, account)))
  }

  private async hydratePost(
    row: JobPostRow,
    account: AuthenticatedAccount,
  ): Promise<JobPost> {
    const [profileResult, imageResult, bidResult] = await Promise.all([
      this.client
        .from('profiles')
        .select('full_name')
        .eq('id', row.employer_id)
        .single(),
      this.client
        .from('job_post_images')
        .select('id, storage_path')
        .eq('job_post_id', row.id)
        .order('display_order'),
      account.role === 'employer'
        ? this.client
            .from('job_bids')
            .select('*')
            .eq('job_post_id', row.id)
            .order('created_at')
        : this.client
            .from('job_bids')
            .select('*')
            .eq('job_post_id', row.id)
            .eq('worker_id', account.id)
            .order('created_at'),
    ])
    if (profileResult.error || imageResult.error || bidResult.error)
      throw this.unavailable('load work request details')

    const bidRows = bidResult.data as JobBidRow[]
    const workerProfiles =
      bidRows.length === 0
        ? []
        : ((
            await this.client
              .from('worker_profiles')
              .select('user_id, service_area')
              .in(
                'user_id',
                bidRows.map((bid) => bid.worker_id),
              )
          ).data ?? [])
    const names =
      bidRows.length === 0
        ? []
        : ((
            await this.client
              .from('profiles')
              .select('id, full_name')
              .in(
                'id',
                bidRows.map((bid) => bid.worker_id),
              )
          ).data ?? [])
    const serviceAreas = new Map(
      workerProfiles.map((profile) => [
        profile.user_id as string,
        profile.service_area as string,
      ]),
    )
    const workerNames = new Map(
      names.map((profile) => [
        profile.id as string,
        profile.full_name as string,
      ]),
    )
    const bids: JobBid[] = bidRows.map((bid) =>
      jobBidSchema.parse({
        ...bid,
        worker_name: workerNames.get(bid.worker_id),
        service_area: serviceAreas.get(bid.worker_id),
      }),
    )
    const images = await Promise.all(
      imageResult.data.map(async (image) => {
        const signed = await this.client.storage
          .from('job-problems')
          .createSignedUrl(image.storage_path as string, 3600)
        if (signed.error) throw this.unavailable('open problem images')
        return { id: image.id as string, url: signed.data.signedUrl }
      }),
    )
    return jobPostSchema.parse({
      ...row,
      employer_name: profileResult.data.full_name,
      images,
      bids,
    })
  }

  private async loadJobPost(id: string): Promise<JobPostRow> {
    const result = await this.client
      .from('job_posts')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (result.error) throw this.unavailable('load the work request')
    if (!result.data)
      throw new ApiError(404, 'JOB_POST_NOT_FOUND', 'Work request not found.')
    return result.data as JobPostRow
  }

  private async loadOwnedOpenPost(employerId: string, id: string) {
    const post = await this.loadJobPost(id)
    if (post.employer_id !== employerId)
      throw new ApiError(404, 'JOB_POST_NOT_FOUND', 'Work request not found.')
    if (post.status !== 'open')
      throw new ApiError(
        409,
        'JOB_POST_CLOSED',
        'Images cannot be changed after worker selection.',
      )
    return post
  }

  private async requireEmployerProfile(id: string) {
    const result = await this.client
      .from('employer_profiles')
      .select('user_id')
      .eq('user_id', id)
      .maybeSingle()
    if (result.error) throw this.unavailable('verify the employer profile')
    if (!result.data)
      throw new ApiError(
        409,
        'EMPLOYER_PROFILE_REQUIRED',
        'Complete your employer profile before posting work.',
      )
  }

  private async requireWorkerProfile(id: string) {
    const result = await this.client
      .from('worker_profiles')
      .select('profession')
      .eq('user_id', id)
      .maybeSingle()
    if (result.error) throw this.unavailable('verify the worker profile')
    if (!result.data)
      throw new ApiError(
        409,
        'WORKER_PROFILE_REQUIRED',
        'Complete your worker profile before viewing or submitting bids.',
      )
    return result.data as { profession: JobPostRow['profession'] }
  }

  private unavailable(action: string) {
    return new ApiError(503, 'JOB_POSTS_UNAVAILABLE', `Unable to ${action}.`)
  }
}

export function hasExpectedImageSignature(file: Express.Multer.File) {
  const bytes = file.buffer
  if (file.mimetype === 'image/jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (file.mimetype === 'image/png')
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  if (file.mimetype === 'image/webp')
    return (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  return false
}
