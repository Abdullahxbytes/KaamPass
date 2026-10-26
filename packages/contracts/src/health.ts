import { z } from 'zod'

export const healthResponseSchema = z.object({
  data: z.object({
    status: z.literal('ok'),
    service: z.literal('kaampass-api'),
    timestamp: z.iso.datetime(),
  }),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
