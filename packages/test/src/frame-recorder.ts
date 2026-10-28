/**
 * Frame recorder — frame-by-frame cell-level testing for silvery apps.
 *
 * Captures an immutable TextFrame snapshot after each render pass, letting
 * tests iterate render history, diff adjacent frames, and detect transient
 * visual artifacts (e.g., a selection overlay that appears for exactly one
 * frame and then reverts).
 *
 * Works with any Term that writes output through a stdout-like sink. For
 * emulator-backed terms (e.g., `createTermless()`), snapshots read cells
 * directly from the emulator after each write, so colors, attributes, and
 * wide-char layout reflect what the real terminal would display.
 *
 * @example
 * ```tsx
 * import { createTermless, recordFrames } from "@silvery/test"
 * import { run } from "@silvery/ag-term/runtime"
 *
 * test("no flicker on cursor move", async () => {
 *   using term = createTermless({ cols: 80, rows: 24 })
 *   const handle = await run(<App />, term)
 *   const recording = recordFrames(handle)
 *
 *   await handle.press("j")
 *
 *   expect(recording.frames.length).toBeGreaterThan(0)
 *   // Ensure no cell at (10, 5) is painted twice in a single transient way:
 *   expect(
 *     recording.hasTransientChange(
 *       (a, b, c) =>
 *         a.cell(10, 5).bg !== b.cell(10, 5).bg &&
 *         b.cell(10, 5).bg !== c.cell(10, 5).bg,
 *     ),
 *   ).toBe(false)
 * })
 * ```
 */

import type { FrameCell, RGB, TextFrame } from "@silvery/ag/text-frame"
import type { UnderlineStyle } from "@silvery/ag/types"
import type { Term } from "@silvery/ag-term"

// ============================================================================
// Types
// ============================================================================

/**
 * A single cell change between two frames at the same (col, row).
 *
 * `from` and `to` are the cell states in the "before" and "after" frames.
 * Both are always present — to detect appearance/disappearance, compare
 * `char`, `fg`, or `bg` against the blank-cell defaults.
 */
export interface CellChange {
  readonly col: number
  readonly row: number
  readonly from: FrameCell
  readonly to: FrameCell
}

/**
 * A predicate over three consecutive frames. Returns true when the cell at
 * some coordinate changes in frame B and reverts in frame C — the signature
 * of a 1-frame transient flicker.
 */
export type TransientPredicate = (a: TextFrame, b: TextFrame, c: TextFrame) => boolean

/**
 * A live recording of rendered frames.
 *
 * `frames` is an append-only array of immutable TextFrame snapshots. Each
 * entry captures the terminal state after one render pass. Subsequent renders
 * push new entries without mutating existing ones, so tests can safely iterate
 * and diff across history.
 */
export interface FrameRecording {
  /** All captured frames, in render order. */
  readonly frames: readonly TextFrame[]
  /** Convenience: `frames.length`. */
  readonly count: number
  /**
   * Cells that differ between frames `i` and `j`. Returns an empty array when
   * the frames are identical. Size mismatches (frames captured at different
   * terminal dimensions) are diffed over the intersection.
   */
  diff(i: number, j: number): CellChange[]
  /**
   * Scan every 3-frame window for transient changes. Returns true when the
   * predicate fires on any `(frames[i], frames[i+1], frames[i+2])` triple.
   *
   * A transient change is a cell that changes in one frame and reverts in the
   * next — the visual signature of a flicker, stale overlay, or one-frame
   * paint bug.
   */
  hasTransientChange(predicate: TransientPredicate): boolean
  /** Clear all recorded frames. Useful between test phases. */
  clear(): void
  /** Stop recording. Frames already captured remain accessible. */
  stop(): void
}

/**
 * A handle-like object that exposes a Term. Accepted by `recordFrames()` in
 * addition to a bare Term.
 */
export interface FrameRecordable {
  readonly term: Term
}

// ============================================================================
// Blank cell — returned for out-of-bounds queries
// ============================================================================

