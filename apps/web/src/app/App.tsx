import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AuthPanel } from '../features/auth/AuthPanel'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/auth-context'
import type { AuthMode } from '../features/auth/auth-errors'
import { LanguageSwitcher } from '../features/language/LanguageSwitcher'
import { JobsDashboard } from '../features/jobs/JobsDashboard'
import { ProfileDashboard } from '../features/profile/ProfileDashboard'
import { PublicProfilePage } from '../features/profile/PublicProfilePage'

import './app.css'

type AppView = 'home' | 'profile' | 'jobs' | 'agreements' | 'feedback' | 'login'

function AppShell() {
  const { t } = useTranslation()
  const { state, signOut } = useAuth()
  const [view, setView] = useState<AppView>('home')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [shellError, setShellError] = useState(false)
  const signedIn = state.status === 'signedIn'
  // A signed-in user starts on their profile, without an extra welcome step.
  const currentView =
    signedIn && (view === 'home' || view === 'login') ? 'profile' : view

  function openAuth(mode: AuthMode) {
    setAuthMode(mode)
    setView('login')
  }

  async function handleSignOut() {
    setShellError(false)
    try {
      await signOut()
      setView('home')
    } catch {
      setShellError(true)
    }
  }

  const navItems = ['profile', 'jobs', 'agreements', 'feedback'] as const

  return (
    <div className="app-frame">
      <header className="site-header">
        <div className="site-header__inner">
          <button
            className="brand-button"
            type="button"
            onClick={() => setView(signedIn ? 'profile' : 'home')}
            aria-label={t('navigation.goHome')}
          >
            <img src="/kaam-pass-logo.png" alt="" width="56" height="56" />
          </button>
          {signedIn ? (
            <nav className="desktop-nav" aria-label={t('navigation.primary')}>
              {navItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={
                    currentView === item
                      ? 'nav-button nav-button--active'
                      : 'nav-button'
                  }
                  onClick={() => setView(item)}
                  aria-current={currentView === item ? 'page' : undefined}
                >
                  {item === 'agreements' || item === 'feedback'
                    ? t(`workspace.${item}`)
                    : t(`navigation.${item}`)}
                </button>
              ))}
            </nav>
          ) : (
            <div />
          )}
          <div className="header-actions">
            <LanguageSwitcher compact />
            {signedIn ? (
              <button
                className="button button--quiet"
                type="button"
                onClick={() => void handleSignOut()}
              >
                {t('auth.signOut')}
              </button>
            ) : (
              <button
                className="button button--primary"
                type="button"
                onClick={() => openAuth('login')}
              >
                {t('navigation.login')}
              </button>
            )}
          </div>
        </div>
        {shellError ? (
          <p className="header-error" role="alert">
            {t('auth.errors.signOutFailed')}
          </p>
        ) : null}
      </header>

      <main className="app-shell">
        {currentView === 'home' ? (
          <HomeView
            signedIn={signedIn}
            profileName={signedIn ? state.profile.fullName : undefined}
            onNavigate={setView}
            onAuth={openAuth}
          />
        ) : null}
        {currentView === 'profile' ? (
          signedIn ? (
            <ProfileDashboard
              token={state.accessToken}
              role={state.profile.role}
              fullName={state.profile.fullName}
            />
          ) : (
            <AccessGate
              title={t('gates.profileTitle')}
              body={t('gates.profileBody')}
              onLogin={() => openAuth('login')}
            />
          )
        ) : null}
        {currentView === 'jobs' ||
        currentView === 'agreements' ||
        currentView === 'feedback' ? (
          signedIn ? (
            <JobsDashboard
              token={state.accessToken}
              role={state.profile.role}
              onProfile={() => setView('profile')}
              section={currentView}
            />
          ) : (
            <AccessGate
              title={t('gates.jobsTitle')}
              body={t('gates.jobsBody')}
              onLogin={() => openAuth('login')}
            />
          )
        ) : null}
        {currentView === 'login' ? (
          <AuthPanel
            key={authMode}
            initialMode={authMode}
            onNavigate={setView}
          />
        ) : null}
      </main>

      {signedIn ? (
        <nav className="mobile-nav" aria-label={t('navigation.primary')}>
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              className={
                currentView === item
                  ? 'mobile-nav__button mobile-nav__button--active'
                  : 'mobile-nav__button'
              }
              onClick={() => setView(item)}
              aria-current={currentView === item ? 'page' : undefined}
            >
              {item === 'agreements' || item === 'feedback'
                ? t(`workspace.${item}`)
                : t(`navigation.${item}`)}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  )
}

function HomeView({
  signedIn,
  profileName,
  onNavigate,
  onAuth,
}: {
  signedIn: boolean
  profileName: string | undefined
  onNavigate: (view: AppView) => void
  onAuth: (mode: AuthMode) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="home-layout">
      <section className="home-hero">
        <h1>
          {signedIn
            ? t('home.welcome', { name: profileName })
            : t('home.title')}
        </h1>
        <p>{signedIn ? t('home.signedInIntro') : t('home.intro')}</p>
        <div className="button-row">
          {signedIn ? (
            <>
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
            </>
          ) : (
            <>
              <button
                className="button button--primary"
                type="button"
                onClick={() => onAuth('register')}
              >
                {t('home.createAccount')}
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => onAuth('login')}
              >
                {t('home.signIn')}
              </button>
            </>
          )}
        </div>
      </section>
      <aside
        className="landing-illustration"
        aria-label={t('workspace.landingAside')}
      >
        <img
          src="/kaam-pass-logo.png"
          alt=""
          className="landing-illustration__logo"
        />
        <p>{t('workspace.landingAside')}</p>
      </aside>
      {!signedIn ? (
        <section
          className="landing-features"
          aria-label={t('workspace.howItWorks')}
        >
          <h2>{t('workspace.howItWorks')}</h2>
          <div>
            <article>
              <h3>{t('workspace.featureProfile')}</h3>
              <p>{t('workspace.featureProfileBody')}</p>
            </article>
            <article>
              <h3>{t('workspace.featureJobs')}</h3>
              <p>{t('workspace.featureJobsBody')}</p>
            </article>
            <article>
              <h3>{t('workspace.featureHistory')}</h3>
              <p>{t('workspace.featureHistoryBody')}</p>
            </article>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function AccessGate({
  title,
  body,
  onLogin,
}: {
  title: string
  body: string
  onLogin: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="access-gate">
      <h1>{title}</h1>
      <p>{body}</p>
      <button
        className="button button--primary"
        type="button"
        onClick={onLogin}
      >
        {t('navigation.login')}
      </button>
    </section>
  )
}

export function App() {
  const publicPath = window.location.pathname.match(/^\/p\/([^/]+)\/?$/)
  return (
    <AuthProvider>
      {publicPath?.[1] ? (
        <PublicProfilePage publicId={publicPath[1]} />
      ) : (
        <AppShell />
      )}
    </AuthProvider>
  )
}
