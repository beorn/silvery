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
 * Encode hyperlink target data without applying scheme policy or granting trust.
 *
 * Strips C0, DEL, and C1 bytes so they cannot terminate OSC 8; percent-encodes
 * remaining characters outside the URL-safe set, preserving existing `%` bytes.
 * Returns `undefined` for empty output or output exceeding
 * {@link MAX_HYPERLINK_TARGET_BYTES}. String builders still apply their supplied
 * target sanitizer; this encoder alone never authorizes a hyperlink.
 */
export function encodeHyperlinkTarget(url: string): string | undefined {
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
  return out
}

/** Return a terminal-safe supplied target, or `undefined` to drop it. */
export function sanitizeHyperlinkTarget(url: string): string | undefined {
  const out = encodeHyperlinkTarget(url)
  if (out === undefined) return undefined

  const colon = out.indexOf(":")
  if (colon <= 0) return undefined
  const scheme = out.slice(0, colon + 1).toLowerCase()
  if (!ALLOWED_SCHEMES.has(scheme)) return undefined
  return out
}

// The private field is the runtime producer identity. JSON and structurally
// similar objects cannot recreate it; the constructor never leaves this module.
const PRODUCER_KEY = Symbol("derived link producer")

class DerivedTarget {
  readonly #uri: string
  constructor(key: typeof PRODUCER_KEY, uri: string) {
    if (key !== PRODUCER_KEY) {
      throw new TypeError("Use deriveLinkTarget to mint a resolved destination")
    }
    this.#uri = uri
    Object.freeze(this)
  }
  static uri(value: unknown): string | undefined {
    return typeof value === "object" && value !== null && #uri in value ? value.#uri : undefined
  }
}
/** An application destination that its producer has already resolved. */
export type DerivedLinkTarget = DerivedTarget

/** Mint a resolved canonical absolute URI. Invalid producer input is an error. */
export function deriveLinkTarget(canonicalUri: string): DerivedLinkTarget {
  if (
    typeof canonicalUri !== "string" ||
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(canonicalUri) ||
    /[^\u0021-\u007e]/u.test(canonicalUri) ||
    new TextEncoder().encode(canonicalUri).length > MAX_HYPERLINK_TARGET_BYTES
  ) {
    throw new TypeError(
      "deriveLinkTarget requires a canonical absolute URI in printable ASCII without whitespace, at most 2083 bytes",
    )
  }
  if (/^file:/i.test(canonicalUri) && !/^file:\/\/(?:localhost)?\/[^\s]*$/i.test(canonicalUri)) {
    throw new TypeError(
      "deriveLinkTarget file URI requires an absolute path and empty or localhost authority",
    )
  }
  return new DerivedTarget(PRODUCER_KEY, canonicalUri)
}

/** Canonical URI readback is deliberately lossy: it does not confer trust. */
export function hyperlinkUri(target: string | DerivedLinkTarget | undefined): string | undefined {
  if (typeof target === "string") return decodeHyperlinkFormat(target).url
  return DerivedTarget.uri(target)
}

/** One terminal target policy; raw strings retain the strict supplied policy. */
export function resolveTerminalHyperlink(
  target: string | DerivedLinkTarget | undefined,
): string | undefined {
  if (typeof target === "string") return sanitizeHyperlinkTarget(decodeHyperlinkFormat(target).url)
  return DerivedTarget.uri(target)
}

/** One DOM policy for adapters and HTML, including generated destinations. */
export function resolveDOMHyperlink(
  target: string | DerivedLinkTarget | undefined,
): string | undefined {
  const uri = hyperlinkUri(target)
  return uri === undefined ? undefined : sanitizeHyperlinkTarget(uri)
}

/** Compare value, provenance and original OSC format, never target allocation. */
export function hyperlinkTargetEquals(
  a: string | DerivedLinkTarget | undefined,
  b: string | DerivedLinkTarget | undefined,
): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b
  return DerivedTarget.uri(a) === DerivedTarget.uri(b)
}

/** Decode parser transport metadata; it is not producer identity. */
function decodeHyperlinkFormat(target: string): { url: string; intro: string; end: string } {
  const match = /^\x01(c1b|c1s|e7b)\x02/.exec(target)
  return {
    url: match ? target.slice(match[0].length) : target,
    intro: match && match[1] !== "e7b" ? "\x9d" : "\x1b]",
    end: match && match[1] !== "c1s" ? "\x07" : "\x1b\\",
  }
}

/** The canonical OSC 8 byte builder, shared by every final terminal sink. */
export function buildHyperlinkSequence(
  target: string | DerivedLinkTarget | undefined,
  close = false,
): string {
  const uri = resolveTerminalHyperlink(target)
  if (uri === undefined) return ""
  const format =
    typeof target === "string" ? decodeHyperlinkFormat(target) : { intro: "\x1b]", end: "\x1b\\" }
  return osc8Sequence(format.intro, close ? "" : uri, format.end)
}

/** Close a previously emitted canonical OSC 8 opening sequence. */
export function closeHyperlinkSequence(open: string | undefined): string {
  if (!open) return ""
  const end = open.endsWith("\x07") ? "\x07" : "\x1b\\"
  return osc8Sequence(open.startsWith("\x9d") ? "\x9d" : "\x1b]", "", end)
}

function osc8Sequence(intro: string, uri: string, end: string): string {
  return `${intro}8;;${uri}${end}`
}
