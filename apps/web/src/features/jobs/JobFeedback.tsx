import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { apiClient, ApiClientError } from '../../lib/api/api-client'

const responseSchema = z.object({
  data: z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().nullable(),
    })
    .nullable(),
})

export function JobFeedback({
  jobId,
  token,
  canSubmit,
}: {
  jobId: string
  token: string
  canSubmit: boolean
}) {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState<{
    rating: number
    comment: string | null
  } | null>(null)
  const [rating, setRating] = useState('')
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'saving' | 'error'
  >('loading')
  const [error, setError] = useState('load')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    void apiClient
      .authenticatedRequest(
        `/agreements/jobs/${jobId}/feedback`,
        token,
        responseSchema,
        { method: 'GET' },
      )
      .then(({ data }) => {
        if (active) {
          setFeedback(data)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (active) {
          setError('load')
          setStatus('error')
        }
      })
    return () => {
      active = false
    }
  }, [jobId, token, retry])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    try {
      const result = await apiClient.authenticatedRequest(
        `/agreements/jobs/${jobId}/feedback`,
        token,
        responseSchema,
        {
          method: 'POST',
          body: { rating: Number(rating), comment: comment.trim() || null },
        },
      )
      setFeedback(result.data)
      setStatus('ready')
    } catch (reason) {
      setError(
        reason instanceof ApiClientError && reason.status === 409
          ? 'duplicate'
          : 'save',
      )
      setStatus('error')
    }
  }
  return (
    <section className="agreement-response" aria-label={t('feedback.title')}>
      <h4>{t('feedback.title')}</h4>
      {status === 'loading' ? (
        <p role="status">{t('feedback.loading')}</p>
      ) : null}
      {feedback ? (
        <p>
          {t('feedback.saved', { rating: feedback.rating })} {feedback.comment}
        </p>
      ) : null}
      {status === 'ready' && !feedback && !canSubmit ? (
        <p>{t('feedback.empty')}</p>
      ) : null}
      {status === 'ready' && !feedback && canSubmit ? (
        <form
          className="agreement-response"
          onSubmit={(event) => void submit(event)}
        >
          <p>{t('feedback.hint')}</p>
          <label>
            {t('feedback.rating')}
            <select
              value={rating}
              required
              onChange={(event) => setRating(event.target.value)}
            >
              <option value="" disabled>
                {t('feedback.chooseRating')}
              </option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('feedback.comment')}
            <textarea
              maxLength={500}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <button className="button button--primary" type="submit">
            {t('feedback.submit')}
          </button>
        </form>
      ) : null}
      {status === 'saving' ? <p role="status">{t('feedback.saving')}</p> : null}
      {status === 'error' ? (
        <p role="alert">
          {t(`feedback.errors.${error}`)}{' '}
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              setStatus('loading')
              setRetry((value) => value + 1)
            }}
          >
            {t('feedback.retry')}
          </button>
        </p>
      ) : null}
    </section>
  )
}
