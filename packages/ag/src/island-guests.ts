/**
 * Silvery built-in IslandGuest implementations.
 *
 * Layer-3 of the islands stack — concrete {@link IslandGuest} instances the
 * host can mount. Built-ins ship inside `@silvery/ag` so the cost-to-use is
 * one import. Heavier guests (PTY child, replay player, embedded silvery
 * sub-instance) live in their own packages — `@silvery/island-pty`,
 * `@silvery/island-replay`, etc — to keep the core package dependency-tight.
 *
 * Current built-ins:
 *
 * - `snapshotGuest(buffer | dims, options?)` — wraps a pre-built `CellBuffer`
 *   as a no-input no-modes-no-signals guest. The buffer's contents paint at
 *   each frame, mutations show up incrementally, but the host neither routes
 *   input to it nor mirrors any of its mode requests. Useful for tests,
 *   static demos, frozen frames, GIF rendering, sandbox composition.
 *
 * Future built-ins (planned, not yet shipped — see `@km/silvery/15646-islands`):
 *
 * - `sandbox(inner)` — wraps any other guest and neutralizes the 8 query
 *   families (OSC 4/10/11 + DSR 5/6 + DA1/2 + window title) so the inner
 *   guest can't probe the host terminal. The interim termless `rec --live-
 *   chrome=none` flip exists because the silvery overlay didn't have this;
 *   Phase 3 rec adoption replaces the chrome-overlay path with
 *   `<Island guest={sandbox(ptyGuest(...))}>`.
 * - `replayGuest(asciicast)` — plays an asciicast (.cast) file frame-by-frame.
 */

import type { CellBuffer } from "./viewport-types"
import { createCellBuffer, type MutableCellBuffer } from "./viewport-buffer"
import type { Cell } from "./types"
import type {
  IslandContext,
  IslandGuest,
  IslandHandle,
  IslandOutputOwner,
  IslandSignal,
  IslandSizeOwner,
} from "./island-types"

// ============================================================================
// snapshotGuest
// ============================================================================

/**
 * Options for {@link snapshotGuest}.
 */
export interface SnapshotGuestOptions {
  /**
   * If provided, the snapshot is built from this buffer directly. The guest
   * keeps a reference to the buffer; mutations the caller makes (via
   * MutableCellBuffer.setCell) flow into the island's next render frame.
   *
   * Mutually exclusive with `cells`.
   */
  buffer?: CellBuffer | MutableCellBuffer
  /**
   * If provided, the snapshot is built by filling a new buffer with this
   * cell-grid layout. `cells[row][col]` is the cell at that position.
   * Out-of-grid cells default to the empty cell (space, no styling).
   *
   * Mutually exclusive with `buffer`.
   */
  cells?: ReadonlyArray<ReadonlyArray<Cell | string>>
  /**
   * Explicit cols × rows. If both `buffer` and `cells` are omitted, the guest
   * creates an empty buffer at these dimensions (useful when the caller plans
   * to populate via the returned handle's IslandOutputOwner.writeCells).
   */
  cols?: number
  rows?: number
}

/**
 * The handle returned by a snapshotGuest after `init()` — augments the base
 * {@link IslandHandle} with a `setBuffer()` escape hatch for swap-the-whole-
 * frame use cases (GIF playback, scrub-to-frame).
 */
export interface SnapshotGuestHandle extends IslandHandle {
  /**
   * Replace the guest's buffer entirely. Notifies subscribers so the host
   * re-blits on the next frame. The new buffer's dimensions must match the
   * island's current `cols × rows` (resize the island via the host first if
   * dims change — see `IslandSizeOwner.requestResize`).
   */
  setBuffer(buffer: CellBuffer): void
}

