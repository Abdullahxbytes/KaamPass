import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createJobBidSchema,
  createJobPostSchema,
  jobPostListResponseSchema,
  jobPostResponseSchema,
  selectJobBidResponseSchema,
  type AccountRole,
  type Agreement,
  type AgreementPricingModel,
  type JobPost,
  type MaterialsResponsibility,
  type Profession,
} from '@kaampass/contracts'

import { apiClient, ApiClientError } from '../../lib/api/api-client'
import {
  ServiceAreaSuggestions,
  serviceAreaListId,
} from '../profile/ServiceAreaSuggestions'
import './marketplace.css'

interface PostDraft {
  title: string
  profession: Profession
  serviceArea: string
  description: string
  preferredStartDate: string
  materials: MaterialsResponsibility
  tradeDetails: Record<string, unknown>
}

interface BidDraft {
  pricingModel: AgreementPricingModel
  amountRupees: string
  estimatedDays: number
  message: string
}

type MarketplaceError =
  | 'invalidPost'
  | 'invalidBid'
  | 'loadFailed'
  | 'saveFailed'
  | 'network'
  | 'profileRequired'
  | 'bidExists'
  | 'professionMismatch'
  | 'closed'
  | 'invalidImages'
  | 'selectionFailed'

const initialPost: PostDraft = {
  title: '',
  profession: 'electrician',
  serviceArea: '',
  description: '',
  preferredStartDate: '',
  materials: 'employer',
  tradeDetails: { work_type: '' },
}

const initialBid: BidDraft = {
  pricingModel: 'fixed_total',
  amountRupees: '',
  estimatedDays: 1,
  message: '',
}

function mapMarketplaceError(
  error: unknown,
  fallback: MarketplaceError,
): MarketplaceError {
  if (error instanceof TypeError) return 'network'
  if (error instanceof ApiClientError) {
    if (
      error.code === 'EMPLOYER_PROFILE_REQUIRED' ||
      error.code === 'WORKER_PROFILE_REQUIRED'
    )
      return 'profileRequired'
    if (error.code === 'BID_ALREADY_EXISTS') return 'bidExists'
    if (error.code === 'PROFESSION_MISMATCH') return 'professionMismatch'
    if (
      error.code === 'JOB_POST_CLOSED' ||
      error.code === 'BID_ALREADY_RESOLVED'
    )
      return 'closed'
    if (
      error.code === 'INVALID_IMAGES' ||
      error.code === 'IMAGE_LIMIT_EXCEEDED' ||
      error.code === 'IMAGES_REQUIRED'
    )
      return 'invalidImages'
    if (error.code === 'BID_SELECTION_FAILED') return 'selectionFailed'
  }
  return fallback
}

