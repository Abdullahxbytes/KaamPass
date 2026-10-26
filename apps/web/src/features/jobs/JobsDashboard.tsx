import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  agreementListResponseSchema,
  agreementResponseSchema,
  agreementWorkerListResponseSchema,
  createAgreementSchema,
  jobListResponseSchema,
  type AccountRole,
  type Agreement,
  type AgreementPricingModel,
  type AgreementWorker,
  type MaterialsResponsibility,
  type Job,
} from '@kaampass/contracts'

import { apiClient, ApiClientError } from '../../lib/api/api-client'
import { JobMarketplace } from './JobMarketplace'
import { JobCompletionCard } from './JobCompletionCard'
import { JobFeedback } from './JobFeedback'
import './jobs.css'

type JobsMessage =
  | 'invalid'
  | 'loadFailed'
  | 'saveFailed'
  | 'network'
  | 'sessionExpired'
  | 'profileRequired'
  | 'alreadyResponded'
  | 'notFound'

interface AgreementDraft {
  workerId: string
  description: string
  workDays: number
  pricingModel: AgreementPricingModel
  amountRupees: string
  materialsResponsibility: MaterialsResponsibility
  tradeDetails: Record<string, unknown>
}

const initialDraft: AgreementDraft = {
  workerId: '',
  description: '',
  workDays: 1,
  pricingModel: 'fixed_total',
  amountRupees: '',
  materialsResponsibility: 'employer',
  tradeDetails: { work_type: '' },
}

function mapJobsError(error: unknown, fallback: JobsMessage): JobsMessage {
  if (error instanceof TypeError) return 'network'
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'sessionExpired'
    if (error.code === 'EMPLOYER_PROFILE_REQUIRED') return 'profileRequired'
    if (error.code === 'AGREEMENT_ALREADY_RESPONDED') return 'alreadyResponded'
    if (error.status === 404) return 'notFound'
  }
  return fallback
}

