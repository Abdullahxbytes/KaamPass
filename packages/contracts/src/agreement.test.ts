import { describe, expect, it } from 'vitest'

import { createAgreementSchema } from './agreement.js'

const baseAgreement = {
  worker_id: '10000000-0000-4000-8000-000000000001',
  profession: 'electrician' as const,
  description: 'Install a distribution board',
  work_days: 3,
  pricing_model: 'daily_rate' as const,
  amount_minor: 200000,
  currency_code: 'PKR' as const,
  materials_responsibility: 'employer' as const,
  trade_details: { work_type: 'DB installation', circuit_count: 6 },
}

describe('agreement contract', () => {
  it('accepts canonical fixed and daily pricing terms', () => {
    expect(createAgreementSchema.safeParse(baseAgreement).success).toBe(true)
    expect(
      createAgreementSchema.safeParse({
        ...baseAgreement,
        pricing_model: 'fixed_total',
        amount_minor: 800000,
      }).success,
    ).toBe(true)
  })

  it('rejects trade details that do not match the worker profession', () => {
    expect(
      createAgreementSchema.safeParse({
        ...baseAgreement,
        profession: 'painter',
        trade_details: { work_type: 'Interior paint', circuit_count: 3 },
      }).success,
    ).toBe(false)
  })

  it('rejects unsafe calculated totals', () => {
    expect(
      createAgreementSchema.safeParse({
        ...baseAgreement,
        work_days: 365,
        amount_minor: 1000000000,
      }).success,
    ).toBe(false)
  })
})