export function JobMarketplace({
  token,
  role,
  onProfile,
  onAgreementCreated,
}: {
  token: string
  role: AccountRole
  onProfile: () => void
  onAgreementCreated: (agreement: Agreement) => void
}) {
  const { t } = useTranslation()
  const [posts, setPosts] = useState<JobPost[]>([])
  const [postDraft, setPostDraft] = useState<PostDraft>(initialPost)
  const [bidDrafts, setBidDrafts] = useState<Record<string, BidDraft>>({})
  const [images, setImages] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<MarketplaceError | null>(null)

  useEffect(() => {
    let active = true
    void apiClient
      .authenticatedRequest('/job-posts', token, jobPostListResponseSchema, {
        method: 'GET',
      })
      .then(({ data }) => {
        if (active) setPosts(data)
      })
      .catch((caught: unknown) => {
        if (active) setError(mapMarketplaceError(caught, 'loadFailed'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = createJobPostSchema.safeParse({
      title: postDraft.title,
      profession: postDraft.profession,
      service_area: postDraft.serviceArea,
      description: postDraft.description,
      preferred_start_date: postDraft.preferredStartDate || null,
      materials_responsibility: postDraft.materials,
      trade_details: postDraft.tradeDetails,
    })
    if (!parsed.success || images.length > 3) {
      setError(images.length > 3 ? 'invalidImages' : 'invalidPost')
      return
    }
    setError(null)
    setBusy('create-post')
    try {
      const created = await apiClient.authenticatedRequest(
        '/job-posts',
        token,
        jobPostResponseSchema,
        { method: 'POST', body: parsed.data },
      )
      let saved = created.data
      if (images.length > 0) {
        const form = new FormData()
        images.forEach((image) => form.append('images', image))
        const uploaded = await apiClient.authenticatedUpload(
          `/job-posts/${created.data.id}/images`,
          token,
          jobPostResponseSchema,
          form,
        )
        saved = uploaded.data
      }
      setPosts((current) => [saved, ...current])
      setPostDraft(initialPost)
      setImages([])
    } catch (caught) {
      setError(mapMarketplaceError(caught, 'saveFailed'))
    } finally {
      setBusy(null)
    }
  }

  async function submitBid(post: JobPost) {
    const draft = bidDrafts[post.id] ?? initialBid
    const parsed = createJobBidSchema.safeParse({
      pricing_model: draft.pricingModel,
      amount_minor: Math.round(Number(draft.amountRupees) * 100),
      estimated_days: draft.estimatedDays,
      message: draft.message.trim() || null,
    })
    if (!parsed.success) {
      setError('invalidBid')
      return
    }
    setError(null)
    setBusy(post.id)
    try {
      const result = await apiClient.authenticatedRequest(
        `/job-posts/${post.id}/bids`,
        token,
        jobPostResponseSchema,
        { method: 'POST', body: parsed.data },
      )
      replacePost(result.data)
    } catch (caught) {
      setError(mapMarketplaceError(caught, 'saveFailed'))
    } finally {
      setBusy(null)
    }
  }

  async function selectBid(post: JobPost, bidId: string) {
    setError(null)
    setBusy(bidId)
    try {
      const result = await apiClient.authenticatedRequest(
        `/job-posts/${post.id}/bids/${bidId}/select`,
        token,
        selectJobBidResponseSchema,
        { method: 'POST' },
      )
      replacePost(result.data.job_post)
      onAgreementCreated(result.data.agreement)
    } catch (caught) {
      setError(mapMarketplaceError(caught, 'selectionFailed'))
    } finally {
      setBusy(null)
    }
  }

  function replacePost(post: JobPost) {
    setPosts((current) =>
      current.map((item) => (item.id === post.id ? post : item)),
    )
  }

  if (loading)
    return (
      <section className="marketplace" role="status">
        {t('marketplace.loading')}
      </section>
    )

  return (
    <section className="marketplace">
      <div className="marketplace-heading">
        <div>
          <p className="app-eyebrow">{t('marketplace.eyebrow')}</p>
          <h2>
            {t(
              role === 'employer'
                ? 'marketplace.employerTitle'
                : 'marketplace.workerTitle',
            )}
          </h2>
          <p>
            {t(
              role === 'employer'
                ? 'marketplace.employerIntro'
                : 'marketplace.workerIntro',
            )}
          </p>
        </div>
      </div>

      {error ? (
        <div
          className="form-message form-message--error marketplace-error"
          role="alert"
        >
          <span>{t(`marketplace.errors.${error}`)}</span>
          {error === 'profileRequired' ? (
            <button
              className="button button--quiet"
              type="button"
              onClick={onProfile}
            >
              {t('marketplace.openProfile')}
            </button>
          ) : null}
        </div>
      ) : null}

      {role === 'employer' ? (
        <PostJobForm
          draft={postDraft}
          images={images}
          busy={busy === 'create-post'}
          onDraft={setPostDraft}
          onImages={setImages}
          onSubmit={createPost}
          t={t}
        />
      ) : null}

      <div className="marketplace-list-heading">
        <h3>
          {t(
            role === 'employer'
              ? 'marketplace.yourPosts'
              : 'marketplace.matchingPosts',
          )}
        </h3>
        <span>{posts.length}</span>
      </div>
      {posts.length === 0 ? (
        <div className="agreement-empty">
          {t(
            role === 'employer'
              ? 'marketplace.noEmployerPosts'
              : 'marketplace.noWorkerPosts',
          )}
        </div>
      ) : (
        <div className="marketplace-list">
          {posts.map((post) => (
            <JobPostCard
              key={post.id}
              post={post}
              role={role}
              bidDraft={bidDrafts[post.id] ?? initialBid}
              busy={busy}
              onBidDraft={(draft) =>
                setBidDrafts((current) => ({
                  ...current,
                  [post.id]: draft,
                }))
              }
              onBid={() => void submitBid(post)}
              onSelect={(bidId) => void selectBid(post, bidId)}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function PostJobForm({
  draft,
  images,
  busy,
  onDraft,
  onImages,
  onSubmit,
  t,
}: {
  draft: PostDraft
  images: File[]
  busy: boolean
  onDraft: (draft: PostDraft) => void
  onImages: (files: File[]) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  return (
    <form className="marketplace-form" onSubmit={onSubmit} noValidate>
      <div className="marketplace-form__heading">
        <h3>{t('marketplace.postTitle')}</h3>
        <p>{t('marketplace.postHelp')}</p>
      </div>
      <div className="agreement-form__grid">
        <label>
          {t('marketplace.title')}
          <input
            required
            maxLength={120}
            value={draft.title}
            onChange={(event) =>
              onDraft({ ...draft, title: event.target.value })
            }
          />
        </label>
        <label>
          {t('marketplace.profession')}
          <select
            value={draft.profession}
            onChange={(event) =>
              onDraft({
                ...draft,
                profession: event.target.value as Profession,
                tradeDetails: { work_type: '' },
              })
            }
          >
            {(['electrician', 'plumber', 'painter'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`trades.professions.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('marketplace.serviceArea')}
          <input
            required
            maxLength={120}
            list={serviceAreaListId}
            value={draft.serviceArea}
            onChange={(event) =>
              onDraft({ ...draft, serviceArea: event.target.value })
            }
          />
          <ServiceAreaSuggestions />
        </label>
        <label>
          {t('marketplace.startDate')}
          <input
            type="date"
            value={draft.preferredStartDate}
            onChange={(event) =>
              onDraft({ ...draft, preferredStartDate: event.target.value })
            }
          />
        </label>
        <label className="agreement-form__wide">
          {t('marketplace.description')}
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
          {t('marketplace.materials')}
          <select
            value={draft.materials}
            onChange={(event) =>
              onDraft({
                ...draft,
                materials: event.target.value as MaterialsResponsibility,
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
          {t('marketplace.workType')}
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
        <TradeDetailFields draft={draft} onDraft={onDraft} t={t} />
        <label className="agreement-form__wide marketplace-file">
          {t('marketplace.images')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) =>
              onImages(Array.from(event.target.files ?? []).slice(0, 4))
            }
          />
          <span>{t('marketplace.imageHelp', { count: images.length })}</span>
        </label>
      </div>
      <button
        className="button button--primary button--full"
        type="submit"
        disabled={busy}
      >
        {t(busy ? 'marketplace.posting' : 'marketplace.post')}
      </button>
    </form>
  )
}

function TradeDetailFields({
  draft,
  onDraft,
  t,
}: {
  draft: PostDraft
  onDraft: (draft: PostDraft) => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  const fields =
    draft.profession === 'electrician'
      ? ([['circuit_count', 'circuitCount', 100]] as const)
      : draft.profession === 'plumber'
        ? ([['fixture_count', 'fixtureCount', 100]] as const)
        : ([
            ['area_square_feet', 'areaSquareFeet', 1000000],
            ['coats', 'coats', 10],
          ] as const)
  return fields.map(([field, label, max]) => (
    <label key={field}>
      {t(`agreements.${label}`)}
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
          const tradeDetails = { ...draft.tradeDetails }
          if (event.target.value === '') delete tradeDetails[field]
          else tradeDetails[field] = event.target.valueAsNumber
          onDraft({ ...draft, tradeDetails })
        }}
      />
    </label>
  ))
}

function JobPostCard({
  post,
  role,
  bidDraft,
  busy,
  onBidDraft,
  onBid,
  onSelect,
  t,
}: {
  post: JobPost
  role: AccountRole
  bidDraft: BidDraft
  busy: string | null
  onBidDraft: (draft: BidDraft) => void
  onBid: () => void
  onSelect: (bidId: string) => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  const ownBid = role === 'worker' ? post.bids[0] : undefined
  return (
    <article className="job-post-card">
      <header>
        <div>
          <p className="agreement-card__meta">
            {post.employer_name} · {post.service_area}
          </p>
          <h3>{post.title}</h3>
        </div>
        <span className={`agreement-status agreement-status--${post.status}`}>
          {t(`marketplace.status.${post.status}`)}
        </span>
      </header>
      <p>{post.description}</p>
      <div className="job-post-facts">
        <span>{t(`trades.professions.${post.profession}`)}</span>
        <span>{String(post.trade_details.work_type)}</span>
        <span>
          {t(`agreements.materialOptions.${post.materials_responsibility}`)}
        </span>
        {post.preferred_start_date ? (
          <span>{post.preferred_start_date}</span>
        ) : null}
      </div>
      {post.images.length > 0 ? (
        <div className="job-post-images">
          {post.images.map((image, index) => (
            <img
              key={image.id}
              src={image.url}
              alt={t('marketplace.problemImageAlt', { index: index + 1 })}
            />
          ))}
        </div>
      ) : null}

      {role === 'worker' && post.status === 'open' && !ownBid ? (
        <div className="bid-form">
          <h4>{t('marketplace.placeBid')}</h4>
          <div className="bid-form__grid">
            <label>
              {t('agreements.pricingModel')}
              <select
                value={bidDraft.pricingModel}
                onChange={(event) =>
                  onBidDraft({
                    ...bidDraft,
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
              {t('marketplace.bidAmount')}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={bidDraft.amountRupees}
                onChange={(event) =>
                  onBidDraft({
                    ...bidDraft,
                    amountRupees: event.target.value,
                  })
                }
              />
            </label>
            <label>
              {t('marketplace.estimatedDays')}
              <input
                type="number"
                min={1}
                max={365}
                value={bidDraft.estimatedDays}
                onChange={(event) =>
                  onBidDraft({
                    ...bidDraft,
                    estimatedDays: event.target.valueAsNumber,
                  })
                }
              />
            </label>
            <label className="bid-form__wide">
              {t('marketplace.bidMessage')}
              <textarea
                maxLength={1000}
                value={bidDraft.message}
                onChange={(event) =>
                  onBidDraft({ ...bidDraft, message: event.target.value })
                }
              />
            </label>
          </div>
          <button
            className="button button--primary"
            type="button"
            disabled={busy === post.id}
            onClick={onBid}
          >
            {t('marketplace.submitBid')}
          </button>
        </div>
      ) : null}

      {role === 'worker' && ownBid ? <BidSummary bid={ownBid} t={t} /> : null}
      {role === 'employer' ? (
        <div className="bid-list">
          <h4>{t('marketplace.bids', { count: post.bids.length })}</h4>
          {post.bids.length === 0 ? (
            <p>{t('marketplace.noBids')}</p>
          ) : (
            post.bids.map((bid) => (
              <div className="bid-row" key={bid.id}>
                <BidSummary bid={bid} t={t} />
                {post.status === 'open' && bid.status === 'submitted' ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={busy === bid.id}
                    onClick={() => onSelect(bid.id)}
                  >
                    {t('marketplace.selectWorker')}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </article>
  )
}

function BidSummary({
  bid,
  t,
}: {
  bid: JobPost['bids'][number]
  t: ReturnType<typeof useTranslation>['t']
}) {
  return (
    <div className="bid-summary">
      <div>
        <strong>{bid.worker_name}</strong>
        <span>{bid.service_area}</span>
      </div>
      <div>
        <strong>{formatMoney(bid.total_minor)}</strong>
        <span>
          {t(`agreements.pricing.${bid.pricing_model}`)} ·{' '}
          {t('marketplace.daysCount', { count: bid.estimated_days })}
        </span>
      </div>
      {bid.message ? <p>{bid.message}</p> : null}
      <span className={`agreement-status agreement-status--${bid.status}`}>
        {t(`marketplace.bidStatus.${bid.status}`)}
      </span>
    </div>
  )
}

function formatMoney(amountMinor: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}
