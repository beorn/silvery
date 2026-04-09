/**
 * Plugin Composition — era2a
 *
 * Composable plugins that build an app piece by piece:
 * - create() — base app with dispatch/apply/defer/dispose
 * - pipe() — left-to-right function composition (8 type-safe overloads)
 * - from() — builder chain for >8 plugins
 * - withAg() — adds ag (tree + layout + render)
 * - withTerm(term) — adds render/paint wiring + event loop
 *
 * Additional plugins in @silvery/create:
 * - withReact({ view }) — mounts React reconciler (@silvery/create/with-react)
 * - withApp() — registries, commands, keymaps (@silvery/create/with-app)
 *
 * @example
 * ```ts
 * const app = pipe(create(), withAg(), withTerm(term))
 * app.render() // layout + render + paint
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

/**
 * Compose plugins left-to-right. Each plugin takes an app and returns an enhanced app.
 * TypeScript instantiates each generic at each overload step, so the accumulated type
 * flows through the chain. 8 overloads covers all realistic silvery apps.
 *
 * For >8 plugins, use `from(create()).then(withAg()).then(withTerm(term)).build()`.
 */
export function pipe<A>(a: A): A
export function pipe<A, B>(a: A, f1: (a: A) => B): B
export function pipe<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C
export function pipe<A, B, C, D>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D
export function pipe<A, B, C, D, E>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E): E
export function pipe<A, B, C, D, E, F>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
): F
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
): H
export function pipe(initial: any, ...fns: ((arg: any) => any)[]): any {
  return fns.reduce((acc, fn) => fn(acc), initial)
}

// =============================================================================
// from() — Builder Chain (escape hatch for >8 plugins)
// =============================================================================

export interface PipeBuilder<T> {
  then<U>(fn: (value: T) => U): PipeBuilder<U>
  build(): T
}

export function from<T>(value: T): PipeBuilder<T> {
  return {
    then<U>(fn: (value: T) => U): PipeBuilder<U> {
      return from(fn(value))
    },
    build(): T {
      return value
    },
  }
}

// =============================================================================
// withAg() — Tree + Layout + Render
// =============================================================================

export function withAg(options?: { root?: AgNode; measurer?: import("./unicode").Measurer }) {
  return <A extends AppBase>(app: A) => {
    const root =
      options?.root ??
      ({
        type: "silvery-root" as const,
        props: {},
        children: [],
        parent: null,
        layoutNode: null,
        contentRect: null,
        scrollRect: null,
        renderRect: null,
        prevLayout: null,
        prevScrollRect: null,
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

    return { ...app, ag } as A & { readonly ag: Ag }
  }
}

// =============================================================================
// withTerm() — I/O + Paint
// =============================================================================

export function withTerm(term: Term) {
  return <A extends AppBase & { readonly ag: Ag }>(app: A) => {
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
          app.dispatch({
            type: `input:${event.type}`,
            ...(event.data as Record<string, unknown>),
          } as any)
          if (event.type === "resize") {
            render() // Resize always re-renders
          }
        }
      }
    }

    return { ...app, term, render, run: runFn } as A & {
      readonly term: Term
      render(): void
      run?: () => Promise<void>
    }
  }
}
