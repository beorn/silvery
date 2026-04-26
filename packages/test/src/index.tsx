/**
 * Silvery Testing Library
 *
 * Unified App-based API for testing Silvery components.
 * Uses the actual silvery render pipeline for accurate ANSI output.
 *
 * ## Import Syntax
 *
 * ```tsx
 * import { createRenderer, bufferToText, stripAnsi } from '@silvery/test';
 * ```
 *
 * ## Auto-cleanup
 *
 * Each render() call from createRenderer automatically unmounts the previous render,
 * so you don't need explicit cleanup.
 *
 * ## Basic Testing
 *
 * @example
 * ```tsx
 * import { createRenderer } from '@silvery/test';
 * import { Text, Box } from '@silvery/ag-react';
 *
 * const render = createRenderer({ cols: 80, rows: 24 });
 *
 * test('renders text', () => {
 *   const app = render(<Text>Hello</Text>);
 *
 *   // Plain text (no ANSI)
 *   expect(app.text).toContain('Hello');
 *
 *   // Auto-refreshing locators
 *   expect(app.getByText('Hello').count()).toBe(1);
 * });
 * ```
 *
 * ## Keyboard Input Testing
 *
 * @example
 * ```tsx
 * test('handles keyboard', () => {
 *   const app = render(<MyComponent />);
 *
 *   await app.press('j');           // Letter key
 *   await app.press('ArrowUp');     // Arrow keys
 *   await app.press('Escape');      // Special keys
 *   await app.press('Enter');       // Enter
 *
 *   expect(app.text).toContain('expected result');
 * });
 * ```
 *
 * ## Auto-refreshing Locators
 *
 * @example
 * ```tsx
 * test('locators auto-refresh', () => {
 *   const app = render(<Board />);
 *   const cursor = app.locator('[data-cursor]');
 *
 *   expect(cursor.textContent()).toBe('item1');
 *   await app.press('j');
 *   expect(cursor.textContent()).toBe('item2');  // Same locator, fresh result!
 * });
 * ```
 *
 * ## Querying by ID
 *
 * Two equivalent approaches for identifying components:
 *
 * @example
 * ```tsx
 * // Option 1: id prop with #id selector (CSS-style, preferred)
 * const app = render(<Box id="sidebar">Content</Box>);
 * expect(app.locator('#sidebar').textContent()).toBe('Content');
 *
 * // Option 2: testID prop with getByTestId (React Testing Library style)
 * const app = render(<Box testID="sidebar">Content</Box>);
 * expect(app.getByTestId('sidebar').textContent()).toBe('Content');
 * ```
 */

import { ensureDefaultLayoutEngine } from "@silvery/ag-term/layout-engine"

// Re-export App for type usage
export type { App } from "@silvery/ag-term/app"
export { createAutoLocator, type AutoLocator, type FilterOptions } from "./auto-locator"
export type { BoundTerm } from "@silvery/ag-term/bound-term"

// Re-export buffer utilities for testing convenience
export { bufferToText, bufferToStyledText, bufferToHTML } from "@silvery/ag-term/buffer"
export type { TerminalBuffer } from "@silvery/ag-term/buffer"

export type { Rect } from "@silvery/ag/types"

// Re-export keyboard utilities
export { keyToAnsi, keyToKittyAnsi, CODE_TO_KEY } from "@silvery/ag/keys"

// Re-export debug utilities
export { debugTree, type DebugTreeOptions } from "./debug"

// Re-export buffer comparison utilities
export { compareBuffers, formatMismatch, type BufferMismatch } from "./compare-buffers"

// Re-export render API
export {
  render,
  createRenderer,
  createStore,
  run,
  ensureEngine,
  getActiveRenderCount,
  type RenderOptions,
  type PerRenderOptions,
  type Store,
  type StoreOptions,
} from "@silvery/ag-term/renderer"

// ============================================================================
// Module Initialization
// ============================================================================

// Configure React to recognize this as a testing environment for act() support
// This suppresses the "testing environment not configured" warning
// @ts-expect-error - React internal flag for testing environments
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Initialize default layout engine via top-level await.
// This ensures render()/createRenderer() work immediately after import.
await ensureDefaultLayoutEngine()

// ============================================================================
// Termless — in-process terminal emulation for full ANSI testing
// ============================================================================

