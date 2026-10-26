import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  workerHistoryResponseSchema,
  type WorkerHistory as History,
} from '@kaampass/contracts'
import { apiClient } from '../../lib/api/api-client'
import { z } from 'zod'

const shareResponseSchema = z.object({
  data: z.object({ summary: z.string().nullable() }),
})

function RecordSharing({
  token,
  recordId,
  initialSummary,
}: {
  token: string
  recordId: string
  initialSummary: string | null
}) {
  const { t } = useTranslation()
  const [summary, setSummary] = useState(initialSummary ?? '')
  const [published, setPublished] = useState(initialSummary !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function update(value: string | null) {
    setBusy(true)
    setError(false)
    try {
      await apiClient.authenticatedRequest(
        `/account/public-records/${recordId}`,
        token,
        shareResponseSchema,
        { method: 'PATCH', body: { summary: value } },
      )
      setPublished(value !== null)
      if (value === null) setSummary('')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="record-sharing">
      <label>
        {t('publicPass.recordLabel')}
        <input
          maxLength={200}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>
      <p>{t('publicPass.recordHint')}</p>
      <div className="button-row">
        <button
          type="button"
          className="button button--secondary"
          disabled={busy || !summary.trim()}
          onClick={() => void update(summary.trim())}
        >
          {t(published ? 'publicPass.recordUpdate' : 'publicPass.recordShare')}
        </button>
        {published ? (
          <button
            type="button"
            className="button button--quiet"
            disabled={busy}
            onClick={() => void update(null)}
          >
            {t('publicPass.recordRemove')}
          </button>
        ) : null}
      </div>
      {published ? <p role="status">{t('publicPass.recordShared')}</p> : null}
      {error ? <p role="alert">{t('publicPass.recordError')}</p> : null}
    </div>
  )
}

export function WorkerHistory({ token }: { token: string }) {
  const { t, i18n } = useTranslation()
  const [history, setHistory] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [page, setPage] = useState(0)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    void apiClient
      .authenticatedRequest(
        `/account/worker-history?offset=${page}`,
        token,
        workerHistoryResponseSchema,
        { method: 'GET' },
      )
      .then(({ data }) => {
        if (!active) return
        setHistory((previous) =>
          page === 0 || !previous
            ? data
            : { ...data, records: [...previous.records, ...data.records] },
        )
        setFailed(false)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, page, retry])

  function loadMore() {
    setLoading(true)
    setPage((current) => current + 20)
  }

  function tryAgain() {
    setLoading(true)
    setRetry((current) => current + 1)
  }

  const money = (amount: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 2,
    }).format(amount / 100)

  return (
    <section className="worker-history" aria-labelledby="history-title">
      <h3 id="history-title">{t('history.title')}</h3>
      <p>{t('history.privateHint')}</p>
      {history ? (
        <>
          <dl className="history-stats">
            <div>
              <dt>{t('history.jobs')}</dt>
              <dd>{history.stats.verified_jobs}</dd>
            </div>
            <div>
              <dt>{t('history.days')}</dt>
              <dd>{history.stats.work_days}</dd>
            </div>
            <div>
              <dt>{t('history.income')}</dt>
              <dd>{money(history.stats.income_minor)}</dd>
            </div>
            <div>
              <dt>{t('history.repeat')}</dt>
              <dd>{history.stats.repeat_employers}</dd>
            </div>
          </dl>
          <p>{t('history.repeatHint')}</p>
          <h4>{t('history.records')}</h4>
          {history.records.length === 0 ? (
            <p>{t('history.empty')}</p>
          ) : (
            <div className="history-list">
              {history.records.map((record) => (
                <article key={record.id} className="history-record">
                  <h5>{record.description}</h5>
                  <p>
                    {record.employer_name} ·{' '}
                    {t(`trades.professions.${record.profession}`)}
                  </p>
                  <p>
                    {t('history.recordDetails', {
                      days: record.work_days,
                      amount: money(record.paid_amount_minor),
                    })}
                  </p>
                  <time dateTime={record.verified_at}>
                    {new Date(record.verified_at).toLocaleDateString(
                      i18n.language,
                    )}
                  </time>
                  <RecordSharing
                    token={token}
                    recordId={record.id}
                    initialSummary={record.public_summary}
                  />
                </article>
              ))}
            </div>
          )}
          {history.records.length < history.stats.verified_jobs && !failed ? (
            <button
              type="button"
              className="button button--quiet"
              disabled={loading}
              onClick={loadMore}
            >
              {t('history.more')}
            </button>
          ) : null}
        </>
      ) : null}
      {loading ? <p role="status">{t('history.loading')}</p> : null}
      {failed ? (
        <p role="alert">
          {t('history.error')}{' '}
          <button
            type="button"
            className="button button--quiet"
            onClick={tryAgain}
          >
            {t('history.retry')}
          </button>
        </p>
      ) : null}
    </section>
  )
}
