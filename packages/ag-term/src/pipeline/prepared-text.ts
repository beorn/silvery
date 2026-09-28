/**
 * PreparedText: Per-node text analysis cache (Design G, Steps 1-3).
 *
 * Caches three levels of text analysis on a WeakMap<AgNode> to avoid
 * redundant work across frames:
 *
 *   Level 0 — Plain text (measure phase + maxDisplayWidth computation)
 *   Level 1 — Collected styled text with bg segments (render phase)
 *   Level 2 — Formatted lines per width (render phase, LRU by width)
 *
 * Invalidation uses the epoch-based dirty flag system:
 *   - Plain text:     CONTENT_BIT | CHILDREN_BIT
 *   - Collected text:  CONTENT_BIT | CHILDREN_BIT | STYLE_PROPS_BIT | BG_BIT | SUBTREE_BIT | context theme ref
 *   - Format entries:  cleared when collected text is invalidated; keyed by (width, wrap, trim)
 *
 * The WeakMap ensures automatic cleanup when nodes are removed from the tree.
 * Format entries use a small LRU (4 entries) to handle Flexily measure probes
 * (min-content, max-content, final width) without unbounded growth.
 */

import type { AgNode } from "@silvery/ag/types"
import {
  isDirty,
  CONTENT_BIT,
  CHILDREN_BIT,
  STYLE_PROPS_BIT,
  BG_BIT,
  SUBTREE_BIT,
} from "@silvery/ag/epoch"
import type { TextAnalysis } from "./pretext"
import type { Theme } from "@silvery/ansi"

// ============================================================================
// Types
// ============================================================================

/** Cached formatted lines for a specific width/wrap/trim combination. */
export interface FormatEntry {
  width: number
  wrap: string | boolean | undefined
  trim: boolean
  lines: string[]
  lineOffsets: Array<{ start: number; end: number }>
  hasLineOffsets: boolean
  /**
   * Per-line break classification (soft-space | soft-break | hard | end),
   * one entry per formatted line. Drives the `softWrapped` / `wrapJoinSpace`
   * row metadata that copy-selection reads to rejoin soft-wrapped rows. Cached
   * alongside `lines` so it is replayed identically on cache hits — STRICT
   * incremental≡fresh requires the rowMeta be produced the same way every
   * render. Stored as opaque strings to avoid a cross-module type import.
   */
  lineBreaks: string[]
}

/** Minimal shape of collected text result. Structurally matches TextWithBg. */
export interface CollectedTextResult {
  text: string
  bgSegments: readonly { start: number; end: number; bg: unknown }[]
  childSpans: readonly { node: AgNode; start: number; end: number }[]
  plainLen: number
}

/** Per-text-node cache entry. */
interface TextNodeCache {
  // Level 0: plain text
  plainText: string | null
  plainTextLineCount: number

  // Level 1: collected styled text
  collected: CollectedTextResult | null
  collectedMaxDisplayWidth: number | undefined
  /** The context theme (by reference) when collected was last computed.
   * When the nearest-ancestor ThemeProvider changes its theme, this reference
   * becomes stale and getCachedCollectedText returns null, forcing re-collection
   * with the new theme's token values embedded in the ANSI codes. */
  collectedContextTheme: Theme | null

  // Level 2: formatted lines (LRU, max 4 entries)
  formats: FormatEntry[]

  // Level 3: Pretext analysis (cumWidths, breakpoints, etc.)
  // Built from collected text, invalidated when collected text changes
  analysis: TextAnalysis | null
}

// ============================================================================
// Constants
// ============================================================================

const MAX_FORMAT_ENTRIES = 4

/** Content-affecting flags that invalidate plain text. */
const PLAIN_TEXT_DIRTY = CONTENT_BIT | CHILDREN_BIT

/**
 * All flags that affect collected text (ANSI codes, bg segments, child spans).
 * SUBTREE_BIT is included because collectTextWithBg recurses into virtual text
 * children — a child's style change sets SUBTREE_BIT on the parent without
 * setting STYLE_PROPS_BIT (the parent's own props didn't change).
 */
const COLLECTED_TEXT_DIRTY = CONTENT_BIT | CHILDREN_BIT | STYLE_PROPS_BIT | BG_BIT | SUBTREE_BIT

// ============================================================================
// Storage
// ============================================================================

/** SILVERY_NO_TEXT_CACHE disables all four cache levels; read once at module load. */
const _cacheDisabled = !!process.env.SILVERY_NO_TEXT_CACHE

const textCaches = new WeakMap<AgNode, TextNodeCache>()

function getOrCreate(node: AgNode): TextNodeCache {
  let entry = textCaches.get(node)
  if (!entry) {
    entry = {
      plainText: null,
      plainTextLineCount: 0,
      collected: null,
      collectedMaxDisplayWidth: undefined,
      collectedContextTheme: null,
      formats: [],
      analysis: null,
    }
    textCaches.set(node, entry)
  }
  return entry
}

// ============================================================================
// Level 0: Plain text (measure phase + maxDisplayWidth computation)
// ============================================================================

/**
 * Get cached plain text and line count.
 * Returns null on cache miss (content/children changed or first access).
 */
