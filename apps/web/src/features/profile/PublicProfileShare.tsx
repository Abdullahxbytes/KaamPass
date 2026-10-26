import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { publicProfileUrl } from './public-profile-url'

export function PublicProfileShare({ publicId }: { publicId: string }) {
  const { t } = useTranslation()
  const [message, setMessage] = useState<
    'copied' | 'copyError' | 'shareError' | null
  >(null)
  const url = publicProfileUrl(window.location.origin, publicId)
  const isSecure = new URL(url).protocol === 'https:'

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setMessage('copied')
    } catch {
      setMessage('copyError')
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'KaamPass', url })
      setMessage(null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage('shareError')
    }
  }

  return (
    <section className="public-share" aria-labelledby="share-title">
      <h4 id="share-title">{t('publicPass.shareTitle')}</h4>
      <p>{t('publicPass.shareHint')}</p>
      {isSecure ? (
        <div className="public-share__qr">
          <QRCodeSVG
            value={url}
            size={200}
            marginSize={4}
            title={t('publicPass.qrTitle')}
          />
        </div>
      ) : (
        <p>{t('publicPass.httpsRequired')}</p>
      )}
      <label>
        {t('publicPass.linkLabel')}
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void copy()}
        >
          {t('publicPass.copyLink')}
        </button>
        {typeof navigator.share === 'function' ? (
          <button
            type="button"
            className="button button--quiet"
            onClick={() => void share()}
          >
            {t('publicPass.shareLink')}
          </button>
        ) : null}
      </div>
      {message ? (
        <p role={message === 'copied' ? 'status' : 'alert'}>
          {t(`publicPass.${message}`)}
        </p>
      ) : null}
    </section>
  )
}
