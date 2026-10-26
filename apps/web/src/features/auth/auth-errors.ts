export type AuthMode = 'login' | 'register'
export type AuthMessage =
  | 'serviceAreaRequired'
  | 'professionRequired'
  | 'fullNameRequired'
  | 'invalidEmail'
  | 'passwordRequired'
  | 'passwordTooShort'
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'accountExists'
  | 'rateLimited'
  | 'network'
  | 'signInUnavailable'
  | 'signUpUnavailable'
  | 'signOutFailed'
  | 'confirmEmail'

function getErrorCode(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  )
    return error.code
  return null
}

function isNetworkError(error: unknown) {
  if (error instanceof TypeError) return true
  if (!error || typeof error !== 'object') return false

  const name =
    'name' in error && typeof error.name === 'string' ? error.name : ''
  const message =
    'message' in error && typeof error.message === 'string' ? error.message : ''
  const status = 'status' in error ? error.status : undefined

  return (
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    /failed to fetch|fetch failed|network request failed/i.test(message)
  )
}

export function mapAuthError(error: unknown, mode: AuthMode): AuthMessage {
  if (isNetworkError(error)) return 'network'
  const code = getErrorCode(error)
  if (code === 'invalid_credentials') return 'invalidCredentials'
  if (code === 'email_not_confirmed') return 'emailNotConfirmed'
  if (code === 'user_already_exists' || code === 'user_already_registered')
    return 'accountExists'
  if (code?.includes('rate_limit')) return 'rateLimited'
  return mode === 'login' ? 'signInUnavailable' : 'signUpUnavailable'
}
