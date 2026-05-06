/**
 * TextArea Component
 *
 * Multi-line text input with word wrapping, scrolling, and cursor movement.
 * Uses useBoxRect for width-aware word wrapping and VirtualList-style
 * scroll tracking to keep the cursor visible.
 *
 * Built on useTextArea hook — use the hook directly for custom rendering.
 *
 * Includes full readline-style editing: word movement, word kill, kill ring
 * (yank/cycle), and character transpose -- shared with TextInput via readline-ops.
 *
 * ## Sizing — CSS `field-sizing` analog
 *
 * Two sizing modes, mirroring the CSS `field-sizing` property:
 *
 * - **`fieldSizing="content"` (default)** — the TextArea grows with its
 *   content, clamped between `minRows` and `maxRows`. This is the modern
 *   chat / messaging input convention. Empty input is `minRows` tall;
 *   typing additional lines grows the widget up to `maxRows`; beyond that
 *   the buffer scrolls. Default `minRows={1}`, `maxRows={8}` — drop in a
 *   `<TextArea />` with no props and you get a chat input out of the box.
 *
 * - **`fieldSizing="fixed"`** — the TextArea is exactly `rows` tall
 *   regardless of content. Equivalent to the HTML `<textarea rows={N}>`
 *   attribute. Use when the surrounding layout demands a stable height
 *   (e.g. a code editor pane, a form field with a designed footprint).
 *
 * Visual line counting respects soft wrap: a single long logical line that
 * wraps to multiple visual rows counts as multiple rows toward `minRows`
 * and `maxRows`. `wrap="off"` disables soft wrap; the buffer scrolls
 * horizontally instead.
 *
 * Usage:
 * ```tsx
 * // Chat input — defaults to fieldSizing=content, minRows=1, maxRows=8
 * <TextArea value={value} onChange={setValue} onSubmit={send} />
 *
 * // Code editor — fixed 16 rows
 * <TextArea value={code} onChange={setCode} fieldSizing="fixed" rows={16} />
 *
 * // Compose box — grows up to 12 rows then scrolls
 * <TextArea value={msg} onChange={setMsg} maxRows={12} />
 * ```
 *
 * Supported shortcuts:
 * - Arrow keys: Move cursor (clears selection)
 * - Shift+Arrow: Extend selection
 * - Shift+Home/End: Select to line boundaries
 * - Ctrl+Shift+Arrow: Word-wise selection
 * - Ctrl+A: Beginning of wrapped line (emacs/readline)
 * - Cmd+A: Select all (Kitty keyboard protocol only)
 * - Ctrl+E: End of line
 * - Ctrl+P / Ctrl+N: Up / Down line (Emacs aliases for arrow keys)
 * - Home/End: Beginning/end of line
 * - Alt+B/F: Move by word (wraps across lines)
 * - Ctrl+W, Alt+Backspace: Delete word backwards (kill ring)
 * - Alt+D: Delete word forwards (kill ring)
 * - Ctrl+K: Kill to end of line (kill ring)
 * - Ctrl+U: Kill to beginning of line (kill ring)
 * - Ctrl+Y: Yank (paste from kill ring)
 * - Alt+Y: Cycle through kill ring (after Ctrl+Y)
 * - Ctrl+T: Transpose characters
 * - PageUp/PageDown: Scroll by viewport height
 * - Backspace/Delete: Delete characters (or selected text)
 * - Enter: Insert newline (replaces selection, or submit with submitKey)
 * - Typing with selection: Replaces selected text
 */
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { useBoxRect } from "../../hooks/useLayout"
import { useFocusable } from "../../hooks/useFocusable"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useTextArea } from "./useTextArea"
import { getWrappedLines } from "@silvery/create/text-cursor"
import type { WrappedLine } from "@silvery/create/text-cursor"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"

// =============================================================================
// Types
// =============================================================================

