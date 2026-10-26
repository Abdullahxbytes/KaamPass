import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  loginSchema,
  registrationSchema,
  type AccountRole,
  type Profession,
} from '@kaampass/contracts'

import { getCurrentLanguage } from '../../i18n/i18n'
import {
  ServiceAreaSuggestions,
  serviceAreaListId,
} from '../profile/ServiceAreaSuggestions'
import { mapAuthError, type AuthMessage, type AuthMode } from './auth-errors'
import { useAuth } from './auth-context'
import './auth-panel.css'

export function AuthPanel({
  initialMode = 'login',
  onNavigate,
}: {
  initialMode?: AuthMode
  onNavigate: (view: 'home' | 'profile' | 'jobs') => void
}) {
  const { t } = useTranslation()
  const { state, signIn, signUp, signOut } = useAuth()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AccountRole>('worker')
  const [profession, setProfession] = useState<Profession | ''>('')
  const [serviceArea, setServiceArea] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<AuthMessage | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    const input = {
      fullName,
      email: email.trim(),
      password,
      role,
      preferredLanguage: getCurrentLanguage(),
      profession: role === 'worker' ? profession || undefined : undefined,
      serviceArea:
        role === 'worker' ? serviceArea.trim() || undefined : undefined,
    }
    const parsed =
      mode === 'register'
        ? registrationSchema.safeParse(input)
        : loginSchema.safeParse(input)
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0]
      if (field === 'serviceArea') {
        setMessage('serviceAreaRequired')
        return
      }
      if (field === 'profession') {
        setMessage('professionRequired')
        return
      }
      setMessage(
        field === 'fullName'
          ? 'fullNameRequired'
          : field === 'email'
            ? 'invalidEmail'
            : password.length === 0
              ? 'passwordRequired'
              : 'passwordTooShort',
      )
      return
    }

    setBusy(true)
    try {
      if (mode === 'register') {
        const result = await signUp(registrationSchema.parse(input))
        if (result === 'confirmEmail') setMessage('confirmEmail')
      } else {
        await signIn(input.email, input.password)
      }
      setPassword('')
    } catch (error) {
      setMessage(mapAuthError(error, mode))
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    setMessage(null)
    try {
      await signOut()
      onNavigate('home')
    } catch {
      setMessage('signOutFailed')
    }
  }

  if (state.status === 'loading') {
    return (
      <section className="auth-panel auth-panel--status" role="status">
        {t('auth.loading')}
      </section>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <section className="auth-panel auth-panel--status" role="alert">
        <h1>{t('auth.unavailableTitle')}</h1>
        <p>{t('auth.unavailable')}</p>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void handleSignOut()}
        >
          {t('auth.signOut')}
        </button>
        {message ? (
          <p className="form-message form-message--error">
            {t(`auth.errors.${message}`)}
          </p>
        ) : null}
      </section>
    )
  }

  if (state.status === 'signedIn') {
    return (
      <section className="account-page">
        <div>
          <p className="app-eyebrow">{t('auth.signedIn')}</p>
          <h1>{t('auth.welcome', { name: state.profile.fullName })}</h1>
          <p>
            {t('auth.accountReady', {
              role: t(`auth.roles.${state.profile.role}`),
            })}
          </p>
        </div>
        <div className="account-actions">
          <button
            className="button button--primary"
            type="button"
            onClick={() => onNavigate('profile')}
          >
            {t('home.openProfile')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => onNavigate('jobs')}
          >
            {t('home.openJobs')}
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => void handleSignOut()}
          >
            {t('auth.signOut')}
          </button>
        </div>
        {message ? (
          <p className="form-message form-message--error">
            {t(`auth.errors.${message}`)}
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <section className="auth-layout">
      <div className="auth-intro">
        <img src="/kaam-pass-logo.png" alt="" width="160" height="160" />
        <h1>
          {t(mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}
        </h1>
        <p>{t(mode === 'login' ? 'auth.loginIntro' : 'auth.registerIntro')}</p>
      </div>
      <div className="auth-panel">
        <div
          className="auth-tabs"
          role="tablist"
          aria-label={t('auth.chooseMode')}
        >
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              className={
                mode === item ? 'auth-tab auth-tab--active' : 'auth-tab'
              }
              onClick={() => {
                setMode(item)
                setMessage(null)
                setPassword('')
              }}
            >
              {t(item === 'login' ? 'auth.signIn' : 'auth.signUp')}
            </button>
          ))}
        </div>
        <form
          className="auth-form"
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
        >
          {mode === 'register' ? (
            <>
              <label>
                {t('auth.fullName')}
                <input
                  autoComplete="name"
                  maxLength={100}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  aria-invalid={message === 'fullNameRequired'}
                />
              </label>
              <label>
                {t('auth.role')}
                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as AccountRole)
                  }
                >
                  <option value="worker">{t('auth.roles.worker')}</option>
                  <option value="employer">{t('auth.roles.employer')}</option>
                </select>
              </label>
              {role === 'worker' ? (
                <>
                  <label>
                    {t('profile.profession')}
                    <select
                      value={profession}
                      onChange={(event) =>
                        setProfession(event.target.value as Profession | '')
                      }
                    >
                      <option value="" disabled>
                        {t('workspace.chooseProfession')}
                      </option>
                      {(['electrician', 'plumber', 'painter'] as const).map(
                        (item) => (
                          <option key={item} value={item}>
                            {t(`trades.professions.${item}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    {t('profile.serviceArea')}
                    <input
                      required
                      maxLength={120}
                      list={serviceAreaListId}
                      value={serviceArea}
                      onChange={(event) => setServiceArea(event.target.value)}
                    />
                    <ServiceAreaSuggestions />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          <label>
            {t('auth.email')}
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={message === 'invalidEmail'}
            />
          </label>
          <label>
            {t('auth.password')}
            <input
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              minLength={mode === 'register' ? 8 : 1}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={
                message === 'passwordRequired' || message === 'passwordTooShort'
              }
            />
          </label>
          {mode === 'register' ? (
            <p className="auth-hint">{t('auth.passwordHint')}</p>
          ) : null}
          {message ? (
            <p
              className={
                message === 'confirmEmail'
                  ? 'form-message form-message--success'
                  : 'form-message form-message--error'
              }
              role={message === 'confirmEmail' ? 'status' : 'alert'}
            >
              {t(
                message === 'confirmEmail'
                  ? 'auth.confirmEmail'
                  : `auth.errors.${message}`,
              )}
            </p>
          ) : null}
          <button
            className="button button--primary button--full"
            type="submit"
            disabled={busy}
          >
            {t(
              busy
                ? 'auth.working'
                : mode === 'login'
                  ? 'auth.signIn'
                  : 'auth.signUp',
            )}
          </button>
        </form>
      </div>
    </section>
  )
}
