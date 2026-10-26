import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  publicProfileResponseSchema,
  type PublicProfile,
} from '@kaampass/contracts'
import { apiClient, ApiClientError } from '../../lib/api/api-client'
import { LanguageSwitcher } from '../language/LanguageSwitcher'
import { PublicPortfolio } from './Portfolio'
import './public-profile.css'

export function PublicProfilePage({ publicId }: { publicId: string }) {
  const { t, i18n } = useTranslation()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [status, setStatus] = useState<
    'loading' | 'missing' | 'error' | 'ready'
  >('loading')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void apiClient
      .get(
        `/public-profiles/${encodeURIComponent(publicId)}`,
        publicProfileResponseSchema,
        { signal: controller.signal },
      )
      .then(({ data }) => {
        setProfile(data)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setStatus(
          error instanceof ApiClientError &&
            (error.status === 404 || error.status === 400)
            ? 'missing'
            : 'error',
        )
      })
    return () => controller.abort()
  }, [publicId, retry])

  return (
    <div className="public-page">
      <header className="site-header">
        <div className="public-page__header">
          <a
            className="brand-button"
            href="/"
            aria-label={t('navigation.goHome')}
          >
            <img
              src="/kaam-pass-logo.png"
              alt="KaamPass"
              width="56"
              height="56"
            />
          </a>
          <LanguageSwitcher compact />
        </div>
      </header>
      <main className="public-page__main">
        {status === 'loading' ? (
          <p role="status">{t('publicPass.loading')}</p>
        ) : null}
        {status === 'missing' ? (
          <section>
            <h1>{t('publicPass.missingTitle')}</h1>
            <p>{t('publicPass.missingBody')}</p>
            <a href="/">{t('publicPass.home')}</a>
          </section>
        ) : null}
        {status === 'error' ? (
          <section role="alert">
            <h1>{t('publicPass.errorTitle')}</h1>
            <p>{t('publicPass.errorBody')}</p>
            <button
              className="button button--secondary"
              onClick={() => {
                setStatus('loading')
                setRetry((value) => value + 1)
              }}
            >
              {t('profile.retry')}
            </button>
          </section>
        ) : null}
        {status === 'ready' && profile ? (
          <>
            <section className="public-page__intro">
              <p className="public-page__eyebrow">
                {t('publicPass.pageTitle')}
              </p>
              <h1>{profile.full_name}</h1>
              <p className="public-page__trade">
                {t(`trades.professions.${profile.profession}`)}
              </p>
              <p>
                {profile.service_area} ·{' '}
                {t('publicPass.years', { count: profile.experience_years })}
              </p>
            </section>
            <section className="public-page__section">
              <h2>{t('publicPass.evidence')}</h2>
              <p>{t('publicPass.evidenceHint')}</p>
              <dl className="public-page__stats">
                <div>
                  <dt>{t('history.jobs')}</dt>
                  <dd>{profile.stats.verified_jobs}</dd>
                </div>
                <div>
                  <dt>{t('history.days')}</dt>
                  <dd>{profile.stats.work_days}</dd>
                </div>
                <div>
                  <dt>{t('history.repeat')}</dt>
                  <dd>{profile.stats.repeat_employers}</dd>
                </div>
              </dl>
            </section>
            <section className="public-page__section">
              <h2>{t('profile.skills')}</h2>
              {profile.skills.length ? (
                <ul className="public-page__skills">
                  {profile.skills.map((skill) => (
                    <li key={skill}>{t(`trades.skills.${skill}`)}</li>
                  ))}
                </ul>
              ) : (
                <p>{t('publicPass.noSkills')}</p>
              )}
            </section>
            <section className="public-page__section">
              <h2>{t('publicPass.selectedRecords')}</h2>
              {profile.records.length ? (
                <div className="history-list">
                  {profile.records.map((record, index) => (
                    <article
                      className="history-record"
                      key={`${record.verified_at}-${index}`}
                    >
                      <h3>{record.summary}</h3>
                      <p>
                        {t('publicPass.recordDays', {
                          count: record.work_days,
                        })}
                      </p>
                      <time dateTime={record.verified_at}>
                        {new Date(record.verified_at).toLocaleDateString(
                          i18n.language === 'ur-roman'
                            ? 'en-PK'
                            : i18n.language,
                        )}
                      </time>
                    </article>
                  ))}
                </div>
              ) : (
                <p>{t('publicPass.noRecords')}</p>
              )}
            </section>
            <PublicPortfolio publicId={publicId} />
            <section className="public-page__note">
              <h2>{t('publicPass.aboutVerification')}</h2>
              <p>{t('publicPass.verificationNote')}</p>
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
