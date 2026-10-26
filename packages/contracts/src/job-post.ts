import { z } from 'zod'

import {
  agreementPricingModelSchema,
  agreementSchema,
  agreementTradeDetailsSchemas,
  materialsResponsibilitySchema,
} from './agreement.js'
import { professionSchema } from './trades.js'

export const jobPostStatusSchema = z.enum(['open', 'selected', 'closed'])
export const jobBidStatusSchema = z.enum([
  'submitted',
  'selected',
  'not_selected',
])

export const createJobPostSchema = z
  .strictObject({
    title: z.string().trim().min(3).max(120),
    profession: professionSchema,
    service_area: z.string().trim().min(1).max(120),
    description: z.string().trim().min(10).max(2000),
    preferred_start_date: z.iso.date().nullable(),
    materials_responsibility: materialsResponsibilitySchema,
    trade_details: z.record(z.string(), z.unknown()),
  })
  .superRefine((value, context) => {
    if (
      !agreementTradeDetailsSchemas[value.profession].safeParse(
        value.trade_details,
      ).success
    ) {
      context.addIssue({
        code: 'custom',
        path: ['trade_details'],
        message: 'Invalid job trade details',
      })
    }
  })

export const createJobBidSchema = z
  .strictObject({
    pricing_model: agreementPricingModelSchema,
    amount_minor: z.number().int().min(1).max(1000000000),
    estimated_days: z.number().int().min(1).max(365),
    message: z.string().trim().min(1).max(1000).nullable(),
  })
  .superRefine((value, context) => {
    const total =
      value.pricing_model === 'daily_rate'
        ? value.amount_minor * value.estimated_days
        : value.amount_minor
    if (!Number.isSafeInteger(total) || total > 1000000000) {
      context.addIssue({
        code: 'custom',
        path: ['amount_minor'],
        message: 'Bid total is too large',
      })
    }
  })

export const jobPostImageSchema = z.object({
  id: z.uuid(),
  url: z.url(),
})

export const jobBidSchema = z.object({
  id: z.uuid(),
  worker_id: z.uuid(),
  worker_name: z.string().min(1),
  profession: professionSchema,
  service_area: z.string().min(1),
  pricing_model: agreementPricingModelSchema,
  amount_minor: z.number().int(),
  total_minor: z.number().int(),
  estimated_days: z.number().int(),
  message: z.string().nullable(),
  status: jobBidStatusSchema,
  created_at: z.iso.datetime({ offset: true }),
})

export const jobPostSchema = z.object({
  id: z.uuid(),
  employer_id: z.uuid(),
  employer_name: z.string().min(1),
  title: z.string(),
  profession: professionSchema,
  service_area: z.string(),
  description: z.string(),
  preferred_start_date: z.iso.date().nullable(),
  materials_responsibility: materialsResponsibilitySchema,
  trade_details: z.record(z.string(), z.unknown()),
  status: jobPostStatusSchema,
  selected_bid_id: z.uuid().nullable(),
  selected_agreement_id: z.uuid().nullable(),
  images: z.array(jobPostImageSchema).max(3),
  bids: z.array(jobBidSchema),
  created_at: z.iso.datetime({ offset: true }),
})

export const jobPostResponseSchema = z.object({ data: jobPostSchema })
export const jobPostListResponseSchema = z.object({
  data: z.array(jobPostSchema),
})
export const selectJobBidResponseSchema = z.object({
  data: z.object({
    job_post: jobPostSchema,
    agreement: agreementSchema,
  }),
})

export type CreateJobPost = z.infer<typeof createJobPostSchema>
export type CreateJobBid = z.infer<typeof createJobBidSchema>
export type JobPost = z.infer<typeof jobPostSchema>
export type JobBid = z.infer<typeof jobBidSchema>
