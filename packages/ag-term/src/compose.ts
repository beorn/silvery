/**
 * Plugin Composition — era2a Phase 5
 *
 * Composable plugins that build an app piece by piece:
 * - create() — base app with dispatch/apply/defer/dispose
 * - withAg() — adds ag (tree + layout + render)
 * - withTerm(term) — adds render/paint wiring
 * - withReact({ view }) — mounts React reconciler
 * - withTest() — adds testing convenience (press, text, locators)
 *
 * @example
 * ```ts
 * // Interactive
 * const app = pipe(create(), withAg(), withTerm(term), withReact({ view: <App /> }))
 * await app.run()
 *
 * // Headless testing
 * const app = pipe(create(), withAg(), withTerm({ cols: 80, rows: 24 }), withReact({ view: <App /> }), withTest())
 * app.press("j")
 * app.text // "Count: 1"
 * ```
 */

import type { AgNode } from "@silvery/ag/types"
import type { TextFrame } from "@silvery/ag/text-frame"
import type { TerminalBuffer } from "./buffer"
import type { Ag } from "./ag"
import { createAg } from "./ag"
import type { Term } from "./ansi/term"
import { outputPhase } from "./pipeline/output-phase"

// =============================================================================
// Base App
// =============================================================================

export interface AppBase {
  /** Dispatch an operation (public entry — reentry guard). */
  dispatch(op: { type: string; [key: string]: unknown }): void
  /** Apply an operation (internal chain — plugins wrap this). */
  apply(op: { type: string; [key: string]: unknown }): void
  /** Register cleanup function (called in reverse order on dispose). */
  defer(fn: () => void): void
  /** Dispose all deferred cleanups. */
  [Symbol.dispose](): void
}

export interface AppWithAg extends AppBase {
  readonly ag: Ag
}

export interface AppWithTerm extends AppWithAg {
  readonly term: Term
  /** Run layout + render + paint. */
  render(): void
  /** Event loop (if term has events). */
  run?(): Promise<void>
}

// =============================================================================
// create() — Base App
// =============================================================================

export function create(): AppBase {
  const deferred: (() => void)[] = []
  let disposed = false

  return {
    dispatch(op) {
      this.apply(op)
    },
    apply(_op) {
      // Base: no-op. Plugins wrap this.
    },
    defer(fn) {
      deferred.push(fn)
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      for (let i = deferred.length - 1; i >= 0; i--) {
        deferred[i]!()
      }
    },
  }
}

// =============================================================================
// pipe() — Function Composition
// =============================================================================

/** Compose plugins left-to-right. Each plugin takes an app and returns an enhanced app. */
export function pipe<T>(initial: T, ...plugins: Array<(app: any) => any>): any {
  return plugins.reduce((app, plugin) => plugin(app), initial)
}

// =============================================================================
// withAg() — Tree + Layout + Render
// =============================================================================

export function withAg(options?: { root?: AgNode; measurer?: import("./unicode").Measurer }) {
  return (app: AppBase): AppWithAg => {
    const root =
      options?.root ??
      ({
        type: "silvery-root" as const,
        props: {},
        children: [],
        parent: null,
        layoutNode: null,
        contentRect: null,
        screenRect: null,
        renderRect: null,
        prevLayout: null,
        prevScreenRect: null,
        prevRenderRect: null,
        layoutChangedThisFrame: false,
        layoutDirty: true,
        contentDirty: true,
        stylePropsDirty: true,
        bgDirty: true,
        subtreeDirty: true,
        childrenDirty: true,
        layoutSubscribers: new Set(),
      } satisfies AgNode)

    const ag = createAg(root, { measurer: options?.measurer })

    return Object.assign(app, { ag }) as AppWithAg
  }
}

// =============================================================================
// withTerm() — I/O + Paint
// =============================================================================

export function withTerm(term: Term) {
  return (app: AppWithAg): AppWithTerm => {
    let prev: TextFrame | undefined
    let prevBuffer: TerminalBuffer | null = null

    const render = () => {
      const state = term.getState()
      app.ag.layout({ cols: state.cols, rows: state.rows })
      const result = app.ag.render()

      // Paint: diff and write output
      if (term.paint) {
        term.paint(result.buffer, prevBuffer)
      } else {
        // Fallback: outputPhase + write
        const output = outputPhase(prevBuffer, result.buffer)
        if (output) term.write(output)
      }

      prevBuffer = result.buffer
      prev = result.frame
    }

    // Event loop (if term has events)
    let runFn: (() => Promise<void>) | undefined
    if (term.events) {
      runFn = async () => {
        render() // Initial render
        for await (const event of term.events()) {
          if (event.type === "resize") {
            prevBuffer = null // Reset diffing
            prev = undefined
            app.ag.resetBuffer()
          }
          app.dispatch({ type: `input:${event.type}`, ...event.data } as any)
          if (event.type === "resize") {
            render() // Resize always re-renders
          }
        }
      }
    }

    return Object.assign(app, {
      term,
      render,
      run: runFn,
    }) as AppWithTerm
  }
}
