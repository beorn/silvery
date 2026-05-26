/**
 * @silvery/syntax — Shiki-backed syntax highlighting.
 *
 * Two output modes:
 * - **tokens** (`highlight`) — `TokenLine[]` (structured, framework-agnostic)
 * - **ANSI** (`highlightToAnsi`) — ANSI-colored string for raw terminal output
 *
 * Grammars are lazy-loaded per language and cached.
 * Pass `lang: "plain"` or an unknown language to get plain-text lines.
 *
 * @example
 * ```ts
 * import { highlight } from "@silvery/syntax"
 *
 * const lines = await highlight("const x = 1", "typescript", "github-dark")
 * // → TokenLine[], each with { tokens: [{ text, color?, bold?, italic? }] }
 *
 * const ansi = await highlightToAnsi("const x = 1", "typescript", "github-dark")
 * // → ANSI string, e.g. "\x1b[38;2;100;149;237mconst\x1b[0m x = 1"
 * ```
 *
 * @module
 */

// =============================================================================
// Types
// =============================================================================

/** A single highlighted token within a line. */
export interface SyntaxToken {
  /** Raw text content. */
  text: string
  /** Foreground color as 6-digit hex (`#rrggbb`) or undefined for default fg. */
  color?: string
  /** True if the token is bold (e.g., keywords in some themes). */
  bold?: boolean
  /** True if the token is italic (e.g., comments). */
  italic?: boolean
}

/** A single line composed of highlighted tokens. */
export interface TokenLine {
  tokens: SyntaxToken[]
}

// =============================================================================
// Shiki integration — lazy highlighter per language
// =============================================================================

/**
 * Supported language aliases.
 * Maps short aliases to canonical shiki language IDs.
 * Languages not in this map are passed through to shiki as-is.
 */
export const LANG_ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rs: "rust",
  sh: "bash",
  bash: "bash",
  rb: "ruby",
  go: "go",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  kt: "kotlin",
  swift: "swift",
  java: "java",
  php: "php",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  sql: "sql",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "mdx",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  docker: "dockerfile",
  makefile: "makefile",
  nix: "nix",
  zig: "zig",
  lua: "lua",
  haskell: "haskell",
  hs: "haskell",
  erlang: "erlang",
  elixir: "elixir",
  ex: "elixir",
  exs: "elixir",
  clj: "clojure",
  clojure: "clojure",
  r: "r",
  perl: "perl",
  dart: "dart",
  c: "c",
  objc: "objective-c",
  m: "objective-c",
  scala: "scala",
  groovy: "groovy",
  cmake: "cmake",
  powershell: "powershell",
  ps1: "powershell",
  xml: "xml",
  svelte: "svelte",
  vue: "vue",
  tf: "hcl",
  hcl: "hcl",
  proto: "protobuf",
  txt: "plain",
  plain: "plain",
}

/** Default theme when none is specified. */
export const DEFAULT_THEME = "github-dark"

// Singleton shiki instance — created lazily and cached.
let _highlighterPromise: Promise<import("shiki").Highlighter> | undefined

// Cache: lang id → true (grammar already loaded)
const _loadedLangs = new Set<string>()

/**
 * Returns the canonical shiki language ID for a given alias/id.
 * Falls back to the input itself if not in the alias map.
 */
export function canonicalLang(lang: string): string {
  return LANG_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()
}

/**
 * Returns true if the given lang is "plain" (no grammar).
 */
function isPlain(lang: string): boolean {
  return lang === "plain" || lang === "text" || lang === "txt" || lang === ""
}

/**
 * Returns a shiki highlighter with the specified language loaded.
 * The highlighter is shared and grammars are loaded on demand.
 */
async function getHighlighter(lang: string): Promise<import("shiki").Highlighter> {
  // Create shared highlighter once
  if (!_highlighterPromise) {
    _highlighterPromise = (async () => {
      const { createHighlighter } = await import("shiki")
      return createHighlighter({
        themes: [],
        langs: [],
      })
    })()
  }
  const hl = await _highlighterPromise

  // Lazily load theme if not present
  const themeId = DEFAULT_THEME
  const loadedThemes = hl.getLoadedThemes()
  if (!loadedThemes.includes(themeId as import("shiki").BundledTheme)) {
    await hl.loadTheme(themeId as import("shiki").BundledTheme)
  }

  // Lazily load language grammar
  if (!isPlain(lang) && !_loadedLangs.has(lang)) {
    try {
      await hl.loadLanguage(lang as import("shiki").BundledLanguage)
      _loadedLangs.add(lang)
    } catch {
      // Unknown language — fall back to plain-text rendering
      // We don't add it to _loadedLangs so future calls also fall through
    }
  }

  return hl
}

// =============================================================================
// Theme cache: multiple themes per highlighter call
// =============================================================================

const _themeLoadPromises = new Map<string, Promise<void>>()