export interface TextAreaProps {
  /** Current value (controlled) */
  value?: string
  /** Initial value (uncontrolled) */
  defaultValue?: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Called on submit (Ctrl+Enter by default, or Enter if submitKey="enter") */
  onSubmit?: (value: string) => void
  /** Key to trigger submit: "ctrl+enter" (default), "enter", or "meta+enter" */
  submitKey?: "ctrl+enter" | "enter" | "meta+enter"
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether input is focused/active (overrides focus system) */
  isActive?: boolean
  /**
   * CSS `field-sizing` analog. Controls how the TextArea computes its
   * visible row count.
   *
   * - `"content"` (default) — height grows with content, clamped between
   *   `minRows` and `maxRows`. Modern chat-input behavior.
   * - `"fixed"` — height is exactly `rows`, regardless of content.
   *
   * @default "content"
   */
  fieldSizing?: "fixed" | "content"
  /**
   * Number of visible rows in `fieldSizing="fixed"` mode. Mirrors the HTML
   * `<textarea rows>` attribute. Ignored in `"content"` mode.
   *
   * @default 1
   */
  rows?: number
  /**
   * Minimum visible rows in `fieldSizing="content"` mode. Empty input
   * still occupies this many rows. Ignored in `"fixed"` mode.
   *
   * @default 1
   */
  minRows?: number
  /**
   * Maximum visible rows in `fieldSizing="content"` mode. Beyond this the
   * buffer scrolls. Ignored in `"fixed"` mode.
   *
   * @default 8
   */
  maxRows?: number
  /** Cursor style: 'block' (inverse) or 'underline' */
  cursorStyle?: "block" | "underline"
  /**
   * When the TextArea is inactive (`isActive === false`), render an
   * inverse/underline "fake cursor" on the cursor row so the caret position
   * stays visible.
   *
   * Default: `true` — preserves the historical behaviour where unfocused
   * inputs show a cell highlight at their last cursor position.
   *
   * Set to `false` for composite editors with two stacked TextAreas (e.g.
   * the queue + command box in silvercode) — the active widget owns the
   * real hardware cursor, and the inactive widget should not render a
   * second visible caret. Without this opt-out the user sees TWO blinking
   * cursors at once.
   */
  showInactiveCursor?: boolean
  /** Number of context lines to keep visible above/below cursor when scrolling (default: 1) */
  scrollMargin?: number
  /** When true, ignore all input and dim the text */
  disabled?: boolean
  /** Maximum number of characters allowed */
  maxLength?: number
  /** Border style (e.g., "round", "single") — wraps input in bordered Box */
  borderStyle?: string
  /** Border color when unfocused (default: "$border-default") */
  borderColor?: string
  /** Border color when focused (default: "$border-focus") */
  focusBorderColor?: string
  /** Test ID for focus system identification */
  testID?: string
  /**
   * Wrapping policy for long logical lines.
   *
   * - `"soft"` (default) — soft-wrap at the parent's content width. A long
   *   single-line input flows into multiple visual rows; height grows up to
   *   `maxRows` (or `rows` in fixed mode). This matches modern chat /
   *   messaging input conventions and the cross-platform / web target.
   * - `"off"` — disable wrap. Long lines stay on a single visual row; the
   *   buffer scrolls horizontally as the cursor moves. Use this for
   *   terminal-style single-row prompts (REPLs, command lines) where wrap
   *   is undesirable.
   *
   * @default "soft"
   */
  wrap?: "soft" | "off"
  /**
   * Called when an arrow key is pressed AT the buffer boundary (where the key
   * would otherwise be a no-op or clamp). Enables cross-widget focus handoff
   * for composite editors.
   *
   * - `"top"` fires when Up is pressed at `cursorRow === 0`
   * - `"bottom"` fires when Down is pressed at `cursorRow === lastRow`
   * - `"left"` fires when Left is pressed at the start of the buffer
   * - `"right"` fires when Right is pressed at the end of the buffer
   *
   * Return `true` to consume the key (cursor doesn't move). Return `false` or
   * omit the handler to let the TextArea clamp the cursor normally.
   *
   * Not fired when Shift is held (shift+arrow extends selection instead).
   */
  onEdge?: (edge: "top" | "bottom" | "left" | "right") => boolean
  /**
   * Foreground color for body text (rendered Text rows).
   *
   * Accepts any silvery theme token (e.g. `"$fg-muted"`, `"$primary"`) or
   * raw color string. Cursor row, selection, and placeholder rendering are
   * unaffected — cursor block/underline still uses `inverse`/`underline`,
   * selection still uses `inverse`, and placeholder text stays at its own
   * `$fg-muted` token.
   *
   * Useful for composite editors (e.g. silvercode's stacked queue + command
   * TextAreas) where the unfocused widget should dim its body text to
   * indicate which side owns focus.
   */
  color?: string
  /**
   * Shortcut for `color="$fg-muted"`. Mutually exclusive with `color` —
   * if both are set, `color` wins.
   *
   * @default false
   */
  dim?: boolean
}

