import { useTranslation } from 'react-i18next'
import { useState } from 'react'

import {
  getCurrentLanguage,
  supportedLanguages,
  type AppLanguage,
} from '../../i18n/i18n'
import { useAuth } from '../auth/auth-context'

import './language-switcher.css'

const languageNames: Record<AppLanguage, string> = {
  en: 'English',
  'ur-roman': 'Roman Urdu',
  ur: 'اردو',
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const { state, changeLanguage } = useAuth()
  const [error, setError] = useState(false)

  return (
    <label
      className={
        compact
          ? 'language-switcher language-switcher--compact'
          : 'language-switcher'
      }
    >
      <span className={compact ? 'visually-hidden' : undefined}>
        {t('language.label')}
      </span>
      <select
        value={getCurrentLanguage()}
        disabled={state.status === 'loading'}
        onChange={(event) => {
          setError(false)
          void changeLanguage(event.target.value as AppLanguage).catch(() =>
            setError(true),
          )
        }}
      >
        {supportedLanguages.map((language) => (
          <option key={language} value={language}>
            {languageNames[language]}
          </option>
        ))}
      </select>
      {error ? <span role="alert">{t('language.saveError')}</span> : null}
    </label>
  )
}
