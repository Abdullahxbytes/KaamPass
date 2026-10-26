import { afterAll, describe, expect, it, vi } from 'vitest'
import en from './locales/en.json'
import urRoman from './locales/ur-roman.json'
import ur from './locales/ur.json'
import { publicPassTranslations } from './public-pass'
import { feedbackTranslations } from './feedback'
import { portfolioTranslations } from './portfolio'
import { workspaceTranslations } from './workspace'

function translationKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    translationKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function translationMessages(
  value: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key
      return typeof child === 'string'
        ? [[path, child]]
        : Object.entries(
            translationMessages(child as Record<string, unknown>, path),
          )
    }),
  )
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/{{\s*([^},\s]+)(?:\s*,[^}]*)?\s*}}/g)]
    .map((match) => match[1]!)
    .sort()
}

describe('language preference', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('ships readable Urdu instead of replacement text or mojibake', () => {
    const messages = JSON.stringify(ur)

    expect(messages).toMatch(/[\u0600-\u06ff]/u)
    expect(messages).not.toMatch(/\?{2,}/u)
    expect(messages).not.toMatch(/[ØÙÚÛ]/u)
    expect(ur.profile.title).toBe('آپ کی پروفائل')
  })

  it('keeps every interface message available in all three languages', () => {
    const englishKeys = translationKeys(en).sort()

    expect(translationKeys(urRoman).sort()).toEqual(englishKeys)
    expect(translationKeys(ur).sort()).toEqual(englishKeys)
    const publicKeys = translationKeys(publicPassTranslations.en).sort()
    expect(translationKeys(publicPassTranslations['ur-roman']).sort()).toEqual(
      publicKeys,
    )
    expect(translationKeys(publicPassTranslations.ur).sort()).toEqual(
      publicKeys,
    )
    expect(JSON.stringify(publicPassTranslations.ur)).toMatch(
      /[\u0600-\u06ff]/u,
    )
    for (const translations of [
      feedbackTranslations,
      portfolioTranslations,
      workspaceTranslations,
    ]) {
      const keys = translationKeys(translations.en).sort()
      expect(translationKeys(translations['ur-roman']).sort()).toEqual(keys)
      expect(translationKeys(translations.ur).sort()).toEqual(keys)
      expect(JSON.stringify(translations.ur)).toMatch(/[\u0600-\u06ff]/u)
      expect(JSON.stringify(translations.ur)).not.toMatch(/\?{2,}/u)
    }
  })

  it('preserves interpolation values in every translation', () => {
    for (const translations of [
      { en, 'ur-roman': urRoman, ur },
      publicPassTranslations,
      feedbackTranslations,
      portfolioTranslations,
      workspaceTranslations,
    ]) {
      const english = translationMessages(translations.en)
      for (const language of ['ur-roman', 'ur'] as const) {
        const translated = translationMessages(translations[language])
        for (const [key, value] of Object.entries(english)) {
          expect(
            placeholders(translated[key] ?? ''),
            `${language}: ${key}`,
          ).toEqual(placeholders(value))
        }
      }
    }
  })

  it('restores Urdu direction and persists a switch to Roman Urdu', async () => {
    const storedValues = new Map<string, string>([['kaampass.language', 'ur']])
    const documentElement = { lang: '', dir: '' }

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
      },
      navigator: { language: 'en-US' },
    })
    vi.stubGlobal('document', { documentElement })

    const { changeAppLanguage, initializeI18n } = await import('./i18n')

    await initializeI18n()

    expect(documentElement).toEqual({ lang: 'ur', dir: 'rtl' })

    await changeAppLanguage('ur-roman')

    expect(documentElement).toEqual({ lang: 'ur-Latn', dir: 'ltr' })
    expect(storedValues.get('kaampass.language')).toBe('ur-roman')
  })
})
