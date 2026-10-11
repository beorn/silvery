/**
 * Shared OSC 8 / DOM / link:open target sanitizer.
 *
 * One function, used at every emission point. A refused target drops the
 * hyperlink and keeps the visible text.
 */

/** OSC 8 implementations commonly cap around this many bytes. */
export const MAX_HYPERLINK_TARGET_BYTES = 2083

const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:"])

/** RFC 3986 unreserved + reserved, plus `%` so existing encodings pass through. */
const URL_SAFE = /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/

/**
 * Return a terminal-safe hyperlink target, or `undefined` to drop it.
 *
 * Strips C0, DEL, and C1 bytes so they cannot terminate OSC 8; percent-encodes
 * remaining characters outside the URL-safe set; refuses targets longer than
 * {@link MAX_HYPERLINK_TARGET_BYTES} and schemes other than http, https, mailto.
 */
export function sanitizeHyperlinkTarget(url: string): string | undefined {
  if (url.length === 0) return undefined

  let out = ""
  for (const ch of url) {
    const code = ch.codePointAt(0)
    if (code === undefined) continue
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue
    const piece = URL_SAFE.test(ch) ? ch : encodeURIComponent(ch)
    if (out.length + piece.length > MAX_HYPERLINK_TARGET_BYTES) return undefined
    out += piece
  }

  if (out.length === 0) return undefined

  const colon = out.indexOf(":")
  if (colon <= 0) return undefined
  const scheme = out.slice(0, colon + 1).toLowerCase()
  if (!ALLOWED_SCHEMES.has(scheme)) return undefined
  return out
}