/** Selection range as [start, end) character offsets */
export { type TextAreaSelection } from "./useTextArea"

export interface TextAreaHandle {
  /** Clear the input */
  clear: () => void
  /** Get current value */
  getValue: () => string
  /** Set value programmatically (cursor moves to end) */
  setValue: (value: string) => void
  /** Set cursor position (character offset). Clamped to value length, scrolls to keep visible. */
  setCursor: (offset: number) => void
  /** Get the current selection range, or null if no selection */
  getSelection: () => import("./useTextArea").TextAreaSelection | null
}

// =============================================================================
// Component
// =============================================================================

export const TextArea = forwardRef<TextAreaHandle, TextAreaProps>(function TextArea(
  {
    value: controlledValue,
    defaultValue = "",
    onChange,
    onSubmit,
    submitKey = "ctrl+enter",
    placeholder = "",
    isActive: isActiveProp,
    fieldSizing = "content",
    rows = 1,
    minRows = 1,
    maxRows = 8,
    cursorStyle = "block",
    showInactiveCursor = true,
    scrollMargin = 1,
    disabled,
    maxLength,
    borderStyle: borderStyleProp,
    borderColor: borderColorProp = "$border-default",
    focusBorderColor = "$border-focus",
    testID,
    onEdge,
    wrap = "soft",
    color: bodyColorProp,
    dim,
  },
  ref,
) {
  // Body color resolution: explicit `color` wins over `dim`; `dim` is a
  // shortcut for `$fg-muted`. Falls through to undefined (default fg).
  const bodyColor = bodyColorProp ?? (dim ? "$fg-muted" : undefined)
  // Focus system integration: prop overrides hook.
  // When testID is set, the component participates in the focus tree and
  // isActive derives from focus state. Without testID, default to true
  // for backward compatibility.
  const { focused } = useFocusable()
  const isActive = isActiveProp ?? (testID ? focused : true)

  // LAYOUT_READ_AT_RENDER: parentWidth feeds the soft-wrap math in
  // useTextArea (wrapWidth → wrappedLines). The wrap calculation produces
  // visible-line geometry that the layout engine consumes downstream — text
  // wrap can't be expressed as a flex prop because the wrap algorithm runs
  // inside the React component, not the layout engine. This is the canonical
  // (c) caller per docs/audit/use-layout-rect-callers.md: TextArea is the
  // primary text-wrap primitive; everything else routes through it.
  const { width: parentWidth } = useBoxRect()

  // When borderStyle is set, TextArea renders a Box with border + paddingX.
  // useBoxRect reads from the parent's NodeContext, so we must subtract
  // border (1+1) and padding (1+1) to get the actual content area width.
  const contentWidth = borderStyleProp ? Math.max(1, parentWidth - 4) : parentWidth

  // wrap="off" disables soft-wrap by passing a very large wrapWidth. The
  // wrap algorithm only breaks when a logical line exceeds wrapWidth; at
  // ~10^6 cols, no realistic input wraps. Buffer scrolls horizontally as
  // the cursor moves (CSS overflow on the parent flex line).
  const effectiveWrapWidth = wrap === "off" ? 1_000_000 : contentWidth

  // ─────────────────────────────────────────────────────────────────────
  // Resolve the visible row count from the CSS-style sizing props.
  //
  // - "fixed" mode is straightforward: `rows`.
  // - "content" mode counts visual lines for the *current* value (after
  //   the hook runs) then clamps between `minRows` and `maxRows`.
  //
  // The hook needs a `height` for scroll-clamp + PageUp/Down. We pass the
  // upper bound (`rows` for fixed mode, `maxRows` for content mode) — a
  // value that does NOT depend on `parentWidth`, so it stays stable
  // across the layout-feedback re-render. If we threaded a width-derived
  // height into the hook, the box height would oscillate between the
  // pre-layout (parentWidth=0) and post-layout values, leaving stale
  // paint in the buffer.
  // ─────────────────────────────────────────────────────────────────────
  const lo = Math.max(1, minRows)
  const hi = Math.max(lo, maxRows)
  const upperBoundRows = fieldSizing === "fixed" ? Math.max(1, rows) : hi

  const ta = useTextArea({
    value: controlledValue,
    defaultValue,
    onChange,
    onSubmit,
    submitKey,
    isActive,
    height: upperBoundRows,
    wrapWidth: effectiveWrapWidth,
    scrollMargin,
    disabled,
    maxLength,
    onEdge,
  })

  // Now that the hook has resolved the live value + wrappedLines for the
  // current wrapWidth, compute the actual visible row count. In fixed
  // mode this is just `rows`; in content mode we clamp the wrapped-line
  // count between minRows and maxRows.
  const visibleLineCount =
    fieldSizing === "fixed" ? Math.max(1, rows) : Math.min(hi, Math.max(lo, ta.wrappedLines.length))

  // The Box that holds the TextArea content sets `height` as the OUTER
  // box height (border-box). When `borderStyle` is set we add 2 rows for
  // the top + bottom borders so the content area is exactly
  // `visibleLineCount` rows tall — matching the historical contract where
  // the caller's `height` was the outer height including border.
  const outerHeight = borderStyleProp ? visibleLineCount + 2 : visibleLineCount

  // Imperative handle
  useImperativeHandle(ref, () => ({
    clear: ta.clear,
    getValue: () => ta.value,
    setValue: ta.setValue,
    setCursor: ta.setCursor,
    getSelection: ta.getSelection,
  }))

  // Click-to-position: map mouse click to cursor offset
  const wrappedLinesRef = useRef<WrappedLine[]>(ta.wrappedLines)
  wrappedLinesRef.current = ta.wrappedLines
  const scrollOffsetRef = useRef(ta.scrollOffset)
  scrollOffsetRef.current = ta.scrollOffset

  const handleMouseDown = useCallback(
    (e: SilveryMouseEvent) => {
      if (e.button !== 0) return
      const rect = e.currentTarget.scrollRect
      if (!rect) return

      const lines = wrappedLinesRef.current
      const scroll = scrollOffsetRef.current

      const relativeY = e.y - rect.y
      const row = relativeY + scroll
      const clampedRow = Math.min(Math.max(0, row), lines.length - 1)
      const wl = lines[clampedRow]
      if (!wl) return

      const relativeX = e.x - rect.x
      const col = Math.min(Math.max(0, relativeX), wl.line.length)
      const offset = Math.min(Math.max(0, wl.startOffset + col), ta.value.length)
      ta.setCursor(offset)
    },
    [ta],
  )

  // =========================================================================
  // Rendering
  // =========================================================================

  const showPlaceholder = !ta.value && placeholder

  const borderProps = borderStyleProp
    ? {
        borderStyle: borderStyleProp as any,
        borderColor: isActive ? focusBorderColor : borderColorProp,
        paddingX: 1 as const,
      }
    : {}

  // Cursor positioning — declared as a Box prop (`cursorOffset`) so the
  // layout phase resolves the absolute terminal coordinates synchronously
  // before the scheduler emits the cursor ANSI. This avoids the React-effect
  // chain that the legacy `useCursor` hook used (`useScrollRect` →
  // `useLayoutEffect` → `setCursorState`), which produced stale-null reads
  // on the very first frame after a conditional mount. See bead
  // `km-silvery.view-as-layout-output` (Phase 2).
  //
  // Border + padding offsets here are intentionally absent — the layout
  // phase pulls them from `borderStyle` / `padding*` on the same Box and
  // applies them automatically (see `computeCursorRect` in
  // `@silvery/ag/layout-signals`). Components only declare the
  // content-area-relative cursor position.
  //
  // Hide hardware cursor when selection is active (cursor is shown as part
  // of selection rendering).
  const cursorOffset = {
    col: ta.cursorCol,
    row: ta.visibleCursorRow,
    visible: isActive && !disabled && !ta.selection,
  }

  if (showPlaceholder) {
    return (
      <Box
        focusable
        testID={testID}
        flexDirection="column"
        height={outerHeight}
        cursorOffset={cursorOffset}
        {...borderProps}
      >
        <Text color="$fg-muted">{placeholder}</Text>
      </Box>
    )
  }

  // The hook hands back `visibleLines` sliced by its own `height` (the
  // upper bound). In content mode we want only `visibleLineCount` rows on
  // screen, so trim down to the resolved viewport size. The slice starts
  // at the same scrollOffset; we just clamp the tail.
  const renderedLines = ta.visibleLines.slice(0, visibleLineCount)

  return (
    <Box
      focusable
      testID={testID}
      key={ta.scrollOffset}
      flexDirection="column"
      height={outerHeight}
      cursorOffset={cursorOffset}
      {...borderProps}
      onMouseDown={handleMouseDown}
    >
      {renderedLines.map((wl, i) => {
        const absoluteRow = ta.scrollOffset + i
        const isCursorRow = absoluteRow === ta.cursorRow
        const lineStart = wl.startOffset
        const lineEnd = lineStart + wl.line.length

        // Check if this line has any selection overlap
        const hasSelectionOnLine =
          ta.selection && lineStart < ta.selection.end && lineEnd > ta.selection.start

        if (disabled) {
          return (
            <Text key={absoluteRow} color="$fg-muted">
              {wl.line || " "}
            </Text>
          )
        }

        if (hasSelectionOnLine) {
          // Compute selection overlap on this line (in line-local coordinates)
          const selStart = Math.max(0, ta.selection!.start - lineStart)
          const selEnd = Math.min(wl.line.length, ta.selection!.end - lineStart)

          const before = wl.line.slice(0, selStart)
          const selected = wl.line.slice(selStart, selEnd)
          const after = wl.line.slice(selEnd)

          return (
            <Text key={absoluteRow} color={bodyColor}>
              {before}
              <Text inverse>
                {selected || (selEnd === wl.line.length && isCursorRow ? " " : "")}
              </Text>
              {after}
            </Text>
          )
        }

        // Inactive + opted-out: render the row plainly with no caret highlight.
        // Composite editors (e.g. queue + command box in silvercode) use this
        // to keep exactly ONE visible caret across two stacked TextAreas.
        if (!isCursorRow || (!isActive && !showInactiveCursor)) {
          return (
            <Text key={absoluteRow} color={bodyColor}>
              {wl.line || " "}
            </Text>
          )
        }

        const beforeCursor = wl.line.slice(0, ta.cursorCol)
        const atCursor = wl.line[ta.cursorCol] ?? " "
        const afterCursor = wl.line.slice(ta.cursorCol + 1)

        // Active: plain text (real cursor handles it). Inactive: fake cursor.
        const cursorEl = isActive ? (
          <Text>{atCursor}</Text>
        ) : cursorStyle === "block" ? (
          <Text inverse>{atCursor}</Text>
        ) : (
          <Text underline>{atCursor}</Text>
        )

        return (
          <Text key={absoluteRow} color={bodyColor}>
            {beforeCursor}
            {cursorEl}
            {afterCursor}
          </Text>
        )
      })}
    </Box>
  )
})
