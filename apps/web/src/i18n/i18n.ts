import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import urRoman from './locales/ur-roman.json'
import ur from './locales/ur.json'
import { publicPassTranslations } from './public-pass'
import { feedbackTranslations } from './feedback'
import { portfolioTranslations } from './portfolio'
import { workspaceTranslations } from './workspace'

export const supportedLanguages = ['en', 'ur-roman', 'ur'] as const
export type AppLanguage = (typeof supportedLanguages)[number]

const languageStorageKey = 'kaampass.language'
let initialization: Promise<void> | undefined

function isAppLanguage(value: string | null): value is AppLanguage {
  return supportedLanguages.some((language) => language === value)
}

function getInitialLanguage(): AppLanguage {
  const storedLanguage = window.localStorage.getItem(languageStorageKey)

  if (isAppLanguage(storedLanguage)) {
    return storedLanguage
  }

  return window.navigator.language.toLowerCase().startsWith('ur') ? 'ur' : 'en'
}

function applyDocumentLanguage(language: AppLanguage) {
  document.documentElement.lang = language === 'ur-roman' ? 'ur-Latn' : language
  document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr'
}

export function initializeI18n() {
  if (initialization) {
    return initialization
  }

  const initialLanguage = getInitialLanguage()

  initialization = i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: {
          translation: {
            ...en,
            publicPass: publicPassTranslations.en,
            feedback: feedbackTranslations.en,
            portfolio: portfolioTranslations.en,
            workspace: workspaceTranslations.en,
          },
        },
        'ur-roman': {
          translation: {
            ...urRoman,
            publicPass: publicPassTranslations['ur-roman'],
            feedback: feedbackTranslations['ur-roman'],
            portfolio: portfolioTranslations['ur-roman'],
            workspace: workspaceTranslations['ur-roman'],
          },
        },
        ur: {
          translation: {
            ...ur,
            publicPass: publicPassTranslations.ur,
            feedback: feedbackTranslations.ur,
            portfolio: portfolioTranslations.ur,
            workspace: workspaceTranslations.ur,
          },
        },
      },
      lng: initialLanguage,
      fallbackLng: 'en',
      supportedLngs: supportedLanguages,
      interpolation: { escapeValue: false },
    })
    .then(() => {
      applyDocumentLanguage(initialLanguage)
      i18n.on('languageChanged', (language) => {
        if (isAppLanguage(language)) {
          applyDocumentLanguage(language)
        }
      })
    })

  return initialization
}

export function getCurrentLanguage(): AppLanguage {
  return isAppLanguage(i18n.language) ? i18n.language : 'en'
}

export async function changeAppLanguage(language: AppLanguage) {
  window.localStorage.setItem(languageStorageKey, language)
  await i18n.changeLanguage(language)
}
