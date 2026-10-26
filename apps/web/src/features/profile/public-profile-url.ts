export function publicProfileUrl(origin: string, publicId: string) {
  return new URL(`/p/${encodeURIComponent(publicId)}`, origin).href
}
