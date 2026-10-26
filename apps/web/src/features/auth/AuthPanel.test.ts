import { describe, expect, it } from 'vitest'

import { mapAuthError } from './auth-errors'

describe('authentication error messages', () => {
  it.each([
    ['invalid_credentials', 'invalidCredentials'],
    ['email_not_confirmed', 'emailNotConfirmed'],
    ['user_already_exists', 'accountExists'],
    ['over_email_send_rate_limit', 'rateLimited'],
  ])('maps %s to a specific user message', (code, expected) => {
    expect(mapAuthError({ code }, 'login')).toBe(expected)
  })

  it('distinguishes network and unavailable service failures', () => {
    expect(mapAuthError(new TypeError('fetch failed'), 'login')).toBe('network')
    expect(
      mapAuthError(
        {
          name: 'AuthRetryableFetchError',
          message: 'Failed to fetch',
          status: 0,
        },
        'register',
      ),
    ).toBe('network')
    expect(mapAuthError(new Error('unknown'), 'login')).toBe(
      'signInUnavailable',
    )
    expect(mapAuthError(new Error('unknown'), 'register')).toBe(
      'signUpUnavailable',
    )
  })
})
