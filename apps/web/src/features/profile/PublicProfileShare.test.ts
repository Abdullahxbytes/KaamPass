import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import { createElement } from 'react'
import { publicProfileUrl } from './public-profile-url'

describe('public profile sharing', () => {
  it('encodes only the public profile URL in the QR code', () => {
    const url = publicProfileUrl(
      'https://kaampass.example',
      '61a4ec0c-8173-4c11-9d5a-7dfa72990812',
    )
    expect(url).toBe(
      'https://kaampass.example/p/61a4ec0c-8173-4c11-9d5a-7dfa72990812',
    )
    const svg = renderToStaticMarkup(
      createElement(QRCodeSVG, { value: url, size: 200 }),
    )
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('token')
  })
})
