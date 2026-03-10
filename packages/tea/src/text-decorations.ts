/**
 * Text Decorations — SlateJS-style overlay ranges for styled text.
 *
 * Decorations overlay visual styles on text without modifying the underlying
 * content. Use cases: search highlighting, syntax coloring, spell-check
 * underlines, diff markers, collaborative cursors.
 *
 * Architecture layer 0 — no state, no hooks, no components. Pure functions.
 *
 * @example
 * ```ts
 * import { splitIntoSegments, type Decoration } from '@silvery/tea/text-decorations'
 *
 * const decorations: Decoration[] = [
 *   { from: 0, to: 5, style: { backgroundColor: "yellow" } },
 *   { from: 10, to: 15, style: { bold: true } },
 * ]
 *
 * // Split a line range into styled segments
 * const segments = splitIntoSegments(0, 20, decorations, null)
 * // => [
 * //   { from: 0, to: 5, style: { backgroundColor: "yellow" } },
 * //   { from: 5, to: 10, style: {} },
 * //   { from: 10, to: 15, style: { bold: true } },
 * //   { from: 15, to: 20, style: {} },
 * // ]
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Style properties for a decoration. Matches silvery Text component props.
 * All properties are optional — only specified properties are applied.
 */
export interface DecorationStyle {
  /** Foreground color (hex, named, or $token) */
  color?: string;
  /** Background color (hex, named, or $token) */
  backgroundColor?: string;
  /** Bold text */
  bold?: boolean;
  /** Italic text */
  italic?: boolean;
  /** Underline text */
  underline?: boolean;
  /** Strikethrough text */
  strikethrough?: boolean;
  /** Dim (reduced intensity) */
  dimColor?: boolean;
  /** Inverse (swap fg/bg) */
  inverse?: boolean;
}

/**
 * A decoration range that overlays styles on text.
 *
 * Ranges are half-open: [from, to) — `from` is inclusive, `to` is exclusive.
 * Ranges refer to character offsets in the full text value.
 */
export interface Decoration {
  /** Start offset in the text (inclusive) */
  from: number;
  /** End offset in the text (exclusive) */
  to: number;
  /** Style properties to apply to this range */
  style: DecorationStyle;
}

/**
 * A resolved segment with merged styles. Produced by splitIntoSegments().
 * Segments are non-overlapping and sorted by position.
 */
export interface StyledSegment {
  /** Start offset (inclusive) */
  from: number;
  /** End offset (exclusive) */
  to: number;
  /** Merged style from all overlapping decorations */
  style: DecorationStyle;
  /** Whether this segment is within the selection */
  selected?: boolean;
}

/** Selection range as [start, end) character offsets */
export interface SelectionRange {
  start: number;
  end: number;
}

// =============================================================================
// Segment Splitting
// =============================================================================

/**
 * Split a line range into non-overlapping styled segments.
 *
 * Takes a range [lineStart, lineEnd), an array of decorations, and an optional
 * selection range. Returns sorted, non-overlapping segments that cover the
 * entire line range.
 *
 * Rules:
 * - Selection takes precedence over decorations (selected text ignores decoration styles)
 * - Later decorations override earlier ones for overlapping style properties
 * - Empty segments (from === to) are omitted
 * - Decorations outside [lineStart, lineEnd) are clipped
 *
 * @param lineStart - Start of the line range (inclusive, character offset in full text)
 * @param lineEnd - End of the line range (exclusive)
 * @param decorations - Array of decoration ranges (may be empty)
 * @param selection - Optional selection range, or null
 * @returns Array of non-overlapping StyledSegment objects covering [lineStart, lineEnd)
 */
export function splitIntoSegments(
  lineStart: number,
  lineEnd: number,
  decorations: readonly Decoration[],
  selection: SelectionRange | null,
): StyledSegment[] {
  if (lineStart >= lineEnd) return [];

  // Collect all boundary points within the line range
  const boundaries = new Set<number>();
  boundaries.add(lineStart);
  boundaries.add(lineEnd);

  // Add decoration boundaries (clipped to line range)
  for (const dec of decorations) {
    if (dec.to <= lineStart || dec.from >= lineEnd) continue;
    boundaries.add(Math.max(dec.from, lineStart));
    boundaries.add(Math.min(dec.to, lineEnd));
  }

  // Add selection boundaries (clipped to line range)
  if (selection && selection.start < lineEnd && selection.end > lineStart) {
    boundaries.add(Math.max(selection.start, lineStart));
    boundaries.add(Math.min(selection.end, lineEnd));
  }

  // Sort boundaries
  const sorted = Array.from(boundaries).sort((a, b) => a - b);

  // Build segments
  const segments: StyledSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]!;
    const to = sorted[i + 1]!;
    if (from >= to) continue;

    // Check if this segment is within the selection
    const isSelected = selection !== null && from >= selection.start && to <= selection.end;

    // Merge styles from all overlapping decorations (later wins for conflicts)
    const mergedStyle: DecorationStyle = {};
    for (const dec of decorations) {
      if (dec.from >= to || dec.to <= from) continue;
      // Merge: later decoration properties override earlier ones
      Object.assign(mergedStyle, dec.style);
    }

    segments.push({
      from,
      to,
      style: mergedStyle,
      ...(isSelected ? { selected: true } : {}),
    });
  }

  return segments;
}

// =============================================================================
// Decoration Utilities
// =============================================================================

/**
 * Create decorations for all occurrences of a search string in text.
 *
 * @param text - The full text to search in
 * @param query - The search string (case-insensitive)
 * @param style - Style to apply to matches
 * @returns Array of Decoration objects for all matches
 */
export function createSearchDecorations(
  text: string,
  query: string,
  style: DecorationStyle = { backgroundColor: "yellow", color: "black" },
): Decoration[] {
  if (!query || !text) return [];

  const decorations: Decoration[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let pos = 0;

  while (pos < lowerText.length) {
    const idx = lowerText.indexOf(lowerQuery, pos);
    if (idx === -1) break;
    decorations.push({
      from: idx,
      to: idx + query.length,
      style,
    });
    pos = idx + 1; // Allow overlapping matches
  }

  return decorations;
}

/**
 * Adjust decoration positions after a text edit operation.
 *
 * When text is inserted or deleted, decoration ranges need to shift
 * to maintain their association with the correct text content.
 *
 * @param decorations - Existing decorations
 * @param editStart - Position where the edit occurred
 * @param deletedLength - Number of characters deleted (0 for pure insert)
 * @param insertedLength - Number of characters inserted (0 for pure delete)
 * @returns New array of adjusted decorations (removed decorations are filtered out)
 */
export function adjustDecorations(
  decorations: readonly Decoration[],
  editStart: number,
  deletedLength: number,
  insertedLength: number,
): Decoration[] {
  const delta = insertedLength - deletedLength;
  const editEnd = editStart + deletedLength;

  return decorations
    .map((dec) => {
      // Decoration is entirely before the edit — no change
      if (dec.to <= editStart) return dec;

      // Decoration is entirely after the edit — shift by delta
      if (dec.from >= editEnd) {
        return { ...dec, from: dec.from + delta, to: dec.to + delta };
      }

      // Decoration overlaps the edit region — adjust boundaries
      const newFrom = dec.from < editStart ? dec.from : editStart + insertedLength;
      const newTo = dec.to <= editEnd ? editStart + insertedLength : dec.to + delta;

      // If the decoration collapses to zero width, remove it
      if (newFrom >= newTo) return null;

      return { ...dec, from: newFrom, to: newTo };
    })
    .filter((dec): dec is Decoration => dec !== null);
}
