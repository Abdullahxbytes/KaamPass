import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { tradeDetailsSchemas, trades, type Profession } from './trades.js'

describe('trade configuration', () => {
  it('matches the seeded skill identifiers and has labels in every language', () => {
    const seed = readFileSync(resolve('supabase/seed.sql'), 'utf8')
    for (const language of ['en', 'ur-roman', 'ur']) {
      const locale = JSON.parse(
        readFileSync(
          resolve(`apps/web/src/i18n/locales/${language}.json`),
          'utf8',
        ),
      ) as {
        trades: {
          professions: Record<string, string>
          fields: Record<string, string>
          skills: Record<string, string>
        }
      }
      for (const profession of Object.keys(trades) as Profession[]) {
        expect(locale.trades.professions[profession]).toBeTruthy()
        for (const skill of trades[profession].skills) {
          expect(seed).toContain(`('${profession}', '${skill}')`)
          expect(locale.trades.skills[skill]).toBeTruthy()
        }
        for (const field of Object.keys(trades[profession].fields))
          expect(locale.trades.fields[field]).toBeTruthy()
      }
    }
  })

  it('rejects fields for another trade and oversized values', () => {
    expect(
      tradeDetailsSchemas.electrician.safeParse({
        tools: ['tester'],
        emergency_available: true,
      }).success,
    ).toBe(true)
    expect(
      tradeDetailsSchemas.electrician.safeParse({ materials: ['PVC'] }).success,
    ).toBe(false)
    expect(
      tradeDetailsSchemas.painter.safeParse({
        paint_types: Array(21).fill('paint'),
      }).success,
    ).toBe(false)
    expect(
      tradeDetailsSchemas.plumber.safeParse({ materials: ['x'.repeat(101)] })
        .success,
    ).toBe(false)
  })
})
