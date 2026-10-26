import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  employerProfileResponseSchema,
  employerProfileSchema,
  trades,
  workerProfileResponseSchema,
  workerProfileSchema,
  type EmployerProfile,
  type Profession,
  type WorkerProfile,
} from '@kaampass/contracts'
import { apiClient, ApiClientError } from '../../lib/api/api-client'
import { WorkerHistory } from './WorkerHistory'
import { PublicProfileSettings } from './PublicProfileSettings'
import { Portfolio } from './Portfolio'
import './profile.css'

const emptyWorker: WorkerProfile = {
  profession: 'electrician',
  service_area: '',
  experience_years: 0,
  bio: null,
  availability: null,
  typical_rate_minor: null,
  currency_code: 'PKR',
  trade_details: {},
  skills: [],
}
const emptyEmployer: EmployerProfile = {
  employer_type: 'household',
  organization_name: null,
}
const employerTypes = [
  'household',
  'contractor',
  'small_business',
  'shop',
  'workshop',
  'construction_business',
] as const

type ProfileErrorKey =
  | 'serviceAreaRequired'
  | 'experienceRange'
  | 'rateInvalid'
  | 'skillsInvalid'
  | 'tradeDetailsInvalid'
  | 'sessionExpired'
  | 'roleDenied'
  | 'serviceUnavailable'
  | 'network'
  | 'saveUnavailable'
  | 'loadUnavailable'
  | 'professionLocked'

function mapProfileError(
  error: unknown,
  action: 'load' | 'save',
): ProfileErrorKey {
  if (error instanceof TypeError) return 'network'
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'sessionExpired'
    if (error.status === 403) return 'roleDenied'
    if (error.code === 'PROFESSION_LOCKED') return 'professionLocked'
    if (error.status === 503) return 'serviceUnavailable'
  }
  return action === 'load' ? 'loadUnavailable' : 'saveUnavailable'
}