/**
 * Build a snapshot-style {@link IslandGuest}.
 *
 * Three input modes:
 *   - Pre-built buffer:  `snapshotGuest({ buffer })`
 *   - Cell-grid literal: `snapshotGuest({ cells: [[cell, cell], [cell, cell]] })`
 *   - Empty dims:        `snapshotGuest({ cols: 80, rows: 24 })`
 *
 * The guest exposes no input, no modes, no signals — it's pure cell content.
 * Capabilities = `{}` (host won't try to route input or surface mode requests).
 *
 * The returned guest's `init()` is synchronous internally; the factory's
 * `Promise.resolve()` hop still applies (per the /pro-decided contract that
 * `init()` returns Promise externally).
 *
 * @example
 * ```ts
 * const guest = snapshotGuest({ cols: 80, rows: 24 })
 * <Island guest={guest} cols={80} rows={24} />
 * // Later: mutate the buffer to update the displayed frame.
 * const handle = (await guest.init(ctx)) as SnapshotGuestHandle
 * handle.output.buffer.setCell(0, 0, { char: "X", fg: null, bg: null, ... })
 * handle.output.invalidateAll()  // trigger re-blit on next frame
 * ```
 */
export function snapshotGuest(options: SnapshotGuestOptions): IslandGuest {
  const buffer = resolveBuffer(options)
  return {
    // Snapshot guests declare no capabilities — host never routes input,
    // never surfaces mode requests, never asks for resize ack (the buffer
    // dimensions are fixed at construction; resize requires building a new
    // guest with the new dims).
    capabilities: undefined,
    async init(ctx) {
      const cols = buffer.cols
      const rows = buffer.rows
      const subscribers = new Set<() => void>()

      const size: IslandSizeOwner = {
        get cols() {
          return cols
        },
        get rows() {
          return rows
        },
        subscribe(listener: (size: { cols: number; rows: number }) => void): () => void {
          // Snapshot guest never resizes — return a no-op unsubscriber.
          // The host may call requestResize, but the guest ignores it; the
          // host reads cols/rows back and finds them unchanged.
          void listener
          return () => {}
        },
        requestResize(_nextCols: number, _nextRows: number): void {
          // Ignore. The guest's buffer dimensions are immutable; the host's
          // attempt to resize is recorded but produces no acknowledgement.
        },
      }

      let activeBuffer = buffer

      const output: IslandOutputOwner = {
        get buffer() {
          return activeBuffer
        },
        cursor: null,
        cursorVisible: false,
        subscribe(listener: () => void): () => void {
          subscribers.add(listener)
          return () => {
            subscribers.delete(listener)
          }
        },
        writeCells(): void {
          // No-op for snapshot — the caller is expected to mutate the
          // underlying MutableCellBuffer directly. The convenience of a
          // writeCells delta API isn't useful here.
        },
        invalidateAll(): void {
          for (const cb of subscribers) cb()
        },
      }

      // Snapshot guests don't really have a meaningful "ready" lifecycle —
      // the buffer is populated at construction. We still emit `ready` so
      // observers get the normal lifecycle signal.
      ctx.emit({ type: "ready" } satisfies IslandSignal)

      const handle: SnapshotGuestHandle = {
        size,
        output,
        dispose() {
          // Drop subscribers so the host's last-frame paint doesn't leak
          // into a later render cycle.
          subscribers.clear()
        },
        setBuffer(next: CellBuffer): void {
          if (next.cols !== activeBuffer.cols || next.rows !== activeBuffer.rows) {
            throw new Error(
              `snapshotGuest: setBuffer dims mismatch — current ${activeBuffer.cols}×${activeBuffer.rows}, ` +
                `new ${next.cols}×${next.rows}. Build a new guest for different dims.`,
            )
          }
          activeBuffer = next
          for (const cb of subscribers) cb()
        },
      }
      return handle
    },
  }
}

// ============================================================================
// Internal — resolve options to a CellBuffer
// ============================================================================

function resolveBuffer(options: SnapshotGuestOptions): CellBuffer | MutableCellBuffer {
  const { buffer, cells, cols, rows } = options
  // Reject the impossible combinations early — the type system can't fully
  // express "exactly one of {buffer, cells, dims-only}" but we can catch it
  // at runtime with a clear message.
  const provided = [buffer, cells].filter((x) => x != null).length
  if (provided > 1) {
    throw new Error("snapshotGuest: pass at most one of `buffer` or `cells`.")
  }

  if (buffer) return buffer
  if (cells) return buildBufferFromCells(cells, cols, rows)

  // dims-only path
  if (cols == null || rows == null) {
    throw new Error("snapshotGuest: requires one of `buffer`, `cells`, or both `cols`+`rows`.")
  }
  return createCellBuffer(cols, rows)
}

