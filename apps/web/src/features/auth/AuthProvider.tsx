import { useEffect, useState, type ReactNode } from 'react'

import {
  accountProfileResponseSchema,
  type PreferredLanguage,
  type Registration,
} from '@kaampass/contracts'
import type { Session } from '@supabase/supabase-js'

import { changeAppLanguage } from '../../i18n/i18n'
import { apiClient } from '../../lib/api/api-client'
import { getBrowserSupabaseClient } from '../../lib/supabase/client'
import { AuthContext, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    let generation = 0
    let client: ReturnType<typeof getBrowserSupabaseClient>

    try {
      client = getBrowserSupabaseClient()
    } catch {
      queueMicrotask(() => {
        if (active) setState({ status: 'unavailable' })
      })
      return () => {
        active = false
      }
    }

    const { data } = client.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        const current = ++generation
        if (!session) {
          setState({ status: 'signedOut' })
          return
        }

        setState({ status: 'loading' })
        // Do not await another operation inside Supabase's auth callback.
        window.setTimeout(() => {
          void apiClient
            .authenticatedRequest(
              '/account/me',
              session.access_token,
              accountProfileResponseSchema,
              { method: 'GET' },
            )
            .then(async ({ data: profile }) => {
              if (!active || generation !== current) return
              await changeAppLanguage(profile.preferredLanguage)
              if (active && generation === current) {
                setState({
                  status: 'signedIn',
                  profile,
                  accessToken: session.access_token,
                })
              }
            })
            .catch(() => {
              if (active && generation === current)
                setState({ status: 'unavailable' })
            })
        }, 0)
      },
    )

    return () => {
      active = false
      generation += 1
      data.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await getBrowserSupabaseClient().auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  async function signUp(registration: Registration) {
    const { data, error } = await getBrowserSupabaseClient().auth.signUp({
      email: registration.email,
      password: registration.password,
      options: {
        data: {
          full_name: registration.fullName,
          role: registration.role,
          preferred_language: registration.preferredLanguage,
          profession:
            registration.role === 'worker'
              ? registration.profession
              : undefined,
          service_area:
            registration.role === 'worker'
              ? registration.serviceArea
              : undefined,
        },
      },
    })
    if (error) throw error
    if (data.user && data.user.identities?.length === 0) {
      throw Object.assign(new Error('An account already exists.'), {
        code: 'user_already_exists',
      })
    }
    return data.session ? ('signedIn' as const) : ('confirmEmail' as const)
  }

  async function signOut() {
    const { error } = await getBrowserSupabaseClient().auth.signOut()
    if (error) throw error
  }

  async function changeLanguage(language: PreferredLanguage) {
    if (state.status === 'signedIn') {
      const { data: profile } = await apiClient.authenticatedRequest(
        '/account/preferences',
        state.accessToken,
        accountProfileResponseSchema,
        { method: 'PATCH', body: { preferredLanguage: language } },
      )
      await changeAppLanguage(profile.preferredLanguage)
      setState((current) =>
        current.status === 'signedIn' && current.profile.id === profile.id
          ? { ...current, profile }
          : current,
      )
      return
    }
    await changeAppLanguage(language)
  }

  return (
    <AuthContext.Provider
      value={{ state, signIn, signUp, signOut, changeLanguage }}
    >
      {children}
    </AuthContext.Provider>
  )
}
