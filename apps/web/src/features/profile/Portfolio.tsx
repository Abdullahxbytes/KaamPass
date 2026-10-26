import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { apiClient } from '../../lib/api/api-client'
import { env } from '../../lib/config/env'
import './portfolio.css'

const itemSchema = z.object({
  id: z.string().uuid(),
  caption: z.string(),
  is_public: z.boolean(),
  created_at: z.string(),
})
const listSchema = z.object({ data: z.array(itemSchema) })
const singleSchema = z.object({ data: itemSchema })
type Item = z.infer<typeof itemSchema>

function PrivateImage({ item, token }: { item: Item; token: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    void fetch(`${env.apiUrl}/portfolio/${item.id}/image`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return
        const blob = await response.blob()
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch(() => {})
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item.id, token])
  return url ? <img src={url} alt={item.caption} /> : null
}

function PortfolioItem({
  item,
  token,
  onChange,
}: {
  item: Item
  token: string
  onChange: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [caption, setCaption] = useState(item.caption)
  const [isPublic, setPublic] = useState(item.is_public)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [saved, setSaved] = useState(false)
  async function update(remove = false) {
    setBusy(true)
    setError(false)
    setSaved(false)
    try {
      if (remove) {
        await apiClient.authenticatedRequest(
          `/portfolio/${item.id}`,
          token,
          z.object({ data: z.boolean() }),
          { method: 'DELETE' },
        )
      } else {
        await apiClient.authenticatedRequest(
          `/portfolio/${item.id}`,
          token,
          singleSchema,
          { method: 'PATCH', body: { caption, is_public: isPublic } },
        )
      }
      await onChange()
      if (!remove) setSaved(true)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="portfolio-item">
      <PrivateImage item={item} token={token} />
      <div className="portfolio-item__content">
        <label>
          {t('portfolio.caption')}
          <input
            value={caption}
            maxLength={200}
            onChange={(event) => {
              setCaption(event.target.value)
              setSaved(false)
            }}
          />
        </label>
        <label className="portfolio-check">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => {
              setPublic(event.target.checked)
              setSaved(false)
            }}
          />
          {t('portfolio.public')}
        </label>
        <div className="portfolio-actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={busy || !caption.trim()}
            onClick={() => void update()}
          >
            {t('portfolio.save')}
          </button>
          {!confirmRemove && (
            <button
              type="button"
              className="button button--quiet"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              {t('portfolio.remove')}
            </button>
          )}
        </div>
        {confirmRemove && (
          <div className="portfolio-confirm">
            <p>{t('portfolio.confirmRemove')}</p>
            <div className="portfolio-actions">
              <button
                type="button"
                className="button button--quiet"
                disabled={busy}
                onClick={() => void update(true)}
              >
                {t('portfolio.remove')}
              </button>
              <button
                type="button"
                className="button button--secondary"
                disabled={busy}
                onClick={() => setConfirmRemove(false)}
              >
                {t('portfolio.cancelRemove')}
              </button>
            </div>
          </div>
        )}
        {saved && <p role="status">{t('portfolio.saved')}</p>}
        {error && <p role="alert">{t('portfolio.error')}</p>}
      </div>
    </article>
  )
}

export function Portfolio({ token }: { token: string }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [fileKey, setFileKey] = useState(0)
  async function load() {
    const result = await apiClient.authenticatedRequest(
      '/portfolio',
      token,
      listSchema,
      { method: 'GET' },
    )
    setItems(result.data)
  }
  useEffect(() => {
    let active = true
    void apiClient
      .authenticatedRequest('/portfolio', token, listSchema, { method: 'GET' })
      .then(({ data }) => {
        if (active) setItems(data)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])
  async function add(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError(false)
    try {
      const body = new FormData()
      body.append('image', file)
      body.append('caption', caption)
      await apiClient.authenticatedUpload(
        '/portfolio',
        token,
        singleSchema,
        body,
      )
      await load()
      setCaption('')
      setFile(null)
      setFileKey((value) => value + 1)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="portfolio">
      <h3>{t('portfolio.title')}</h3>
      <p>{t('portfolio.hint')}</p>
      {loading ? (
        <p role="status">{t('portfolio.loading')}</p>
      ) : items.length ? (
        <div className="portfolio-grid">
          {items.map((item) => (
            <PortfolioItem
              key={item.id}
              item={item}
              token={token}
              onChange={load}
            />
          ))}
        </div>
      ) : (
        !error && <p>{t('portfolio.empty')}</p>
      )}
      <form className="portfolio-upload" onSubmit={(event) => void add(event)}>
        <label>
          {t('portfolio.photo')}
          <input
            key={fileKey}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          {t('portfolio.caption')}
          <input
            required
            maxLength={200}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </label>
        <button
          className="button button--primary"
          disabled={busy}
          type="submit"
        >
          {t(busy ? 'portfolio.busy' : 'portfolio.add')}
        </button>
      </form>
      {error && <p role="alert">{t('portfolio.error')}</p>}
    </section>
  )
}

export function PublicPortfolio({ publicId }: { publicId: string }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void apiClient
      .get(`/portfolio/public/${encodeURIComponent(publicId)}`, listSchema, {
        signal: controller.signal,
      })
      .then(({ data }) => setItems(data))
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [publicId])
  return (
    <section className="public-page__section">
      <h2>{t('portfolio.gallery')}</h2>
      {error ? (
        <p role="alert">{t('portfolio.galleryError')}</p>
      ) : items === null ? (
        <p role="status">{t('portfolio.loading')}</p>
      ) : items.length ? (
        <div className="portfolio-gallery">
          {items.map((item) => (
            <figure key={item.id}>
              <img
                src={`${env.apiUrl}/portfolio/public/${encodeURIComponent(publicId)}/${item.id}/image`}
                alt={item.caption}
              />
              <figcaption>{item.caption}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p>{t('portfolio.galleryEmpty')}</p>
      )}
    </section>
  )
}
