import { z } from 'zod'
import { professionSchema } from './trades.js'

export const publicProfileSchema = z.strictObject({
  public_id: z.uuid(),
  full_name: z.string().min(1),
  profession: professionSchema,
  service_area: z.string().min(1),
  experience_years: z.number().int().min(0),
  skills: z.array(z.string()),
  records: z.array(
    z.strictObject({
      summary: z.string().min(1).max(200),
      work_days: z.number().int().nonnegative(),
      verified_at: z.iso.datetime({ offset: true }),
    }),
  ),
  stats: z.strictObject({
    verified_jobs: z.number().int().nonnegative(),
    work_days: z.number().int().nonnegative(),
    repeat_employers: z.number().int().nonnegative(),
  }),
})
export const publicProfileResponseSchema = z.object({
  data: publicProfileSchema,
})
export const publicProfileSettingsSchema = z.strictObject({
  public_id: z.uuid(),
  is_public: z.boolean(),
  public_service_area: z.string().nullable(),
})
export const publicProfileSettingsResponseSchema = z.object({
  data: publicProfileSettingsSchema.nullable(),
})
export const updatePublicProfileSettingsSchema = z.discriminatedUnion(
  'is_public',
  [
    z.strictObject({
      is_public: z.literal(true),
      public_service_area: z.string().trim().min(1).max(120),
    }),
    z.strictObject({ is_public: z.literal(false) }),
  ],
)
export type PublicProfile = z.infer<typeof publicProfileSchema>
