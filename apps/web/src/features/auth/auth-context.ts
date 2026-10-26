import { createContext, useContext } from 'react'

import type {
  AccountProfile,
  PreferredLanguage,
  Registration,
} from '@kaampass/contracts'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; profile: AccountProfile; accessToken: string }
  | { status: 'unavailable' }

export interface AuthContextValue {
  state: AuthState
  signIn(email: string, password: string): Promise<void>
  signUp(registration: Registration): Promise<'signedIn' | 'confirmEmail'>
  signOut(): Promise<void>
  changeLanguage(language: PreferredLanguage): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.')
  }
  return context
}
