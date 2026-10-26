import { z } from 'zod'
import { professionSchema } from './trades.js'

export const verifiedRecordSchema = z.object({
  id: z.uuid(),
  job_id: z.uuid(),
  description: z.string(),
  profession: professionSchema,
  employer_name: z.string(),
  work_days: z.number().int().nonnegative(),
  paid_amount_minor: z.number().int().nonnegative(),
  verified_at: z.iso.datetime({ offset: true }),
  public_summary: z.string().nullable(),
})
export const workerHistorySchema = z.object({
  stats: z.object({
    verified_jobs: z.number().int().nonnegative(),
    work_days: z.number().int().nonnegative(),
    income_minor: z.number().int().nonnegative(),
    repeat_employers: z.number().int().nonnegative(),
  }),
  records: z.array(verifiedRecordSchema),
  offset: z.number().int().nonnegative(),
})
export const workerHistoryResponseSchema = z.object({
  data: workerHistorySchema,
})
export type WorkerHistory = z.infer<typeof workerHistorySchema>
