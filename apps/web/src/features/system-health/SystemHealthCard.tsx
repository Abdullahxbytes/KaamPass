import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getSystemHealth, type SystemHealthState } from './system-health.api'

import './system-health-card.css'

async function loadHealth(
  signal?: AbortSignal,
): Promise<SystemHealthState | null> {
  try {
    const response = await getSystemHealth(signal)
    return { status: 'ready', checkedAt: response.data.timestamp }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null
    }

    return {
      status: 'unavailable',
      message:
        error instanceof Error
          ? error.message
          : 'The API could not be reached.',
    }
  }
}

export function SystemHealthCard() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<SystemHealthState>({
    status: 'checking',
  })

  const retryHealthCheck = () => {
    setHealth({ status: 'checking' })
    void loadHealth().then((nextHealth) => {
      if (nextHealth) {
        setHealth(nextHealth)
      }
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadHealth(controller.signal).then((nextHealth) => {
      if (nextHealth) {
        setHealth(nextHealth)
      }
    })

    return () => controller.abort()
  }, [])

  return (
    <section className="health-card" aria-live="polite">
      <div>
        <p className="health-label">{t('systemHealth.label')}</p>
        <p className={`health-status health-status--${health.status}`}>
          <span aria-hidden="true" className="health-indicator" />
          {t(`systemHealth.status.${health.status}`)}
        </p>
      </div>

      {health.status === 'unavailable' ? (
        <div className="health-error">
          <p>{t('systemHealth.unavailableHelp')}</p>
          <button type="button" onClick={retryHealthCheck}>
            {t('systemHealth.retry')}
          </button>
        </div>
      ) : null}
    </section>
  )
}