async function ensureTheme(hl: import("shiki").Highlighter, themeId: string): Promise<void> {
  const loadedThemes = hl.getLoadedThemes()
  if (loadedThemes.includes(themeId as import("shiki").BundledTheme)) return
  const key = themeId
  if (!_themeLoadPromises.has(key)) {
    _themeLoadPromises.set(
      key,
      hl
        .loadTheme(themeId as import("shiki").BundledTheme)
        .then(() => {
          _themeLoadPromises.delete(key)
        })
        .catch(() => {
          _themeLoadPromises.delete(key)
        }),
    )
  }
  await _themeLoadPromises.get(key)
}

// =============================================================================
// Token conversion
// =============================================================================

const FONT_STYLE_ITALIC = 1
const FONT_STYLE_BOLD = 2

/**
 * Convert shiki ThemedToken[][] to our TokenLine[] format.
 * Strips whitespace-only trailing tokens to reduce noise.
 */
function convertTokens(lines: import("shiki").ThemedToken[][]): TokenLine[] {
  return lines.map((lineTokens) => ({
    tokens: lineTokens.map((tok) => {
      const token: SyntaxToken = { text: tok.content }
      if (tok.color && tok.color !== "#000000" && tok.color !== "#ffffff") {
        // Normalize to 6-digit lowercase hex, strip alpha channel
        const hex = tok.color.startsWith("#") ? tok.color.slice(1) : tok.color
        const normalized = hex.length >= 6 ? `#${hex.slice(0, 6).toLowerCase()}` : undefined
        if (normalized) token.color = normalized
      }
      if (tok.fontStyle) {
        if (tok.fontStyle & FONT_STYLE_ITALIC) token.italic = true
        if (tok.fontStyle & FONT_STYLE_BOLD) token.bold = true
      }
      return token
    }),
  }))
}

/**
 * Plain-text fallback — split code into lines, each with a single plain token.
 */
function plainLines(code: string): TokenLine[] {
  return code.split("\n").map((text) => ({ tokens: [{ text }] }))
}

// =============================================================================
// Highlight cache
// =============================================================================

// Key: `${lang}::${theme}::${code}`  — bounded by typical usage (few unique code blocks)
const _cache = new Map<string, TokenLine[]>()
const MAX_CACHE = 512

function cacheGet(key: string): TokenLine[] | undefined {
  return _cache.get(key)
}

function cachePut(key: string, result: TokenLine[]): void {
  if (_cache.size >= MAX_CACHE) {
    // Evict oldest entry (insertion order)
    const first = _cache.keys().next().value
    if (first !== undefined) _cache.delete(first)
  }
  _cache.set(key, result)
}

// =============================================================================
// Pending-highlight queue (for deterministic test settle)
// =============================================================================

// Track every in-flight highlight() promise so test harnesses can await
// the queue draining before snapshotting. Without this, callers that
// kick off `highlight(...)` from a React effect race against the
// snapshot capture: a few-microtask `settle()` is shorter than
// shiki's lazy `createHighlighter()` + grammar load, so tool-row
// goldens flap between the plain-text fallback (shipped synchronously
// from `useSyntaxTokens`) and the Shiki-resolved tokens.
//
// We track the *outer* `highlight()` promise (not internal shiki
// awaits) so the public contract is "await flushPendingHighlights()
// and every previously-issued highlight call has resolved." Recursive
// drains catch cascades where one resolution kicks off another
// highlight call (React re-render → new effect → new highlight).
const _pendingHighlights = new Set<Promise<unknown>>()

function trackHighlight<T>(p: Promise<T>): Promise<T> {
  _pendingHighlights.add(p)
  // Detach on resolution; .catch keeps the tracking finally from
  // becoming an unhandled rejection observer (the outer await still
  // sees the original error/value).
  p.finally(() => _pendingHighlights.delete(p)).catch(() => {})
  return p
}

/**
 * Wait until every in-flight `highlight()` call has resolved.
 *
 * Test harnesses call this before capturing a snapshot to guarantee
 * deterministic output: without it, components that mount with the
 * plain-text fallback and async-upgrade to Shiki-resolved tokens
 * (`SyntaxHighlighter` in silvercode) race the snapshot capture and
 * produce flaky goldens.
 *
 * The drain is **recursive** — if resolving one highlight kicks off
 * another (e.g. a React re-render triggers a new effect, which
 * issues a fresh highlight call), the new call is awaited too. The
 * loop terminates when the pending set is empty after `Promise.all`
 * settles.
 *
 * @example
 * ```ts
 * import { flushPendingHighlights } from "@silvery/syntax"
 *
 * // Inside a test settle():
 * await flushPendingHighlights()
 * // snapshot is deterministic now — no fallback-vs-resolved race.
 * ```
 */
