import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { publicProfileSettingsResponseSchema } from '@kaampass/contracts'
import { apiClient, ApiClientError } from '../../lib/api/api-client'
import { PublicProfileShare } from './PublicProfileShare'
import './public-profile.css'

type Settings = NonNullable<
  typeof publicProfileSettingsResponseSchema._output.data
>

export function PublicProfileSettings({
  token,
  exists,
}: {
  token: string
  exists: boolean
}) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [area, setArea] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!exists) return
    let active = true
    setLoading(true)
    setError(null)
    void apiClient
      .authenticatedRequest(
        '/account/public-profile',
        token,
        publicProfileSettingsResponseSchema,
        { method: 'GET' },
      )
      .then(({ data }) => {
        if (!active) return
        setSettings(data)
        setArea(data?.public_service_area ?? '')
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof ApiClientError && reason.status === 401
              ? 'session'
              : 'loadError',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, exists, retry])

  async function update(isPublic: boolean) {
    if (isPublic && !area.trim()) {
      setError('areaRequired')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(false)
    try {
      const result = await apiClient.authenticatedRequest(
        '/account/public-profile',
        token,
        publicProfileSettingsResponseSchema,
        {
          method: 'PATCH',
          body: isPublic
            ? { is_public: true, public_service_area: area.trim() }
            : { is_public: false },
        },
      )
      setSettings(result.data)
      setNotice(true)
    } catch (reason) {
      setError(
        reason instanceof ApiClientError && reason.status === 401
          ? 'session'
          : 'saveError',
      )
    } finally {
      setLoading(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void update(true)
  }
  return (
    <section
      className="public-settings"
      aria-labelledby="public-settings-title"
    >
      <h3 id="public-settings-title">{t('publicPass.settingsTitle')}</h3>
      {!exists ? <p>{t('publicPass.saveProfileFirst')}</p> : null}
      {exists && settings ? (
        <>
          <p className="public-settings__status">
            {t(
              settings.is_public
                ? 'publicPass.publicStatus'
                : 'publicPass.privateStatus',
            )}
          </p>
          <p>{t('publicPass.sharedFields')}</p>
          <p>{t('publicPass.privateFields')}</p>
          <form className="auth-form" onSubmit={submit}>
            <label>
              {t('publicPass.areaLabel')}
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                maxLength={120}
                required
                aria-describedby="public-area-hint"
              />
            </label>
            <p id="public-area-hint" className="public-settings__hint">
              {t('publicPass.areaHint')}
            </p>
            <div className="button-row">
              <button
                className="button button--primary"
                disabled={loading}
                type="submit"
              >
                {t(
                  settings.is_public
                    ? 'publicPass.update'
                    : 'publicPass.publish',
                )}
              </button>
              {settings.is_public ? (
                <button
                  className="button button--secondary"
                  disabled={loading}
                  type="button"
                  onClick={() => void update(false)}
                >
                  {t('publicPass.unpublish')}
                </button>
              ) : null}
            </div>
          </form>
          {settings.is_public ? (
            <>
              <p>
                <a href={`/p/${encodeURIComponent(settings.public_id)}`}>
                  {t('publicPass.view')}
                </a>
              </p>
              <PublicProfileShare publicId={settings.public_id} />
            </>
          ) : null}
        </>
      ) : null}
      {loading ? <p role="status">{t('publicPass.loading')}</p> : null}
      {notice ? <p role="status">{t('publicPass.saved')}</p> : null}
      {error ? (
        <p className="form-message form-message--error" role="alert">
          {t(`publicPass.${error}`)}{' '}
          {error === 'loadError' ? (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setRetry((value) => value + 1)}
            >
              {t('profile.retry')}
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}
