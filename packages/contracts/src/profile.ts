import { z } from 'zod'
import { professionSchema, tradeDetailsSchemas, trades } from './trades.js'

export const employerTypeSchema = z.enum([
  'household',
  'contractor',
  'small_business',
  'shop',
  'workshop',
  'construction_business',
])
export const employerProfileSchema = z.strictObject({
  employer_type: employerTypeSchema,
  organization_name: z.string().trim().max(120).nullable(),
})

export const workerProfileSchema = z
  .strictObject({
    profession: professionSchema,
    service_area: z.string().trim().min(1).max(120),
    experience_years: z.number().int().min(0).max(100),
    bio: z.string().max(2000).nullable(),
    availability: z.string().max(200).nullable(),
    typical_rate_minor: z.number().int().min(0).max(1000000000).nullable(),
    currency_code: z.literal('PKR'),
    trade_details: z.record(z.string(), z.unknown()),
    skills: z.array(z.string()).max(10),
  })
  .superRefine((value, context) => {
    if (
      !tradeDetailsSchemas[value.profession].safeParse(value.trade_details)
        .success
    ) {
      context.addIssue({
        code: 'custom',
        path: ['trade_details'],
        message: 'Invalid trade details',
      })
    }
    const allowed: readonly string[] = trades[value.profession].skills
    if (
      new Set(value.skills).size !== value.skills.length ||
      value.skills.some((skill) => !allowed.includes(skill))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['skills'],
        message: 'Invalid skills',
      })
    }
  })

export const workerProfileResponseSchema = z.object({
  data: workerProfileSchema.nullable(),
})
export const employerProfileResponseSchema = z.object({
  data: employerProfileSchema.nullable(),
})
export type WorkerProfile = z.infer<typeof workerProfileSchema>
export type EmployerProfile = z.infer<typeof employerProfileSchema>