function buildBufferFromCells(
  cells: ReadonlyArray<ReadonlyArray<Cell | string>>,
  colsOverride?: number,
  rowsOverride?: number,
): MutableCellBuffer {
  const rows = rowsOverride ?? cells.length
  const cols = colsOverride ?? cells[0]?.length ?? 0
  const buf = createCellBuffer(cols, rows)
  for (let r = 0; r < rows && r < cells.length; r++) {
    const row = cells[r]
    if (!row) continue
    for (let c = 0; c < cols && c < row.length; c++) {
      const entry = row[c]
      if (entry === undefined) continue
      buf.setCell(c, r, typeof entry === "string" ? makeStringCell(entry) : entry)
    }
  }
  return buf
}

function makeStringCell(char: string): Cell {
  return {
    char,
    fg: null,
    bg: null,
    attrs: {},
    wide: false,
    continuation: false,
  }
}

// ============================================================================
// sandbox(inner) wrapper
// ============================================================================

/**
 * Options for {@link sandbox}.
 */
export interface SandboxOptions {
  /**
   * Background color the sandbox returns for OSC 11 ; ? (background) queries.
   * Default: `"#000000"` (black). Use the host theme's resolved bg here when
   * you want the guest's color detection to agree with the rest of the app.
   *
   * Format: any silvery-acceptable color string (`"#rrggbb"`, `"rgb:..."`,
   * a token like `"$bg-surface"` after resolution).
   */
  background?: string
  /** Foreground color for OSC 10 ; ? queries. Default: `"#cccccc"`. */
  foreground?: string
  /**
   * Optional 16-color ANSI map (palette indices 0..15) for OSC 4 ; <idx> ; ?
   * queries. When omitted, sandbox returns the canonical xterm-256 base16
   * palette so guests see a sane color world even though the host's real
   * palette is hidden.
   */
  ansi16?: readonly string[]
  /**
   * Window title returned for OSC 21 (icon name) / OSC 2 (window title) /
   * `\x1b[21t` queries. Default: `""` (empty — guests detect "no title set").
   */
  windowTitle?: string
}

/**
 * Wrap any {@link IslandGuest} in a sandbox that neutralizes the 8 query
 * families documented in `@km/silvery/15646-islands`:
 *
 * - **OSC 4 ; idx ; ?**   — palette color (index 0..255)
 * - **OSC 10 ; ?**        — default foreground color
 * - **OSC 11 ; ?**        — default background color
 * - **DSR 5**             — device status report (`\x1b[5n`)
 * - **DSR 6**             — cursor position report (`\x1b[6n`)
 * - **DA1**               — primary device attributes (`\x1b[c`)
 * - **DA2**               — secondary device attributes (`\x1b[>c`)
 * - **Window title query** — `\x1b[21t`, `\x1b]2;?\x07`, `\x1b]21;?\x07`
 *
 * The wrapper intercepts the inner guest's calls to
 * {@link IslandContext.execOSC}. Recognized queries get canned responses
 * (sourced from `SandboxOptions` or sensible defaults); unrecognized
 * sequences pass through to the host's real `execOSC` so the guest still
 * has access to host-fulfilled OS side-effects it depends on (clipboard
 * write via OSC 52 stays functional).
 *
 * Why: the interim termless `--live-chrome=none` flip exists because the
 * silvery overlay didn't have this. Phase 3 rec adoption replaces the
 * chrome-overlay path with `<Island guest={sandbox(ptyGuest(...))}>`; the
 * sandbox absorbs the recorded program's queries so the host terminal
 * never echoes responses into the recorded grid.
 *
 * @example
 * ```ts
 * const guest = sandbox(ptyGuest({ cmd: ["nvim"] }), {
 *   background: theme.bg,     // align with host's resolved theme
 *   foreground: theme.fg,
 * })
 * <Island guest={guest} cols={120} rows={40} focusable />
 * ```
 */
