import { z } from 'zod'

import { agreementSchema } from './agreement.js'

export const completeJobSchema = z.strictObject({
  completed_days: z.number().int().min(1).max(365),
  paid_amount_minor: z.number().int().min(0).max(1000000000),
})

export const respondJobCompletionSchema = z
  .strictObject({
    confirm: z.boolean(),
    reason: z.string().trim().min(1).max(500).nullable(),
  })
  .refine((value) => !value.confirm || value.reason === null)

export const jobSchema = z.object({
  id: z.uuid(),
  agreement_id: z.uuid(),
  status: z.enum([
    'active',
    'awaiting_confirmation',
    'verified',
    'confirmation_disputed',
  ]),
  created_at: z.iso.datetime({ offset: true }),
  completed_days: z.number().int().nullable(),
  paid_amount_minor: z.number().int().nullable(),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  responded_at: z.iso.datetime({ offset: true }).nullable(),
  dispute_reason: z.string().nullable(),
  agreement: agreementSchema,
})

export const jobListResponseSchema = z.object({ data: z.array(jobSchema) })
export const jobResponseSchema = z.object({ data: jobSchema })
export type Job = z.infer<typeof jobSchema>
export type CompleteJob = z.infer<typeof completeJobSchema>
export type RespondJobCompletion = z.infer<typeof respondJobCompletionSchema>