const BLANK_CELL: FrameCell = Object.freeze({
  char: " ",
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false as UnderlineStyle,
  underlineColor: null,
  overline: false,
  strikethrough: false,
  inverse: false,
  blink: false,
  hidden: false,
  wide: false,
  continuation: false,
  hyperlink: null,
})

// ============================================================================
// Termless → TextFrame snapshot
// ============================================================================

/**
 * Termless emulator shape used by the snapshot helper. Matches the
 * `TermEmulator` duck type from @silvery/ag-term with additional cell access
 * from the underlying termless Terminal.
 */
interface TermlessLike {
  readonly cols: number
  readonly rows: number
  feed(data: Uint8Array | string): void
  cell(row: number, col: number): TermlessCellView
  screen: {
    getText(): string
    getLines(): string[]
  }
}

interface TermlessCellView {
  readonly char: string
  readonly fg: RGB | null
  readonly bg: RGB | null
  readonly bold: boolean
  readonly dim: boolean | null
  readonly italic: boolean | null
  readonly underline: UnderlineStyle
  readonly underlineColor: RGB | null
  readonly overline?: boolean
  readonly strikethrough: boolean | null
  readonly inverse: boolean
  readonly blink: boolean
  readonly hidden: boolean
  readonly wide: boolean
  readonly continuation: boolean
  readonly hyperlink: string | null
}

/**
 * Build an immutable TextFrame snapshot from a termless emulator. Cell values
 * must be copied eagerly: the emulator is mutable, so a lazy `cell()` read
 * would make every historical frame report the terminal's latest style.
 */
function snapshotEmulator(emu: TermlessLike): TextFrame {
  const width = emu.cols
  const height = emu.rows
  const lines = emu.screen.getLines().slice(0, height)
  // Pad to height in case the emulator reports fewer lines than rows.
  while (lines.length < height) lines.push("")
  const text = lines.join("\n")

  const cells: FrameCell[] = []
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const view = emu.cell(row, col)
      cells.push(
        Object.freeze({
          char: view.char,
          fg: view.fg,
          bg: view.bg,
          bold: view.bold,
          dim: view.dim,
          italic: view.italic,
          underline: view.underline,
          underlineColor: view.underlineColor,
          overline: view.overline ?? false,
          strikethrough: view.strikethrough,
          inverse: view.inverse,
          blink: view.blink,
          hidden: view.hidden,
          wide: view.wide,
          continuation: view.continuation,
          hyperlink: view.hyperlink,
        }),
      )
    }
  }

  const frame: TextFrame = {
    get text() {
      return text
    },
    get ansi() {
      // The emulator has already applied ANSI — we don't preserve the raw
      // patch string here. Return plain text; callers needing ANSI should
      // inspect the term's backend directly.
      return text
    },
    get lines() {
      return lines
    },
    width,
    height,
    cell(col: number, row: number): FrameCell {
      if (col < 0 || col >= width || row < 0 || row >= height) return BLANK_CELL
      return cells[row * width + col]!
    },
    containsText(needle: string) {
      return text.includes(needle)
    },
  }
  return frame
}

// ============================================================================
// Diffing
// ============================================================================

function cellsEqual(a: FrameCell, b: FrameCell): boolean {
  if (a.char !== b.char) return false
  if (!rgbEqual(a.fg, b.fg)) return false
  if (!rgbEqual(a.bg, b.bg)) return false
  if (a.bold !== b.bold) return false
  if (a.dim !== b.dim) return false
  if (a.italic !== b.italic) return false
  if (a.underline !== b.underline) return false
  if (!rgbEqual(a.underlineColor, b.underlineColor)) return false
  if (a.overline !== b.overline) return false
  if (a.strikethrough !== b.strikethrough) return false
  if (a.inverse !== b.inverse) return false
  if (a.blink !== b.blink) return false
  if (a.hidden !== b.hidden) return false
  if (a.wide !== b.wide) return false
  if (a.continuation !== b.continuation) return false
  if (a.hyperlink !== b.hyperlink) return false
  return true
}