import { createTerm, type Term, type TerminalCaps } from "@silvery/ag-term"
import { warnOnce } from "@silvery/ansi"

/**
 * Live-termless tracker. Each `createTermless()` registers a WeakRef to the
 * returned Term; when the Term is disposed (Symbol.dispose → emulator.close
 * → backend.destroy → xterm Terminal.dispose), the GC eventually clears the
 * ref. A large number of live un-disposed terminals typically means a test
 * forgot to use `using term = createTermless(...)` — the xterm Terminal
 * (1000-line scrollback buffer) stays resident until the worker exits.
 *
 * See bead km-silvery.termless-memleak.
 */
const liveTermlessInstances = new Set<WeakRef<Term>>()

/** Tunable guard threshold — print a warning when we exceed this many live Terms. */
const TERMLESS_LEAK_WARN_THRESHOLD = 128

/** Warning ID for the shared warnOnce latch. */
const TERMLESS_LEAK_WARNING_ID = "silvery/test:termless-leak"

/**
 * Prune GC'd entries from the tracker and return the count of still-live
 * instances. Cheap O(n) scan; n is small in practice.
 */
function pruneLiveTermless(): number {
  let live = 0
  for (const ref of liveTermlessInstances) {
    if (ref.deref() === undefined) {
      liveTermlessInstances.delete(ref)
    } else {
      live++
    }
  }
  return live
}

/**
 * Return the current count of live (un-GC'd) termless Term instances.
 * Exported for tests that want to assert cleanup happened.
 */
export function getActiveTermlessCount(): number {
  return pruneLiveTermless()
}

// ============================================================================
// Mouse + clipboard ergonomic surface
//
// `createTermless()` returns a Term augmented with `.mouse` and `.clipboard`.
// These remove the need for hand-rolled SGR byte strings and `(term as any)`
// casts in tests — the first-class ergonomic API for mouse interactions.
//
// Tracking bead: km-silvery.expose-termless-mouse.
// ============================================================================

