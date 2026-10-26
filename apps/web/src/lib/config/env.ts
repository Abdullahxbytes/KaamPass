const defaultApiUrl = 'http://localhost:3001'

function parseApiUrl(value: string | undefined) {
  const candidate = value?.trim() || defaultApiUrl

  try {
    const url = new URL(candidate)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }

    return url.toString().replace(/\/$/, '')
  } catch {
    throw new Error('VITE_API_URL must be a valid HTTP or HTTPS URL.')
  }
}

function parseSupabaseConfig(
  urlValue: string | undefined,
  keyValue: string | undefined,
) {
  const url = urlValue?.trim()
  const anonKey = keyValue?.trim()

  if (!url && !anonKey) {
    return null
  }

  if (!url || !anonKey) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together.',
    )
  }

  try {
    const parsedUrl = new URL(url)

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }

    return Object.freeze({
      url: parsedUrl.toString().replace(/\/$/, ''),
      anonKey,
    })
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.')
  }
}

export const env = Object.freeze({
  apiUrl: parseApiUrl(import.meta.env.VITE_API_URL),
  supabase: parseSupabaseConfig(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  ),
})