export function ProfileDashboard({
  token,
  role,
  fullName,
}: {
  token: string
  role: 'worker' | 'employer'
  fullName: string
}) {
  const { t } = useTranslation()
  const [worker, setWorker] = useState<WorkerProfile>(emptyWorker)
  const [employer, setEmployer] = useState<EmployerProfile>(emptyEmployer)
  const [listInputs, setListInputs] = useState<Record<string, string>>({})
  const [exists, setExists] = useState(false)
  const [editing, setEditing] = useState(false)
  const [savedWorker, setSavedWorker] = useState<WorkerProfile>(emptyWorker)
  const [savedEmployer, setSavedEmployer] =
    useState<EmployerProfile>(emptyEmployer)
  const [errorKey, setErrorKey] = useState<ProfileErrorKey | null>(null)
  const [status, setStatus] = useState<
    | 'loading'
    | 'loadError'
    | 'ready'
    | 'saving'
    | 'saved'
    | 'invalid'
    | 'error'
    | 'locked'
  >('loading')

  useEffect(() => {
    let active = true
    const load =
      role === 'worker'
        ? apiClient.authenticatedRequest(
            '/account/worker-profile',
            token,
            workerProfileResponseSchema,
            { method: 'GET' },
          )
        : apiClient.authenticatedRequest(
            '/account/employer-profile',
            token,
            employerProfileResponseSchema,
            { method: 'GET' },
          )
    void load
      .then(({ data }) => {
        if (!active) return
        setExists(data !== null)
        if (role === 'worker' && data) {
          const profile = data as WorkerProfile
          setWorker(profile)
          setSavedWorker(profile)
          setListInputs(
            Object.fromEntries(
              Object.entries(profile.trade_details)
                .filter(([, value]) => Array.isArray(value))
                .map(([key, value]) => [key, (value as string[]).join(', ')]),
            ),
          )
        }
        if (role === 'employer' && data) {
          setEmployer(data as EmployerProfile)
          setSavedEmployer(data as EmployerProfile)
        }
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorKey(mapProfileError(error, 'load'))
          setStatus('loadError')
        }
      })
    return () => {
      active = false
    }
  }, [role, token])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed =
      role === 'worker'
        ? workerProfileSchema.safeParse(worker)
        : employerProfileSchema.safeParse(employer)
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0]
      setErrorKey(
        field === 'service_area'
          ? 'serviceAreaRequired'
          : field === 'experience_years'
            ? 'experienceRange'
            : field === 'typical_rate_minor'
              ? 'rateInvalid'
              : field === 'skills'
                ? 'skillsInvalid'
                : 'tradeDetailsInvalid',
      )
      setStatus('invalid')
      return
    }
    setErrorKey(null)
    setStatus('saving')
    try {
      if (role === 'worker') {
        const result = await apiClient.authenticatedRequest(
          '/account/worker-profile',
          token,
          workerProfileResponseSchema,
          { method: 'PATCH', body: parsed.data },
        )
        if (result.data) {
          setWorker(result.data)
          setSavedWorker(result.data)
        }
      } else {
        const result = await apiClient.authenticatedRequest(
          '/account/employer-profile',
          token,
          employerProfileResponseSchema,
          { method: 'PATCH', body: parsed.data },
        )
        if (result.data) {
          setEmployer(result.data)
          setSavedEmployer(result.data)
        }
      }
      setExists(true)
      setStatus('saved')
      setEditing(false)
    } catch (error) {
      setErrorKey(mapProfileError(error, 'save'))
      setStatus('error')
    }
  }

  if (status === 'loading')
    return (
      <section className="profile-panel" role="status">
        {t('profile.loading')}
      </section>
    )
  if (status === 'loadError')
    return (
      <section className="profile-panel" role="alert">
        {t(`profile.errors.${errorKey ?? 'loadUnavailable'}`)}{' '}
        <button
          className="button button--secondary"
          type="button"
          onClick={() => window.location.reload()}
        >
          {t('profile.retry')}
        </button>
      </section>
    )

  return (
    <section className="profile-panel">
      <h1>{t('profile.title')}</h1>
      <p>{t(exists ? 'profile.intro' : 'profile.empty')}</p>
      {!editing ? (
        <div className="profile-summary">
          <button
            className="button button--primary profile-summary__edit"
            type="button"
            onClick={() => setEditing(true)}
          >
            {t('workspace.editProfile')}
          </button>
          <dl>
            <div>
              <dt>{t('auth.fullName')}</dt>
              <dd>{fullName}</dd>
            </div>
            {exists && role === 'worker' ? (
              <>
                <div>
                  <dt>{t('profile.profession')}</dt>
                  <dd>{t(`trades.professions.${worker.profession}`)}</dd>
                </div>
                <div>
                  <dt>{t('profile.serviceArea')}</dt>
                  <dd>{worker.service_area}</dd>
                </div>
                <div>
                  <dt>{t('profile.experience')}</dt>
                  <dd>{worker.experience_years}</dd>
                </div>
                <div>
                  <dt>{t('profile.bio')}</dt>
                  <dd>{worker.bio || '—'}</dd>
                </div>
                <div>
                  <dt>{t('profile.availability')}</dt>
                  <dd>{worker.availability || '—'}</dd>
                </div>
                <div>
                  <dt>{t('profile.rate')}</dt>
                  <dd>
                    {worker.typical_rate_minor === null
                      ? '—'
                      : new Intl.NumberFormat(undefined, {
                          style: 'currency',
                          currency: 'PKR',
                        }).format(worker.typical_rate_minor / 100)}
                  </dd>
                </div>
                <div>
                  <dt>{t('profile.skills')}</dt>
                  <dd>
                    {worker.skills.length
                      ? worker.skills
                          .map((skill) => t(`trades.skills.${skill}`))
                          .join(', ')
                      : '—'}
                  </dd>
                </div>
              </>
            ) : exists ? (
              <>
                <div>
                  <dt>{t('profile.employerType')}</dt>
                  <dd>
                    {t(`profile.employerTypes.${employer.employer_type}`)}
                  </dd>
                </div>
                <div>
                  <dt>{t('profile.organization')}</dt>
                  <dd>{employer.organization_name || '—'}</dd>
                </div>
              </>
            ) : null}
          </dl>
          {status === 'saved' ? (
            <p role="status">{t('profile.saved')}</p>
          ) : null}
        </div>
      ) : null}
      {!editing && role === 'worker' ? (
        <details className="profile-management">
          <summary>{t('workspace.manageProfile')}</summary>
          <PublicProfileSettings token={token} exists={exists} />
          <WorkerHistory token={token} />
          {exists ? <Portfolio token={token} /> : null}
        </details>
      ) : null}
      {editing ? (
        <form
          className="auth-form profile-form"
          onSubmit={(event) => void save(event)}
        >
          {role === 'worker' ? (
            <>
              <label>
                {t('profile.profession')}
                <select
                  value={worker.profession}
                  disabled={exists}
                  onChange={(event) => {
                    setListInputs({})
                    setWorker({
                      ...worker,
                      profession: event.target.value as Profession,
                      skills: [],
                      trade_details: {},
                    })
                  }}
                >
                  {Object.keys(trades).map((profession) => (
                    <option key={profession} value={profession}>
                      {t(`trades.professions.${profession}`)}
                    </option>
                  ))}
                </select>
              </label>
              {exists ? (
                <p className="profile-hint">{t('profile.professionLocked')}</p>
              ) : null}
              <label>
                {t('profile.serviceArea')}
                <input
                  required
                  maxLength={120}
                  value={worker.service_area}
                  onChange={(event) =>
                    setWorker({ ...worker, service_area: event.target.value })
                  }
                />
              </label>
              <label>
                {t('profile.experience')}
                <input
                  type="number"
                  min={0}
                  max={100}
                  required
                  value={worker.experience_years}
                  onChange={(event) =>
                    setWorker({
                      ...worker,
                      experience_years: event.target.valueAsNumber,
                    })
                  }
                />
              </label>
              <label>
                {t('profile.bio')}
                <textarea
                  maxLength={2000}
                  value={worker.bio ?? ''}
                  onChange={(event) =>
                    setWorker({ ...worker, bio: event.target.value || null })
                  }
                />
              </label>
              <label>
                {t('profile.availability')}
                <input
                  maxLength={200}
                  value={worker.availability ?? ''}
                  onChange={(event) =>
                    setWorker({
                      ...worker,
                      availability: event.target.value || null,
                    })
                  }
                />
              </label>
              <label>
                {t('profile.rate')}
                <input
                  type="number"
                  min={0}
                  max={10000000}
                  step="0.01"
                  value={
                    worker.typical_rate_minor === null
                      ? ''
                      : worker.typical_rate_minor / 100
                  }
                  onChange={(event) =>
                    setWorker({
                      ...worker,
                      typical_rate_minor:
                        event.target.value === ''
                          ? null
                          : Math.round(event.target.valueAsNumber * 100),
                    })
                  }
                />
              </label>
              <fieldset>
                <legend>{t('profile.skills')}</legend>
                <div className="profile-options">
                  {trades[worker.profession].skills.map((skill) => (
                    <label key={skill}>
                      <input
                        type="checkbox"
                        checked={worker.skills.includes(skill)}
                        onChange={(event) =>
                          setWorker({
                            ...worker,
                            skills: event.target.checked
                              ? [...worker.skills, skill]
                              : worker.skills.filter((item) => item !== skill),
                          })
                        }
                      />
                      {t(`trades.skills.${skill}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>{t('profile.tradeDetails')}</legend>
                {Object.entries(trades[worker.profession].fields).map(
                  ([field, kind]) =>
                    kind === 'boolean' ? (
                      <label className="profile-checkbox" key={field}>
                        <input
                          type="checkbox"
                          checked={worker.trade_details[field] === true}
                          onChange={(event) =>
                            setWorker({
                              ...worker,
                              trade_details: {
                                ...worker.trade_details,
                                [field]: event.target.checked,
                              },
                            })
                          }
                        />
                        {t(`trades.fields.${field}`)}
                      </label>
                    ) : (
                      <label key={field}>
                        {t(`trades.fields.${field}`)}
                        {kind === 'stringList' ? (
                          <input
                            value={listInputs[field] ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setListInputs({ ...listInputs, [field]: value })
                              setWorker({
                                ...worker,
                                trade_details: {
                                  ...worker.trade_details,
                                  [field]: value
                                    .split(',')
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                                },
                              })
                            }}
                            placeholder={t('profile.listHint')}
                          />
                        ) : (
                          <textarea
                            maxLength={500}
                            value={
                              typeof worker.trade_details[field] === 'string'
                                ? (worker.trade_details[field] as string)
                                : ''
                            }
                            onChange={(event) =>
                              setWorker({
                                ...worker,
                                trade_details: {
                                  ...worker.trade_details,
                                  [field]: event.target.value,
                                },
                              })
                            }
                          />
                        )}
                      </label>
                    ),
                )}
              </fieldset>
            </>
          ) : (
            <>
              <label>
                {t('profile.employerType')}
                <select
                  value={employer.employer_type}
                  onChange={(event) =>
                    setEmployer({
                      ...employer,
                      employer_type: event.target
                        .value as EmployerProfile['employer_type'],
                    })
                  }
                >
                  {employerTypes.map((type) => (
                    <option key={type} value={type}>
                      {t(`profile.employerTypes.${type}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('profile.organization')}
                <input
                  maxLength={120}
                  value={employer.organization_name ?? ''}
                  onChange={(event) =>
                    setEmployer({
                      ...employer,
                      organization_name: event.target.value || null,
                    })
                  }
                />
              </label>
            </>
          )}
          {status === 'saved' ? (
            <p role="status">{t('profile.saved')}</p>
          ) : null}
          {['invalid', 'error'].includes(status) ? (
            <p className="form-message form-message--error" role="alert">
              {t(`profile.errors.${errorKey ?? 'saveUnavailable'}`)}
            </p>
          ) : null}
          <button
            className="button button--primary button--full"
            type="submit"
            disabled={status === 'saving'}
          >
            {t(status === 'saving' ? 'profile.saving' : 'profile.save')}
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              setWorker(savedWorker)
              setEmployer(savedEmployer)
              setListInputs(
                Object.fromEntries(
                  Object.entries(savedWorker.trade_details)
                    .filter(([, value]) => Array.isArray(value))
                    .map(([key, value]) => [
                      key,
                      (value as string[]).join(', '),
                    ]),
                ),
              )
              setEditing(false)
              setStatus('ready')
            }}
          >
            {t('workspace.cancel')}
          </button>
        </form>
      ) : null}
    </section>
  )
}