/** Modifier keys for synthetic mouse events (matches termless MouseModifiers). */
export interface TermlessMouseModifiers {
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

/** Options for a mouse event (button + modifiers). */
export interface TermlessMouseOptions extends TermlessMouseModifiers {
  /** 0=left (default), 1=middle, 2=right */
  button?: 0 | 1 | 2
}

/** Pixel-coordinate pair, 0-indexed. */
export type TermlessPoint = [x: number, y: number]

export interface TermlessMouse {
  /** Fire a mousedown (press only — no release). */
  down(x: number, y: number, options?: TermlessMouseOptions): Promise<void>
  /** Fire a mouseup (release only — no press). */
  up(x: number, y: number, options?: TermlessMouseOptions): Promise<void>
  /** Fire a mouse move to (x,y). Stateless — no press implied. */
  move(x: number, y: number, options?: TermlessMouseOptions): Promise<void>
  /** Down then up at the same coordinate — a plain click, no drag. */
  click(x: number, y: number, options?: TermlessMouseOptions): Promise<void>
  /** Two consecutive clicks at the same coordinate. */
  dblclick(x: number, y: number, options?: TermlessMouseOptions): Promise<void>
  /**
   * Drag from one cell to another with N intermediate moves. Dispatches
   * `down(from)` → `move(...via)` → `move(to)` → `up(to)`. Waits briefly
   * between steps so the event loop can process each before the next.
   *
   * @example drag(from: [5, 2], to: [20, 2]) // simple drag
   * @example drag(from: [10, 0], to: [5, 0], via: [[20, 0]]) // forward then shrink back
   */
  drag(opts: {
    from: TermlessPoint
    to: TermlessPoint
    via?: TermlessPoint[]
    options?: TermlessMouseOptions
    /** ms between dispatch steps. Default: 20 */
    stepDelay?: number
  }): Promise<void>
  /** Fire a mouse wheel event at (x,y). Positive delta = scroll down. */
  wheel(x: number, y: number, delta: number): Promise<void>
}

/** OSC 52 clipboard capture — every clipboard write during the Term's life. */
export interface TermlessClipboard {
  /** Last OSC 52 payload captured, or null if none. */
  readonly last: string | null
  /** All OSC 52 payloads captured, in order. */
  readonly all: readonly string[]
  /** Drop all captured payloads (useful between test phases). */
  clear(): void
}

/**
 * Term augmented with mouse + clipboard test helpers.
 *
 * `createTermless()` always returns an emulator-backed term, so `screen`,
 * `scrollback`, and `cell()` are guaranteed defined here (the `Term`
 * interface marks them optional because non-emulator-backed Terms — Node
 * stdout, headless — don't have them). Narrowing them to required removes
 * the need for `!` non-null assertions at every test callsite.
 */
export interface TermlessTerm extends Term {
  readonly mouse: TermlessMouse
  readonly clipboard: TermlessClipboard
  readonly screen: NonNullable<Term["screen"]>
  readonly scrollback: NonNullable<Term["scrollback"]>
  cell(
    row: number,
    col: number,
  ): { readonly fg: unknown; readonly bg: unknown; readonly char: string }
}

/** Default sleep between steps in `drag()`. Short enough to be fast, long
 * enough for async event dispatch to flush. */
const DEFAULT_DRAG_STEP_DELAY_MS = 20

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function sgrButtonByte(options?: TermlessMouseOptions): number {
  let btn = options?.button ?? 0
  if (options?.shift) btn += 4
  if (options?.alt) btn += 8
  if (options?.ctrl) btn += 16
  return btn
}

/**
 * Create a Term backed by a termless xterm.js emulator for full ANSI testing.
 *
 * Convenience wrapper around `createTerm(createXtermBackend(), dims)` that
 * handles the xterm.js backend import. Use with `run()` to render components
 * into a real terminal emulator in-process — no PTY, no timing issues.
 *
 * The returned Term exposes two testing conveniences:
 * - `term.mouse.*` — ergonomic mouse API (click, drag, down/up/move, wheel)
 * - `term.clipboard` — OSC 52 capture (`term.clipboard.last`, `.all`)
 *
 * **Always dispose with `using` or an explicit `term[Symbol.dispose]()`.**
 * Without disposal, each call leaks the xterm.js Terminal (~1 MB scrollback
 * per instance). This accumulated to 18-28 GB per vitest worker in CI before
 * `km-silvery.termless-memleak` was fixed.
 *
 * @example Mouse drag + clipboard capture
 * ```tsx
 * using term = createTermless({ cols: 40, rows: 10 })
 * const handle = await run(<App />, term, { selection: true, mouse: true })
 *
 * await term.mouse.drag({ from: [5, 2], to: [20, 2] })
 * expect(term.clipboard.last).toContain("selected text")
 * ```
 *
 * @example Plain click
 * ```tsx
 * await term.mouse.click(10, 5)
 * await term.mouse.click(10, 5, { shift: true })
 * ```
 *
 * @example Override capabilities (defaults-contract tests)
 * ```tsx
 * using term = createTermless({ cols: 80, rows: 24, caps: { colorLevel: '256' } })
 * ```
 *
 * Without a `caps` override, `term.caps` is populated from `defaultCaps()`
 * (truecolor / unicode / mouse). Callers that want a specific terminal
 * profile for a test — Apple_Terminal's lack of `maybeWideEmojis`, Kitty's
 * `kittyKeyboard`, etc. — can pass a `Partial<TerminalCaps>` here.
 */
export function createTermless(
  dims: { cols: number; rows: number; caps?: Partial<TerminalCaps> } = {
    cols: 80,
    rows: 24,
  },
): TermlessTerm {
  // Lazy import — only loads xterm.js when createTermless is called
  const { createXtermBackend } = require("@termless/xtermjs") as {
    createXtermBackend: () => import("@silvery/ag-term").TermEmulatorBackend
  }
  const term = createTerm(createXtermBackend(), dims)

  // Track this instance for leak detection
  liveTermlessInstances.add(new WeakRef(term))
  const live = pruneLiveTermless()
  if (live >= TERMLESS_LEAK_WARN_THRESHOLD) {
    warnOnce(TERMLESS_LEAK_WARNING_ID, () => {
      // eslint-disable-next-line no-console
      console.warn(
        `[silvery/test] ${live} live termless Term instances detected — likely a test forgot ` +
          "to use `using term = createTermless(...)`. Each un-disposed Term retains an " +
          "xterm.js Terminal with ~1 MB scrollback. See bead km-silvery.termless-memleak.",
      )
    })
  }

  // --- Mouse surface ---
  // Synthetic SGR (mode 1006) mouse injection, delegated to `sendInput` on the
  // underlying Term. Coordinates are 0-indexed (matches silvery's internal
  // convention); the SGR byte format is 1-indexed so we add 1 when writing.
  const sendInput = (data: string) => {
    ;(term as unknown as { sendInput: (s: string) => void }).sendInput(data)
  }

  const mouse: TermlessMouse = {
    async down(x, y, options) {
      const btn = sgrButtonByte(options)
      sendInput(`\x1b[<${btn};${x + 1};${y + 1}M`)
      await Promise.resolve()
    },
    async up(x, y, options) {
      const btn = sgrButtonByte(options)
      sendInput(`\x1b[<${btn};${x + 1};${y + 1}m`)
      await Promise.resolve()
    },
    async move(x, y, options) {
      const btn = 32 + sgrButtonByte(options)
      sendInput(`\x1b[<${btn};${x + 1};${y + 1}M`)
      await Promise.resolve()
    },
    async click(x, y, options) {
      await mouse.down(x, y, options)
      await mouse.up(x, y, options)
    },
    async dblclick(x, y, options) {
      await mouse.click(x, y, options)
      await mouse.click(x, y, options)
    },
    async drag({ from, to, via, options, stepDelay = DEFAULT_DRAG_STEP_DELAY_MS }) {
      await mouse.down(from[0], from[1], options)
      await sleep(stepDelay)
      if (via) {
        for (const [x, y] of via) {
          await mouse.move(x, y, options)
          await sleep(stepDelay)
        }
      }
      await mouse.move(to[0], to[1], options)
      await sleep(stepDelay)
      await mouse.up(to[0], to[1], options)
    },
    async wheel(x, y, delta) {
      // SGR wheel: button 64 = up (delta < 0), 65 = down (delta > 0).
      const raw = delta < 0 ? 64 : 65
      const count = Math.abs(delta) || 1
      for (let i = 0; i < count; i++) {
        sendInput(`\x1b[<${raw};${x + 1};${y + 1}M`)
      }
      await Promise.resolve()
    },
  }

  // --- Clipboard capture (OSC 52) ---
  // Every OSC 52 write eventually reaches the emulator via emulator.feed
  // (termless runs inside the host process — the mock stdout forwards writes
  // to the emulator). We wrap feed() to extract the payloads.
  const clipboardPayloads: string[] = []
  const emulator = (term as unknown as { _emulator?: { feed: (s: string) => void } })._emulator
  if (emulator) {
    const origFeed = emulator.feed.bind(emulator)
    const OSC52_RE = /\x1b\]52;c;([A-Za-z0-9+/=]*)\x07/g
    emulator.feed = (data: string) => {
      OSC52_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = OSC52_RE.exec(data)) !== null) {
        try {
          const decoded = globalThis.Buffer.from(match[1]!, "base64").toString("utf-8")
          clipboardPayloads.push(decoded)
        } catch {
          // ignore malformed base64 — shouldn't happen in practice
        }
      }
      origFeed(data)
    }
  }

  const clipboard: TermlessClipboard = {
    get last() {
      return clipboardPayloads.length > 0 ? clipboardPayloads[clipboardPayloads.length - 1]! : null
    },
    get all() {
      return clipboardPayloads
    },
    clear() {
      clipboardPayloads.length = 0
    },
  }

  Object.defineProperty(term, "mouse", { value: mouse, enumerable: true })
  Object.defineProperty(term, "clipboard", { value: clipboard, enumerable: true })

  return term as TermlessTerm
}

// ============================================================================
// Utility Functions
// ============================================================================

// Re-export stripAnsi from unicode.ts (canonical implementation)
import { stripAnsi } from "@silvery/ag-term/unicode"
export { stripAnsi } from "@silvery/ag-term/unicode"

/**
 * Normalize frame output for comparison.
 * - Strips ANSI codes
 * - Trims trailing whitespace from lines
 * - Removes empty trailing lines
 */
export function normalizeFrame(frame: string): string {
  return stripAnsi(frame)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()
}

/**
 * Wait for a condition to be true, polling at intervals.
 * Useful for waiting for async state updates.
 */
export async function waitFor(
  condition: () => boolean,
  { timeout = 1000, interval = 10 } = {},
): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`)
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, interval)
    })
  }
}