export async function flushPendingHighlights(): Promise<void> {
  // Bounded loop guard — a runaway feedback loop (highlight resolves,
  // spawns N more highlights, those resolve and spawn more) would
  // otherwise wedge the test. 64 iterations is generous; production
  // settle in silvercode visual-snapshot tests typically converges in
  // 2 (initial + post-rerender).
  for (let i = 0; i < 64; i++) {
    if (_pendingHighlights.size === 0) return
    const snapshot = Array.from(_pendingHighlights)
    await Promise.allSettled(snapshot)
    // Drain one round of microtasks so finally-handlers detach
    // resolved promises before the next size check.
    await Promise.resolve()
  }
  // Hitting the cap usually means a runaway loop — surface it loudly
  // so the test author investigates rather than papering over with a
  // larger cap. Fail-loud per km's NO SILENT ERRORS policy.
  throw new Error(
    `flushPendingHighlights: still ${_pendingHighlights.size} pending after 64 drain rounds — likely a feedback loop`,
  )
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Highlight code and return structured token lines.
 *
 * Grammars are lazy-loaded on first use. Results are cached (512 entries,
 * LRU-ish eviction by insertion order).
 *
 * @param code - Source code to highlight.
 * @param lang - Language alias or shiki language ID. Defaults to `"plain"`.
 * @param theme - Shiki bundled theme ID. Defaults to `"github-dark"`.
 * @returns Array of token lines — one entry per newline in `code`.
 *
 * @example
 * ```ts
 * const lines = await highlight("const x = 1", "ts", "github-dark")
 * // lines[0].tokens === [{ text: "const", color: "#f97583" }, { text: " x = 1" }]
 * ```
 */
export function highlight(
  code: string,
  lang: string = "plain",
  theme: string = DEFAULT_THEME,
): Promise<TokenLine[]> {
  return trackHighlight(_highlight(code, lang, theme))
}

async function _highlight(code: string, lang: string, theme: string): Promise<TokenLine[]> {
  const canonLang = canonicalLang(lang)
  const cacheKey = `${canonLang}::${theme}::${code}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  // Plain text — no highlighter needed
  if (isPlain(canonLang)) {
    const result = plainLines(code)
    cachePut(cacheKey, result)
    return result
  }

  try {
    const hl = await getHighlighter(canonLang)
    await ensureTheme(hl, theme)

    // Check if language was actually loaded (unknown lang falls back to plain)
    const loaded = hl.getLoadedLanguages()
    const langId = loaded.find((l) => l === canonLang || l === lang.toLowerCase())

    if (!langId) {
      // Language not available — plain fallback
      const result = plainLines(code)
      cachePut(cacheKey, result)
      return result
    }

    const tokenLines = hl.codeToTokensBase(code, {
      lang: langId as import("shiki").BundledLanguage,
      theme: theme as import("shiki").BundledTheme,
    })
    const result = convertTokens(tokenLines)
    cachePut(cacheKey, result)
    return result
  } catch {
    // Any error → plain text fallback
    const result = plainLines(code)
    cachePut(cacheKey, result)
    return result
  }
}

// =============================================================================
// ANSI output helper
// =============================================================================

const ESC = "\x1b"
const RESET = `${ESC}[0m`

/** Encode 24-bit foreground color using SGR 38;2;r;g;b. */
function ansiTruecolorFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${ESC}[38;2;${r};${g};${b}m`
}

/**
 * Highlight code and return an ANSI-colored string.
 *
 * Uses SGR true-color (24-bit) escape sequences for foreground colors.
 * Suitable for raw terminal output. Line endings are LF (`\n`).
 *
 * @param code - Source code to highlight.
 * @param lang - Language alias or shiki language ID.
 * @param theme - Shiki bundled theme ID. Defaults to `"github-dark"`.
 * @returns ANSI-colored string with SGR reset codes between tokens.
 *
 * @example
 * ```ts
 * const ansi = await highlightToAnsi("const x = 1", "typescript")
 * process.stdout.write(ansi)
 * ```
 */
export async function highlightToAnsi(
  code: string,
  lang: string = "plain",
  theme: string = DEFAULT_THEME,
): Promise<string> {
  const lines = await highlight(code, lang, theme)
  return lines
    .map((line) =>
      line.tokens
        .map((tok) => {
          let prefix = ""
          if (tok.bold) prefix += `${ESC}[1m`
          if (tok.italic) prefix += `${ESC}[3m`
          if (tok.color) prefix += ansiTruecolorFg(tok.color)
          if (prefix) return `${prefix}${tok.text}${RESET}`
          return tok.text
        })
        .join(""),
    )
    .join("\n")
}

/**
 * Invalidate the highlight cache (useful for testing).
 * @internal
 */
export function _clearCache(): void {
  _cache.clear()
}

/**
 * Reset the shiki highlighter singleton (useful for testing).
 * @internal
 */
export function _resetHighlighter(): void {
  _highlighterPromise = undefined
  _loadedLangs.clear()
  _themeLoadPromises.clear()
  _pendingHighlights.clear()
}

/**
 * Snapshot the current pending-highlight count.
 * @internal — for test instrumentation only.
 */
export function _pendingHighlightCount(): number {
  return _pendingHighlights.size
}