export function sandbox(inner: IslandGuest, options: SandboxOptions = {}): IslandGuest {
  return {
    // Pass through the inner guest's capabilities verbatim — sandbox is a
    // query-neutralization wrapper, not a capability gate. The host applies
    // capability intersection with per-island overrides as usual.
    capabilities: inner.capabilities,
    async init(ctx) {
      const wrappedCtx: IslandContext = {
        cols: ctx.cols,
        rows: ctx.rows,
        emit: ctx.emit.bind(ctx),
        requestResize: ctx.requestResize.bind(ctx),
        async execOSC(command: string): Promise<string | void> {
          const synthetic = synthesizeOSCResponse(command, options)
          if (synthetic !== undefined) return synthetic
          // Unknown sequence — pass through to host (e.g. OSC 52 clipboard).
          return ctx.execOSC(command)
        },
        abortSignal: ctx.abortSignal,
        now: ctx.now.bind(ctx),
      }
      return inner.init(wrappedCtx)
    },
  }
}

// ============================================================================
// Internal — synthesize canned responses for the 8 query families
// ============================================================================

const XTERM_BASE16: readonly string[] = [
  "#000000",
  "#cd0000",
  "#00cd00",
  "#cdcd00",
  "#0000ee",
  "#cd00cd",
  "#00cdcd",
  "#e5e5e5",
  "#7f7f7f",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#5c5cff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
]

/**
 * Recognize and respond to one of the 8 sandboxed query families. Returns
 * the synthetic response (ANSI escape sequence) or `undefined` if the
 * command isn't a recognized query — caller should fall through to the
 * host's real execOSC for unknown sequences (OSC 52 clipboard, etc).
 *
 * Response format mirrors what a real terminal would emit so the guest's
 * parser handles it without special-casing the sandbox.
 */
export function synthesizeOSCResponse(
  command: string,
  options: SandboxOptions = {},
): string | undefined {
  // OSC 4 ; idx ; ? — palette query
  const osc4 = command.match(/^\x1b\]4;(\d+);\?(\x07|\x1b\\)$/)
  if (osc4) {
    const idx = Number(osc4[1])
    const palette = options.ansi16 ?? XTERM_BASE16
    const color = palette[idx] ?? options.background ?? "#000000"
    return `\x1b]4;${idx};rgb:${hexToRgbColon(color)}\x07`
  }

  // OSC 10 ; ? — foreground
  if (/^\x1b\]10;\?(\x07|\x1b\\)$/.test(command)) {
    return `\x1b]10;rgb:${hexToRgbColon(options.foreground ?? "#cccccc")}\x07`
  }

  // OSC 11 ; ? — background
  if (/^\x1b\]11;\?(\x07|\x1b\\)$/.test(command)) {
    return `\x1b]11;rgb:${hexToRgbColon(options.background ?? "#000000")}\x07`
  }

  // DSR 5 — device status. Real terminals respond "0" (OK). `\x1b[0n` is
  // the canonical OK response.
  if (command === "\x1b[5n") {
    return "\x1b[0n"
  }

  // DSR 6 — cursor position. Canned: row 1, col 1 (top-left). The guest
  // doesn't actually need a meaningful answer; this just keeps probe-
  // protocols from hanging.
  if (command === "\x1b[6n") {
    return "\x1b[1;1R"
  }

  // DA1 — primary device attributes (\x1b[c, \x1b[0c). Respond as VT220
  // with 132-column mode + ANSI color (the canonical baseline most guests
  // accept).
  if (command === "\x1b[c" || command === "\x1b[0c") {
    return "\x1b[?62;1;6c"
  }

  // DA2 — secondary device attributes (\x1b[>c, \x1b[>0c). Respond as
  // xterm version 0 (the most generic possible answer; nothing in the
  // ecosystem depends on the patch level field).
  if (command === "\x1b[>c" || command === "\x1b[>0c") {
    return "\x1b[>0;0;0c"
  }

  // Window title query — OSC 21 (icon name) / OSC 2 (title) / CSI 21t.
  if (command === "\x1b[21t" || /^\x1b\]2(1)?;\?(\x07|\x1b\\)$/.test(command)) {
    return `\x1b]l${options.windowTitle ?? ""}\x1b\\`
  }

  return undefined
}

function hexToRgbColon(hex: string): string {
  // Convert `"#rrggbb"` → `"rrrr/gggg/bbbb"` (xterm canonical OSC response).
  // Real terminals return 4-digit hex per channel; we duplicate the 2-digit
  // values for compatibility with guests that strictly parse the format.
  const m = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)
  if (!m) return "0000/0000/0000"
  return `${m[1]}${m[1]}/${m[2]}${m[2]}/${m[3]}${m[3]}`
}
