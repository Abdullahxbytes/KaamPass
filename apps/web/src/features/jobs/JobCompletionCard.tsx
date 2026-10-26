import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  completeJobSchema,
  jobResponseSchema,
  type AccountRole,
  type Job,
} from '@kaampass/contracts'
import { apiClient, ApiClientError } from '../../lib/api/api-client'

export function JobCompletionCard({
  job,
  role,
  token,
  onUpdate,
}: {
  job: Job
  role: AccountRole
  token: string
  onUpdate: (job: Job) => void
}) {
  const { t } = useTranslation()
  const [days, setDays] = useState(String(job.agreement.work_days))
  const [paid, setPaid] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(path: string, body: unknown) {
    setBusy(true)
    setError(null)
    try {
      const result = await apiClient.authenticatedRequest(
        `/agreements/jobs/${job.id}/${path}`,
        token,
        jobResponseSchema,
        { method: 'POST', body },
      )
      onUpdate(result.data)
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.status === 409
          ? 'changed'
          : caught instanceof ApiClientError && caught.status === 401
            ? 'session'
            : 'save',
      )
    } finally {
      setBusy(false)
    }
  }

  function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = {
      completed_days: Number(days),
      paid_amount_minor: Math.round(Number(paid) * 100),
    }
    if (
      !/^\d+(\.\d{1,2})?$/.test(paid) ||
      !completeJobSchema.safeParse(input).success
    ) {
      setError('invalid')
      return
    }
    void send('complete', input)
  }

  const money = (minor: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 2,
    }).format(minor / 100)

  return (
    <article className="agreement-card">
      <header>
        <h3>
          {role === 'worker'
            ? job.agreement.employer_name
            : job.agreement.worker_name}
        </h3>
        <span className="agreement-status">
          {t(`agreements.jobStatus.${job.status}`)}
        </span>
      </header>
      <p className="agreement-description">{job.agreement.description}</p>
      <dl className="agreement-terms">
        <div>
          <dt>{t('completion.agreedDays')}</dt>
          <dd>{job.agreement.work_days}</dd>
        </div>
        <div>
          <dt>{t('completion.agreedTotal')}</dt>
          <dd>{money(job.agreement.total_minor)}</dd>
        </div>
        {job.completed_days !== null && job.paid_amount_minor !== null ? (
          <>
            <div>
              <dt>{t('completion.completedDays')}</dt>
              <dd>{job.completed_days}</dd>
            </div>
            <div>
              <dt>{t('completion.amountPaid')}</dt>
              <dd>{money(job.paid_amount_minor)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {job.status === 'confirmation_disputed' && job.dispute_reason ? (
        <p>
          {t('completion.reason')}: {job.dispute_reason}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="agreement-rejection">
          {t(`completion.errors.${error}`)}
        </p>
      ) : null}
      {role === 'employer' && job.status === 'active' ? (
        <form className="agreement-response" onSubmit={complete}>
          <p>{t('completion.employerHint')}</p>
          <label>
            {t('completion.completedDays')}
            <input
              type="number"
              min="1"
              max="365"
              step="1"
              required
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          </label>
          <label>
            {t('completion.amountPaidInput')}
            <input
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              required
              value={paid}
              onChange={(event) => setPaid(event.target.value)}
            />
          </label>
          <button
            className="button button--primary"
            disabled={busy}
            type="submit"
          >
            {t('completion.markComplete')}
          </button>
        </form>
      ) : null}
      {role === 'worker' && job.status === 'awaiting_confirmation' ? (
        <div className="agreement-response">
          <p>{t('completion.workerHint')}</p>
          <label>
            {t('completion.reasonOptional')}
            <textarea
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="button button--primary"
              disabled={busy}
              type="button"
              onClick={() =>
                void send('respond', { confirm: true, reason: null })
              }
            >
              {t('completion.confirm')}
            </button>
            <button
              className="button button--quiet"
              disabled={busy}
              type="button"
              onClick={() =>
                void send('respond', {
                  confirm: false,
                  reason: reason.trim() || null,
                })
              }
            >
              {t('completion.cannotConfirm')}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  )
}