function rgbEqual(a: RGB | null, b: RGB | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function diffFrames(a: TextFrame, b: TextFrame): CellChange[] {
  const width = Math.min(a.width, b.width)
  const height = Math.min(a.height, b.height)
  const changes: CellChange[] = []
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const from = a.cell(col, row)
      const to = b.cell(col, row)
      if (!cellsEqual(from, to)) {
        changes.push({ col, row, from, to })
      }
    }
  }
  return changes
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start recording frames from a Term (or any object exposing `.term`).
 *
 * The recorder observes the emulator's ANSI feed so that every render patch
 * triggers a fresh TextFrame snapshot. Only calls made AFTER `recordFrames()`
 * returns are captured — the initial render is not retroactively recorded.
 * Call `recording.stop()` to end recording early.
 *
 * For emulator-backed terms created via `createTermless()`, snapshots reflect
 * the real terminal state including resolved colors and wide characters. For
 * other Term types, this function throws — cell-level recording requires an
 * emulator.
 */
export function recordFrames(target: Term | FrameRecordable): FrameRecording {
  const term = isFrameRecordable(target) ? target.term : target
  const emulator = getEmulator(term)
  if (!emulator) {
    throw new Error(
      "recordFrames(): term has no emulator backend. " +
        "Use createTermless() to create an emulator-backed Term for frame recording.",
    )
  }

  const frames: TextFrame[] = []
  let stopped = false

  // run() writes ANSI patches straight to the emulator; it does not call the
  // legacy Term.paint() helper. Observe that production output boundary so a
  // recorder attached either before or after run() sees every live repaint.
  // createTermless already wraps feed() for clipboard capture, so preserve and
  // call the current wrapper rather than reaching through to a raw stream.
  const originalFeed = emulator.feed
  const recordingFeed = function (this: TermlessLike, data: Uint8Array | string): void {
    originalFeed.call(this, data)
    // The emulator has just been fed (synchronously) — snapshot its state.
    // Snapshot errors must fail the test instead of silently dropping proof.
    if (!stopped) frames.push(snapshotEmulator(emulator))
  }
  emulator.feed = recordingFeed

  const recording: FrameRecording = {
    get frames() {
      return frames
    },
    get count() {
      return frames.length
    },
    diff(i: number, j: number): CellChange[] {
      const a = frames[i]
      const b = frames[j]
      if (!a || !b) return []
      return diffFrames(a, b)
    },
    hasTransientChange(predicate: TransientPredicate): boolean {
      for (let i = 0; i + 2 < frames.length; i++) {
        if (predicate(frames[i]!, frames[i + 1]!, frames[i + 2]!)) return true
      }
      return false
    },
    clear() {
      frames.length = 0
    },
    stop() {
      if (stopped) return
      stopped = true
      if (emulator.feed === recordingFeed) emulator.feed = originalFeed
    },
  }

  return recording
}

// ============================================================================
// Helpers
// ============================================================================

function isFrameRecordable(value: unknown): value is FrameRecordable {
  if (value === null || typeof value !== "object") return false
  const maybe = value as { term?: unknown }
  // Term is a Proxy wrapping a function (chalk-style), so typeof term is
  // "function", not "object". Accept both.
  if (maybe.term == null) return false
  const t = typeof maybe.term
  return t === "object" || t === "function"
}

function getEmulator(term: Term): TermlessLike | null {
  const withEmu = term as unknown as { _emulator?: unknown }
  const emu = withEmu._emulator
  // Emulator is a plain factory object — typeof should be "object".
  if (emu == null) return null
  const t = typeof emu
  if (t !== "object" && t !== "function") return null
  const candidate = emu as Record<string, unknown>
  if (typeof candidate.cols !== "number") return null
  if (typeof candidate.rows !== "number") return null
  if (typeof candidate.cell !== "function") return null
  if (candidate.screen == null) return null
  return emu as TermlessLike
}
