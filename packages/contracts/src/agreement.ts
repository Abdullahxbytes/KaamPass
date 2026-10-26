import { z } from 'zod'

import { professionSchema, type Profession } from './trades.js'

export const agreementPricingModelSchema = z.enum(['fixed_total', 'daily_rate'])
export const materialsResponsibilitySchema = z.enum([
  'employer',
  'worker',
  'shared',
])
export const agreementStatusSchema = z.enum(['pending', 'accepted', 'rejected'])

const workType = z.string().trim().min(2).max(120)
export const agreementTradeDetailsSchemas = {
  electrician: z.strictObject({
    work_type: workType,
    circuit_count: z.number().int().min(1).max(100).optional(),
  }),
  plumber: z.strictObject({
    work_type: workType,
    fixture_count: z.number().int().min(1).max(100).optional(),
  }),
  painter: z.strictObject({
    work_type: workType,
    area_square_feet: z.number().int().min(1).max(1000000).optional(),
    coats: z.number().int().min(1).max(10).optional(),
  }),
} satisfies Record<Profession, z.ZodType>

export const createAgreementSchema = z
  .strictObject({
    worker_id: z.uuid(),
    profession: professionSchema,
    description: z.string().trim().min(5).max(2000),
    work_days: z.number().int().min(1).max(365),
    pricing_model: agreementPricingModelSchema,
    amount_minor: z.number().int().min(1).max(1000000000),
    currency_code: z.literal('PKR'),
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
        message: 'Invalid agreement trade details',
      })
    }
    const total =
      value.pricing_model === 'daily_rate'
        ? value.amount_minor * value.work_days
        : value.amount_minor
    if (!Number.isSafeInteger(total) || total > 1000000000) {
      context.addIssue({
        code: 'custom',
        path: ['amount_minor'],
        message: 'Agreement total is too large',
      })
    }
  })

export const rejectAgreementSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500).nullable(),
})

export const agreementWorkerSchema = z.object({
  id: z.uuid(),
  full_name: z.string().min(1),
  profession: professionSchema,
  service_area: z.string().min(1),
})

export const agreementSchema = z.object({
  id: z.uuid(),
  employer_id: z.uuid(),
  employer_name: z.string().min(1),
  worker_id: z.uuid(),
  worker_name: z.string().min(1),
  profession: professionSchema,
  description: z.string(),
  work_days: z.number().int(),
  pricing_model: agreementPricingModelSchema,
  amount_minor: z.number().int(),
  total_minor: z.number().int(),
  currency_code: z.literal('PKR'),
  materials_responsibility: materialsResponsibilitySchema,
  trade_details: z.record(z.string(), z.unknown()),
  status: agreementStatusSchema,
  rejection_reason: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  responded_at: z.iso.datetime({ offset: true }).nullable(),
})

export const agreementResponseSchema = z.object({ data: agreementSchema })
export const agreementListResponseSchema = z.object({
  data: z.array(agreementSchema),
})
export const agreementWorkerListResponseSchema = z.object({
  data: z.array(agreementWorkerSchema),
})

export type Agreement = z.infer<typeof agreementSchema>
export type AgreementWorker = z.infer<typeof agreementWorkerSchema>
export type CreateAgreement = z.infer<typeof createAgreementSchema>
export type AgreementStatus = z.infer<typeof agreementStatusSchema>
export type AgreementPricingModel = z.infer<typeof agreementPricingModelSchema>
export type MaterialsResponsibility = z.infer<
  typeof materialsResponsibilitySchema
>