export function JobsDashboard({
  token,
  role,
  onProfile,
  section = 'jobs',
}: {
  token: string
  role: AccountRole
  onProfile: () => void
  section?: 'jobs' | 'agreements' | 'feedback'
}) {
  const { t } = useTranslation()
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [workers, setWorkers] = useState<AgreementWorker[]>([])
  const [draft, setDraft] = useState<AgreementDraft>(initialDraft)
  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, string>
  >({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<JobsMessage | null>(null)

  useEffect(() => {
    let active = true
    const requests: [
      Promise<{ data: Agreement[] }>,
      Promise<{ data: AgreementWorker[] }> | null,
    ] = [
      apiClient.authenticatedRequest(
        '/agreements',
        token,
        agreementListResponseSchema,
        { method: 'GET' },
      ),
      role === 'employer'
        ? apiClient.authenticatedRequest(
            '/agreements/workers',
            token,
            agreementWorkerListResponseSchema,
            { method: 'GET' },
          )
        : null,
    ]
    const jobsRequest = apiClient.authenticatedRequest(
      '/agreements/jobs',
      token,
      jobListResponseSchema,
      { method: 'GET' },
    )
    void Promise.all([requests[0], requests[1], jobsRequest])
      .then(([agreementResult, workerResult, jobsResult]) => {
        if (!active) return
        setAgreements(agreementResult.data)
        setJobs(jobsResult.data)
        if (workerResult) {
          setWorkers(workerResult.data)
          setDraft((current) => ({
            ...current,
            workerId: current.workerId || workerResult.data[0]?.id || '',
          }))
        }
      })
      .catch((error: unknown) => {
        if (active) setMessage(mapJobsError(error, 'loadFailed'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [role, token])

  const selectedWorker = workers.find((worker) => worker.id === draft.workerId)
  const previewMinor = useMemo(() => {
    const amount = Number(draft.amountRupees)
    if (!Number.isFinite(amount) || amount <= 0) return null
    const minor = Math.round(amount * 100)
    return draft.pricingModel === 'daily_rate' ? minor * draft.workDays : minor
  }, [draft.amountRupees, draft.pricingModel, draft.workDays])

  async function createAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedWorker) {
      setMessage('invalid')
      return
    }
    const input = {
      worker_id: selectedWorker.id,
      profession: selectedWorker.profession,
      description: draft.description,
      work_days: draft.workDays,
      pricing_model: draft.pricingModel,
      amount_minor: Math.round(Number(draft.amountRupees) * 100),
      currency_code: 'PKR' as const,
      materials_responsibility: draft.materialsResponsibility,
      trade_details: draft.tradeDetails,
    }
    const parsed = createAgreementSchema.safeParse(input)
    if (!parsed.success) {
      setMessage('invalid')
      return
    }
    setMessage(null)
    setBusy('create')
    try {
      const result = await apiClient.authenticatedRequest(
        '/agreements',
        token,
        agreementResponseSchema,
        { method: 'POST', body: parsed.data },
      )
      setAgreements((current) => [result.data, ...current])
      setDraft((current) => ({
        ...initialDraft,
        workerId: current.workerId,
      }))
    } catch (error) {
      setMessage(mapJobsError(error, 'saveFailed'))
    } finally {
      setBusy(null)
    }
  }

  async function respond(agreement: Agreement, response: 'accept' | 'reject') {
    setMessage(null)
    setBusy(agreement.id)
    try {
      const result = await apiClient.authenticatedRequest(
        `/agreements/${agreement.id}/${response}`,
        token,
        agreementResponseSchema,
        {
          method: 'POST',
          body:
            response === 'reject'
              ? { reason: rejectionReasons[agreement.id]?.trim() || null }
              : undefined,
        },
      )
      setAgreements((current) =>
        current.map((item) =>
          item.id === result.data.id ? result.data : item,
        ),
      )
      if (response === 'accept') {
        const updatedJobs = await apiClient.authenticatedRequest(
          '/agreements/jobs',
          token,
          jobListResponseSchema,
          { method: 'GET' },
        )
        setJobs(updatedJobs.data)
      }
    } catch (error) {
      setMessage(mapJobsError(error, 'saveFailed'))
    } finally {
      setBusy(null)
    }
  }

  if (loading)
    return (
      <section className="jobs-dashboard" role="status">
        {t('agreements.loading')}
      </section>
    )

  return (
    <section className="jobs-dashboard">
      {section === 'agreements' ? (
        <header className="jobs-heading">
          <p className="app-eyebrow">{t('agreements.eyebrow')}</p>
          <h1>
            {t(
              role === 'employer'
                ? 'agreements.employerTitle'
                : 'agreements.workerTitle',
            )}
          </h1>
          <p>
            {t(
              role === 'employer'
                ? 'agreements.employerIntro'
                : 'agreements.workerIntro',
            )}
          </p>
        </header>
      ) : null}

      {section === 'jobs' ? (
        <JobMarketplace
          token={token}
          role={role}
          onProfile={onProfile}
          onAgreementCreated={(agreement) =>
            setAgreements((current) => [
              agreement,
              ...current.filter((item) => item.id !== agreement.id),
            ])
          }
        />
      ) : null}

      {message ? (
        <div
          className="form-message form-message--error jobs-message"
          role="alert"
        >
          <span>{t(`agreements.errors.${message}`)}</span>
          {message === 'profileRequired' ? (
            <button
              className="button button--quiet"
              type="button"
              onClick={onProfile}
            >
              {t('agreements.openProfile')}
            </button>
          ) : null}
        </div>
      ) : null}

      {section === 'agreements' && role === 'employer' ? (
        <details className="direct-hire">
          <summary>
            <span>{t('agreements.directTitle')}</span>
            <small>{t('agreements.directIntro')}</small>
          </summary>
          <EmployerAgreementForm
            workers={workers}
            selectedWorker={selectedWorker}
            draft={draft}
            previewMinor={previewMinor}
            busy={busy === 'create'}
            onDraft={setDraft}
            onSubmit={createAgreement}
            t={t}
          />
        </details>
      ) : null}

      {section === 'jobs' ? (
        <>
          <div className="agreement-list-heading">
            <h2>{t('agreements.activeJobs')}</h2>
            <span>{jobs.length}</span>
          </div>
          {jobs.length === 0 ? (
            <div className="agreement-empty">
              {t('agreements.noActiveJobs')}
            </div>
          ) : (
            <div className="agreement-list">
              {jobs.map((job) => (
                <JobCompletionCard
                  key={job.id}
                  job={job}
                  role={role}
                  token={token}
                  onUpdate={(updated) =>
                    setJobs((current) =>
                      current.map((item) =>
                        item.id === updated.id ? updated : item,
                      ),
                    )
                  }
                />
              ))}
            </div>
          )}
        </>
      ) : null}
      {section === 'feedback' ? (
        <>
          <div className="agreement-list-heading">
            <h1>{t('workspace.feedback')}</h1>
          </div>
          {jobs.filter((job) => job.status === 'verified').length === 0 ? (
            <div className="agreement-empty">
              {t('workspace.noFeedbackJobs')}
            </div>
          ) : (
            <div className="agreement-list">
              {jobs
                .filter((job) => job.status === 'verified')
                .map((job) => (
                  <article className="agreement-card" key={job.id}>
                    <h3>
                      {role === 'worker'
                        ? job.agreement.employer_name
                        : job.agreement.worker_name}
                    </h3>
                    <p>{job.agreement.description}</p>
                    <JobFeedback
                      jobId={job.id}
                      token={token}
                      canSubmit={role === 'employer'}
                    />
                  </article>
                ))}
            </div>
          )}
        </>
      ) : null}
      {section === 'agreements' ? (
        <>
          <div className="agreement-list-heading">
            <h2>{t('agreements.listTitle')}</h2>
            <span>{agreements.length}</span>
          </div>
          {agreements.length === 0 ? (
            <div className="agreement-empty">
              <p>{t('agreements.empty')}</p>
            </div>
          ) : (
            <div className="agreement-list">
              {agreements.map((agreement) => (
                <AgreementCard
                  key={agreement.id}
                  agreement={agreement}
                  role={role}
                  busy={busy === agreement.id}
                  rejectionReason={rejectionReasons[agreement.id] ?? ''}
                  onRejectionReason={(value) =>
                    setRejectionReasons((current) => ({
                      ...current,
                      [agreement.id]: value,
                    }))
                  }
                  onRespond={respond}
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}

function EmployerAgreementForm({
  workers,
  selectedWorker,
  draft,
  previewMinor,
  busy,
  onDraft,
  onSubmit,
  t,
}: {
  workers: AgreementWorker[]
  selectedWorker: AgreementWorker | undefined
  draft: AgreementDraft
  previewMinor: number | null
  busy: boolean
  onDraft: (draft: AgreementDraft) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  if (workers.length === 0)
    return <div className="agreement-empty">{t('agreements.noWorkers')}</div>

  return (
    <form className="agreement-form" onSubmit={onSubmit} noValidate>
      <div className="agreement-form__heading">
        <div>
          <h2>{t('agreements.createTitle')}</h2>
          <p>{t('agreements.createIntro')}</p>
        </div>
        {previewMinor === null ? null : (
          <div className="agreement-preview" aria-live="polite">
            <span>{t('agreements.previewTotal')}</span>
            <strong>{formatMoney(previewMinor)}</strong>
          </div>
        )}
      </div>
      <div className="agreement-form__grid">
        <label>
          {t('agreements.worker')}
          <select
            value={draft.workerId}
            onChange={(event) =>
              onDraft({
                ...draft,
                workerId: event.target.value,
                tradeDetails: { work_type: '' },
              })
            }
          >
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.full_name} ·{' '}
                {t(`trades.professions.${worker.profession}`)} ·{' '}
                {worker.service_area}
              </option>
            ))}
          </select>
        </label>
        <label className="agreement-form__wide">
          {t('agreements.description')}
          <textarea
            required
            maxLength={2000}
            value={draft.description}
            onChange={(event) =>
              onDraft({ ...draft, description: event.target.value })
            }
          />
        </label>
        <label>
          {t('agreements.workDays')}
          <input
            type="number"
            min={1}
            max={365}
            value={draft.workDays}
            onChange={(event) =>
              onDraft({ ...draft, workDays: event.target.valueAsNumber })
            }
          />
        </label>
        <label>
          {t('agreements.pricingModel')}
          <select
            value={draft.pricingModel}
            onChange={(event) =>
              onDraft({
                ...draft,
                pricingModel: event.target.value as AgreementPricingModel,
              })
            }
          >
            <option value="fixed_total">
              {t('agreements.pricing.fixed_total')}
            </option>
            <option value="daily_rate">
              {t('agreements.pricing.daily_rate')}
            </option>
          </select>
        </label>
        <label>
          {t(
            draft.pricingModel === 'daily_rate'
              ? 'agreements.dailyAmount'
              : 'agreements.fixedAmount',
          )}
          <input
            type="number"
            min="0.01"
            max="10000000"
            step="0.01"
            value={draft.amountRupees}
            onChange={(event) =>
              onDraft({ ...draft, amountRupees: event.target.value })
            }
          />
        </label>
        <label>
          {t('agreements.materials')}
          <select
            value={draft.materialsResponsibility}
            onChange={(event) =>
              onDraft({
                ...draft,
                materialsResponsibility: event.target
                  .value as MaterialsResponsibility,
              })
            }
          >
            {(['employer', 'worker', 'shared'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`agreements.materialOptions.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('agreements.workType')}
          <input
            required
            maxLength={120}
            value={String(draft.tradeDetails.work_type ?? '')}
            onChange={(event) =>
              onDraft({
                ...draft,
                tradeDetails: {
                  ...draft.tradeDetails,
                  work_type: event.target.value,
                },
              })
            }
          />
        </label>
        {selectedWorker?.profession === 'electrician' ? (
          <NumberDetailField
            label={t('agreements.circuitCount')}
            field="circuit_count"
            draft={draft}
            onDraft={onDraft}
          />
        ) : null}
        {selectedWorker?.profession === 'plumber' ? (
          <NumberDetailField
            label={t('agreements.fixtureCount')}
            field="fixture_count"
            draft={draft}
            onDraft={onDraft}
          />
        ) : null}
        {selectedWorker?.profession === 'painter' ? (
          <>
            <NumberDetailField
              label={t('agreements.areaSquareFeet')}
              field="area_square_feet"
              max={1000000}
              draft={draft}
              onDraft={onDraft}
            />
            <NumberDetailField
              label={t('agreements.coats')}
              field="coats"
              max={10}
              draft={draft}
              onDraft={onDraft}
            />
          </>
        ) : null}
      </div>
      <button
        className="button button--primary button--full"
        type="submit"
        disabled={busy}
      >
        {t(busy ? 'agreements.sending' : 'agreements.send')}
      </button>
    </form>
  )
}

function NumberDetailField({
  label,
  field,
  max = 100,
  draft,
  onDraft,
}: {
  label: string
  field: string
  max?: number
  draft: AgreementDraft
  onDraft: (draft: AgreementDraft) => void
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={1}
        max={max}
        value={
          typeof draft.tradeDetails[field] === 'number'
            ? (draft.tradeDetails[field] as number)
            : ''
        }
        onChange={(event) => {
          const next = { ...draft.tradeDetails }
          if (event.target.value === '') delete next[field]
          else next[field] = event.target.valueAsNumber
          onDraft({ ...draft, tradeDetails: next })
        }}
      />
    </label>
  )
}

function AgreementCard({
  agreement,
  role,
  busy,
  rejectionReason,
  onRejectionReason,
  onRespond,
  t,
}: {
  agreement: Agreement
  role: AccountRole
  busy: boolean
  rejectionReason: string
  onRejectionReason: (value: string) => void
  onRespond: (
    agreement: Agreement,
    response: 'accept' | 'reject',
  ) => Promise<void>
  t: ReturnType<typeof useTranslation>['t']
}) {
  const { i18n } = useTranslation()
  return (
    <article className="agreement-card">
      <header>
        <div>
          <p className="agreement-card__meta">
            {t(`trades.professions.${agreement.profession}`)} ·{' '}
            {new Date(agreement.created_at).toLocaleDateString(
              i18n.language === 'ur-roman' ? 'en-PK' : i18n.language,
            )}
          </p>
          <h3>
            {role === 'worker'
              ? agreement.employer_name
              : agreement.worker_name}
          </h3>
        </div>
        <span
          className={`agreement-status agreement-status--${agreement.status}`}
        >
          {t(`agreements.status.${agreement.status}`)}
        </span>
      </header>
      <p className="agreement-description">{agreement.description}</p>
      <dl className="agreement-terms">
        <div>
          <dt>{t('agreements.workDays')}</dt>
          <dd>{agreement.work_days}</dd>
        </div>
        <div>
          <dt>{t('agreements.pricingModel')}</dt>
          <dd>{t(`agreements.pricing.${agreement.pricing_model}`)}</dd>
        </div>
        <div>
          <dt>{t('agreements.agreedAmount')}</dt>
          <dd>{formatMoney(agreement.amount_minor)}</dd>
        </div>
        <div>
          <dt>{t('agreements.total')}</dt>
          <dd>{formatMoney(agreement.total_minor)}</dd>
        </div>
        <div>
          <dt>{t('agreements.materials')}</dt>
          <dd>
            {t(
              `agreements.materialOptions.${agreement.materials_responsibility}`,
            )}
          </dd>
        </div>
        <div>
          <dt>{t('agreements.workType')}</dt>
          <dd>{String(agreement.trade_details.work_type)}</dd>
        </div>
        {(
          [
            'circuit_count',
            'fixture_count',
            'area_square_feet',
            'coats',
          ] as const
        ).map((field) => {
          const labels = {
            circuit_count: 'circuitCount',
            fixture_count: 'fixtureCount',
            area_square_feet: 'areaSquareFeet',
            coats: 'coats',
          } as const
          const value = agreement.trade_details[field]
          return typeof value === 'number' ? (
            <div key={field}>
              <dt>{t(`agreements.${labels[field]}`)}</dt>
              <dd>{value}</dd>
            </div>
          ) : null
        })}
      </dl>
      {agreement.rejection_reason ? (
        <p className="agreement-rejection">
          <strong>{t('agreements.rejectionReason')}:</strong>{' '}
          {agreement.rejection_reason}
        </p>
      ) : null}
      {role === 'worker' && agreement.status === 'pending' ? (
        <div className="agreement-response">
          <label>
            {t('agreements.rejectionReasonOptional')}
            <textarea
              maxLength={500}
              value={rejectionReason}
              onChange={(event) => onRejectionReason(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="button button--primary"
              type="button"
              disabled={busy}
              onClick={() => void onRespond(agreement, 'accept')}
            >
              {t('agreements.accept')}
            </button>
            <button
              className="button button--quiet"
              type="button"
              disabled={busy}
              onClick={() => void onRespond(agreement, 'reject')}
            >
              {t('agreements.reject')}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  )
}

function formatMoney(amountMinor: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}
