# Text Decorations API (SlateJS-style ranges)

**Bead**: km-silvery.decorations

## Problem

Applications need to overlay styles on text without modifying the underlying text content. Key use cases:

1. **Search highlighting** — Highlight all matches of a search query in TextArea content. The matches need visual emphasis (e.g., yellow background) but the text value should not change.
2. **Syntax highlighting** — Apply colors to code keywords, strings, comments, etc. based on grammar rules. The decorations are derived from the text and should not be stored in it.
3. **Spell-check underlining** — Wavy red underlines on misspelled words.
4. **Diff markers** — Green/red backgrounds on added/removed text.
5. **Cursor highlighting** — Show other users' cursors in collaborative editing.

Currently, TextArea renders plain text with only its own selection highlighting. There is no mechanism to inject additional style ranges.

## Prior Art

### SlateJS Decorations

SlateJS uses a `decorate` function that runs on each text node and returns an array of `Range` objects with custom properties. During rendering, ranges are split into leaves, and each leaf's custom properties are applied as styles.

```ts
const decorate = ([node, path]) => {
  const ranges = [];
  for (const [start, end] of searchMatches(node.text, query)) {
    ranges.push({
      anchor: { path, offset: start },
      focus: { path, offset: end },
      highlight: true,
    });
  }
  return ranges;
};
```

### CodeMirror Decorations

CodeMirror 6 uses a `Decoration` system with mark decorations (inline styling), widget decorations (inline elements), and line decorations (per-line styling). Decorations are created from `RangeSet` values that are efficiently maintained across edits.

### ProseMirror Decorations

Similar to CodeMirror: `DecorationSet` with inline decorations, node decorations, and widget decorations. Mapped through transactions to update positions on edits.

## Proposed API

### Decoration Range Type

```ts
/** A decoration range that overlays styles on text without modifying it */
export interface Decoration {
  /** Start offset in the text (inclusive) */
  from: number;
  /** End offset in the text (exclusive) */
  to: number;
  /** Style properties to apply to this range */
  style: DecorationStyle;
}

/** Style properties for a decoration */
export interface DecorationStyle {
  /** Foreground color */
  color?: string;
  /** Background color */
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
```

### useTextArea Integration

Add an optional `decorations` parameter to `useTextArea` and `TextArea`:

```tsx
// In useTextArea
const ta = useTextArea({
  value: text,
  height: 10,
  wrapWidth: 40,
  decorations: [
    { from: 5, to: 10, style: { backgroundColor: "yellow", color: "black" } },
    { from: 20, to: 25, style: { bold: true, color: "$error" } },
  ],
})

// In TextArea component
<TextArea
  value={text}
  onChange={setText}
  height={10}
  decorations={searchDecorations}
/>
```

### Rendering Changes

The TextArea rendering currently handles two style modes per line:

1. Normal text (plain or with cursor)
2. Selection (inverse)

With decorations, each line must be split into styled segments:

```
Line: "hello world foo bar"
Decorations: [{from: 6, to: 11, style: {bg: "yellow"}}]
Selection: {start: 0, end: 5}

Segments:
  [0,5)  "hello"  -> inverse (selection)
  [5,6)  " "      -> normal
  [6,11) "world"  -> yellow bg (decoration)
  [11,19)" foo bar"-> normal
```

**Key rule**: Selection takes precedence over decorations. Decorations compose with each other (later decorations override earlier ones for overlapping ranges).

## Implementation Plan

### Phase 1: Core types and segment splitting (pure functions)

1. Define `Decoration` and `DecorationStyle` types in `@silvery/tea/text-decorations.ts`.
2. Implement `splitIntoSegments(lineStart, lineEnd, decorations, selection)`:
   - Takes a line range, array of decorations, and optional selection.
   - Returns an array of `{ from, to, style }` segments, sorted by position, non-overlapping.
   - Selection ranges get a special `selection: true` flag.
3. Pure function, fully testable without rendering.

### Phase 2: useTextArea integration

1. Add optional `decorations?: Decoration[]` to `UseTextAreaOptions`.
2. Pass decorations through to `UseTextAreaResult` (they're computed externally, just pass-through).
3. No logic change needed in the hook itself — decorations are purely visual.

### Phase 3: TextArea rendering

1. Add `decorations?: Decoration[]` to `TextAreaProps`.
2. In the render function, replace the current line-rendering logic with segment-based rendering:
   - For each visible line, call `splitIntoSegments()`.
   - Render each segment as a `<Text>` element with the appropriate style props.
3. The cursor rendering merges into the segment system (cursor position becomes a segment boundary).

### Phase 4: Convenience utilities

1. `createSearchDecorations(text, query, style)` — Generate decorations for all occurrences of a search string.
2. `mapDecorations(decorations, textOp)` — Adjust decoration positions after a text edit (shift/expand/contract ranges).

## Key Challenges

### 1. Segment splitting complexity

Multiple overlapping decorations and selection create a complex segmentation problem. The algorithm must:

- Collect all boundary points (decoration starts, ends, selection start, end)
- Sort and deduplicate them
- For each segment, determine the combined style by stacking applicable decorations

This is O(n log n) where n = number of boundary points, which is fine for typical use cases (<100 decorations per line).

### 2. Performance with many decorations

For syntax highlighting, there could be hundreds of decorations. The current TextArea re-renders all visible lines on every value change. With decorations, we need to:

- Memoize the segment computation per line (if decorations haven't changed, reuse)
- Consider a "decoration set" data structure that supports efficient position mapping after edits

For the initial implementation, simple array-of-decorations is sufficient. Optimization can come later.

### 3. Interaction with selection

Selection highlighting currently uses `<Text inverse>`. Decorations might also want to use `inverse`. Rules:

- Selection always wins over decorations (standard text editor behavior)
- Within selected text, decoration colors are ignored (all selected text looks the same)
- Outside selection, decorations compose: later decorations override earlier for conflicting props

### 4. Theme color resolution

Decoration styles should support `$token` colors (e.g., `backgroundColor: "$warning"`). The rendering phase already resolves theme tokens, so decorations would go through the same path.

### 5. Cursor rendering

The cursor is currently rendered as a special segment. With decorations, the cursor position must be a segment boundary, and the cursor styling (inverse for inactive, real cursor for active) takes precedence over decorations at that character.

## Effort Estimate

Medium-to-large. Phase 1 (types + splitting) is ~100 lines. Phase 2 (hook pass-through) is trivial. Phase 3 (rendering changes) is ~150 lines and the most complex part, requiring careful handling of the segment/cursor/selection interaction. Phase 4 (utilities) is ~50 lines. Total: ~300-350 lines plus tests.

The segment splitting is the core algorithmic challenge and should be implemented and tested first, before any rendering integration.
