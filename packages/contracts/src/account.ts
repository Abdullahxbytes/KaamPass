import { z } from 'zod'
import { professionSchema } from './trades.js'

export const accountRoleSchema = z.enum(['worker', 'employer'])
export const preferredLanguageSchema = z.enum(['en', 'ur-roman', 'ur'])

export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    password: z.string().min(8).max(72),
    role: accountRoleSchema,
    preferredLanguage: preferredLanguageSchema,
    profession: professionSchema.optional(),
    serviceArea: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((value, context) => {
    if (value.role === 'worker' && !value.profession)
      context.addIssue({
        code: 'custom',
        path: ['profession'],
        message: 'Choose a profession',
      })
    if (value.role === 'worker' && !value.serviceArea)
      context.addIssue({
        code: 'custom',
        path: ['serviceArea'],
        message: 'Enter a service area',
      })
  })

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(72),
})

export const accountProfileSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  role: accountRoleSchema,
  preferredLanguage: preferredLanguageSchema,
})

export const accountProfileResponseSchema = z.object({
  data: accountProfileSchema,
})

export const updateLanguageSchema = z.object({
  preferredLanguage: preferredLanguageSchema,
})

export type AccountProfile = z.infer<typeof accountProfileSchema>
export type AccountRole = z.infer<typeof accountRoleSchema>
export type PreferredLanguage = z.infer<typeof preferredLanguageSchema>
export type Registration = z.infer<typeof registrationSchema>
