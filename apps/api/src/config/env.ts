import 'dotenv/config'

import { z } from 'zod'

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  })
  .refine(
    (environment) =>
      Boolean(environment.SUPABASE_URL) ===
      Boolean(environment.SUPABASE_SERVICE_ROLE_KEY),
    {
      message:
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided together.',
      path: ['SUPABASE_URL'],
    },
  )

export type ApiEnvironment = z.infer<typeof environmentSchema>

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): ApiEnvironment {
  const result = environmentSchema.safeParse(source)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid API environment: ${details}`)
  }

  return result.data
}
