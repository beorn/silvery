/**
 * Plain-text URL finder — one implementation of "where are the URLs in this
 * text", shared by every surface that turns a visible URL into a hyperlink.
 *
 * React-free and dependency-free on purpose: non-UI consumers (agents, CLIs,
 * detection passes) must be able to adopt it without pulling a renderer in.
 * It lives beside `hyperlink.ts` because a caller that found a URL almost
 * always wants to render it as one.
 *
 * Rules, each pinned by `packages/ansi/tests/find-urls.test.ts`:
 * - only `http://` and `https://` schemes;
 * - a URL ends at whitespace, a quote, a backtick, or one of `< > [ ] { }`;
 * - trailing `. , : ; ! ?` belong to the sentence, not the URL;
 * - a `)` is kept only while it balances an earlier `(`, so
 *   `https://en.wikipedia.org/wiki/Foo_(bar)` keeps its final paren while
 *   `(see https://example.com/a)` does not;
 * - a scheme glued to a preceding word character is not a URL
 *   (`xhttps://example.com` yields nothing), matching the `\b` the previous
 *   copies used;
 * - ranges never overlap: a scheme inside an earlier URL is part of that URL,
 *   not a second one, so `https://web.archive.org/web/2020/https://x` and
 *   `https://x/?url=https://y` each yield exactly one range.
 */

export interface UrlRange {
  /** Inclusive offset of the scheme in the source text. */
  readonly start: number
  /** Exclusive end offset: `text.slice(start, end)` is the URL. */
  readonly end: number
  /** The URL exactly as it appears in the source text. */
  readonly url: string
}

/** Characters that end a URL outright — never part of one. */
const TERMINATORS: ReadonlySet<string> = new Set([
  " ",
  "\t",
  "\n",
  "\r",
  "\u00a0",
  '"',
  "'",
  "`",
  "<",
  ">",
  "[",
  "]",
  "{",
  "}",
])

/** Trailing punctuation that belongs to the sentence, not the URL. */
const TRAILING_PUNCTUATION: ReadonlySet<string> = new Set([".", ",", ":", ";", "!", "?"])

/** A scheme that starts a word: `https://` in `xhttps://` is not a URL start. */
const SCHEME_RE = /(?<![A-Za-z0-9_])https?:\/\//gi

function countChar(text: string, start: number, end: number, char: string): number {
  let count = 0
  for (let i = start; i < end; i++) if (text[i] === char) count++
  return count
}

/**
 * Find every plain URL in `text`, in order and non-overlapping.
 *
 * Returns ranges into the ORIGINAL text, so a caller that renders the text in
 * pieces (per token, per row, per style span) can attach the full URL to each
 * piece without re-deriving it.
 */
export function findUrls(text: string): UrlRange[] {
  if (text.length === 0) return []
  const ranges: UrlRange[] = []
  let covered = 0
  for (const match of text.matchAll(SCHEME_RE)) {
    const scheme = match[0]
    const start = match.index ?? 0
    // A scheme inside an earlier URL's path or query — `…/web/2020/https://x`,
    // `?url=https://y` — follows `/` or `=`, so the lookbehind admits it. The
    // accepted range already covers those characters; a second range there
    // would double-render the text it spans.
    if (start < covered) continue
    let end = start + scheme.length
    while (end < text.length && !TERMINATORS.has(text[end] as string)) end++
    // Trim the sentence's punctuation, then any `)` that does not close a `(`
    // inside the URL, until neither applies. Order matters: `https://x/a).`
    // needs both.
    for (let trimmed = true; end > start && trimmed; ) {
      trimmed = false
      while (end > start && TRAILING_PUNCTUATION.has(text[end - 1] as string)) {
        end--
        trimmed = true
      }
      while (
        end > start &&
        text[end - 1] === ")" &&
        countChar(text, start, end, ")") > countChar(text, start, end, "(")
      ) {
        end--
        trimmed = true
      }
    }
    if (end === start + scheme.length) continue
    covered = end
    ranges.push({ start, end, url: text.slice(start, end) })
  }
  return ranges
}
