import { describe, expect, it } from 'vitest'
import { registrationSchema } from './account.js'

const account = {
  fullName: 'Ahmed',
  email: 'ahmed@example.test',
  password: 'KaamPassDemo123!',
  preferredLanguage: 'en',
} as const

describe('registration', () => {
  it('requires a profession and service area for workers', () => {
    expect(
      registrationSchema.safeParse({ ...account, role: 'worker' }).success,
    ).toBe(false)
    expect(
      registrationSchema.safeParse({
        ...account,
        role: 'worker',
        profession: 'plumber',
        serviceArea: 'Lahore',
      }).success,
    ).toBe(true)
  })
  it('does not require worker fields for employers', () => {
    expect(
      registrationSchema.safeParse({ ...account, role: 'employer' }).success,
    ).toBe(true)
  })
})
