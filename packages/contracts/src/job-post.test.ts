import { describe, expect, it } from 'vitest'

import { createJobBidSchema, createJobPostSchema } from './job-post.js'

describe('job marketplace contracts', () => {
  it('accepts a profession-aware work request', () => {
    expect(
      createJobPostSchema.safeParse({
        title: 'Distribution board repair',
        profession: 'electrician',
        service_area: 'Lahore',
        description: 'Inspect and replace a damaged distribution board.',
        preferred_start_date: null,
        materials_responsibility: 'employer',
        trade_details: { work_type: 'DB repair', circuit_count: 6 },
      }).success,
    ).toBe(true)
  })

  it('rejects mismatched trade details', () => {
    expect(
      createJobPostSchema.safeParse({
        title: 'Paint apartment',
        profession: 'painter',
        service_area: 'Islamabad',
        description: 'Paint an apartment interior with two coats.',
        preferred_start_date: null,
        materials_responsibility: 'employer',
        trade_details: { work_type: 'Interior paint', circuit_count: 2 },
      }).success,
    ).toBe(false)
  })

  it('validates fixed and daily bids without unsafe totals', () => {
    expect(
      createJobBidSchema.safeParse({
        pricing_model: 'daily_rate',
        amount_minor: 200000,
        estimated_days: 3,
        message: 'Available this week.',
      }).success,
    ).toBe(true)
    expect(
      createJobBidSchema.safeParse({
        pricing_model: 'daily_rate',
        amount_minor: 1000000000,
        estimated_days: 365,
        message: null,
      }).success,
    ).toBe(false)
  })
})