export function getCachedPlainText(node: AgNode): { text: string; lineCount: number } | null {
  if (_cacheDisabled) return null
  const entry = textCaches.get(node)
  if (entry?.plainText == null) return null
  if (isDirty(node, PLAIN_TEXT_DIRTY)) {
    entry.plainText = null
    return null
  }
  return { text: entry.plainText, lineCount: entry.plainTextLineCount }
}

/** Store plain text in cache. */
export function setCachedPlainText(node: AgNode, text: string, lineCount: number): void {
  const entry = getOrCreate(node)
  entry.plainText = text
  entry.plainTextLineCount = lineCount
}

// ============================================================================
// Level 1: Collected styled text (render phase)
// ============================================================================

/**
 * Get cached collected text (from collectTextWithBg).
 * Invalidated by content, children, style, or bg changes, maxDisplayWidth mismatch,
 * or a context theme change (ancestor ThemeProvider changed token values).
 *
 * @param contextTheme - The active theme at the time of rendering (from getActiveTheme()).
 *   Used as a cache key so that when the nearest-ancestor ThemeProvider changes its
 *   merged theme, text nodes that embed $token ANSI codes in their collected text
 *   are re-collected with the new token values. Pass null when no theme context exists.
 */
export function getCachedCollectedText(
  node: AgNode,
  maxDisplayWidth: number | undefined,
  contextTheme: Theme | null,
): CollectedTextResult | null {
  if (_cacheDisabled) return null
  const entry = textCaches.get(node)
  if (!entry?.collected) return null

  if (isDirty(node, COLLECTED_TEXT_DIRTY)) {
    entry.collected = null
    entry.formats = [] // collected text changed → format stale
    entry.analysis = null // analysis depends on collected text
    return null
  }

  if (entry.collectedMaxDisplayWidth !== maxDisplayWidth) {
    entry.collected = null
    entry.formats = []
    entry.analysis = null
    return null
  }

  // When the ancestor theme changes, ANSI-encoded $token colors in the collected
  // text are stale. Invalidate so collectTextWithBg re-runs with new token values.
  if (entry.collectedContextTheme !== contextTheme) {
    entry.collected = null
    entry.formats = []
    entry.analysis = null
    return null
  }

  return entry.collected
}

/** Store collected text in cache. */
export function setCachedCollectedText(
  node: AgNode,
  result: CollectedTextResult,
  maxDisplayWidth: number | undefined,
  contextTheme: Theme | null,
): void {
  const entry = getOrCreate(node)
  entry.collected = result
  entry.collectedMaxDisplayWidth = maxDisplayWidth
  entry.collectedContextTheme = contextTheme
}

// ============================================================================
// Level 2: Formatted lines per width (render phase, LRU)
// ============================================================================

/**
 * Get cached formatted lines for the given width/wrap/trim.
 * Returns null on cache miss.
 */
export function getCachedFormat(
  node: AgNode,
  width: number,
  wrap: string | boolean | undefined,
  trim: boolean,
): FormatEntry | null {
  if (_cacheDisabled) return null
  const entry = textCaches.get(node)
  if (!entry || entry.formats.length === 0) return null

  for (let i = 0; i < entry.formats.length; i++) {
    const f = entry.formats[i]!
    if (f.width === width && f.wrap === wrap && f.trim === trim) {
      // LRU: move to end (most recently used)
      if (i < entry.formats.length - 1) {
        entry.formats.splice(i, 1)
        entry.formats.push(f)
      }
      return f
    }
  }
  return null
}

/** Store formatted lines in cache (LRU, evicts oldest when full). */
export function setCachedFormat(
  node: AgNode,
  width: number,
  wrap: string | boolean | undefined,
  trim: boolean,
  lines: string[],
  lineOffsets: Array<{ start: number; end: number }>,
  hasLineOffsets: boolean,
  lineBreaks: string[],
): void {
  const entry = getOrCreate(node)

  // Replace existing entry for same key
  for (let i = 0; i < entry.formats.length; i++) {
    const f = entry.formats[i]!
    if (f.width === width && f.wrap === wrap && f.trim === trim) {
      entry.formats[i] = { width, wrap, trim, lines, lineOffsets, hasLineOffsets, lineBreaks }
      return
    }
  }

  // Evict oldest if at capacity
  if (entry.formats.length >= MAX_FORMAT_ENTRIES) {
    entry.formats.shift()
  }
  entry.formats.push({ width, wrap, trim, lines, lineOffsets, hasLineOffsets, lineBreaks })
}

// ============================================================================
// Level 3: Pretext analysis (cumWidths, breakpoints — for snug-content/even wrap)
// ============================================================================

/**
 * Get cached text analysis. Invalidated when content changes.
 * Uses PLAIN_TEXT_DIRTY (not COLLECTED_TEXT_DIRTY) because analysis
 * is built from plain text in measure phase, not styled text.
 */
export function getCachedAnalysis(node: AgNode): TextAnalysis | null {
  if (_cacheDisabled) return null
  const entry = textCaches.get(node)
  if (!entry?.analysis) return null
  if (isDirty(node, PLAIN_TEXT_DIRTY)) {
    entry.analysis = null
    return null
  }
  return entry.analysis
}

/** Store text analysis in cache. */
export function setCachedAnalysis(node: AgNode, analysis: TextAnalysis): void {
  const entry = getOrCreate(node)
  entry.analysis = analysis
}
