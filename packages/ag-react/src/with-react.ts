/**
 * withReact — Plugin: mount React reconciler + virtual buffer
 *
 * This plugin represents the React rendering layer in silvery's plugin
 * composition model. It mounts a React element through the reconciler,
 * manages the virtual buffer, and re-renders reactively on store changes.
 *
 * ## Three call forms
 *
 * Legacy positional form (back-compat):
 * ```tsx
 * withReact(<Board />)
 * ```
 *
 * Object form — element:
 * ```tsx
 * withReact({ view: <Board /> })
 * ```
 *
 * Object form — factory `(app) => ReactElement`. The factory runs
 * immediately at plugin-install time, receiving the current app (with
 * all previously-piped plugins installed). Useful when the view needs
 * access to app state that earlier plugins have added (e.g. `app.chat`
 * from `withChat`):
 * ```tsx
 * withReact({ view: (app) => (
 *   <ChatProvider chat={app.chat}>
 *     <ChatView />
 *   </ChatProvider>
 * ) })
 * ```
 *
 * In the current architecture, React mounting is handled by createApp()
 * and render(). This plugin provides the declarative interface for
 * pipe() composition:
 *
 * ```tsx
 * const app = pipe(
 *   createApp(store),
 *   withReact(<Board />),
 *   withTerminal(process),
 * )
 * ```
 *
 * @example
 * ```tsx
 * import { pipe, withReact } from '@silvery/create'
 *
 * // Element bound at install time
 * const app = pipe(baseApp, withReact(<MyComponent />))
 *
 * // Factory bound to app state
 * const app = pipe(
 *   baseApp,
 *   withChat({ chat }),
 *   withReact({ view: (app) => <ChatProvider chat={app.chat}><ChatView /></ChatProvider> }),
 * )
 * ```
 */

import type { ReactElement } from "react"

// =============================================================================
// Types
// =============================================================================

/**
 * App enhanced with a React element for rendering.
 */
export interface AppWithReact {
  /** The React element to render */
  readonly element: ReactElement
  /** Run the app (renders the element and starts the event loop) */
  run(): Promise<void>
}

/**
 * Minimal app shape that withReact can enhance.
 * Requires a run() method that accepts an element.
 */
interface RunnableApp {
  run(element: ReactElement, ...args: unknown[]): unknown
  [key: string]: unknown
}

/**
 * Factory form: receives the app (with all prior plugins installed) and
 * returns the element to render. Runs once at plugin-install time.
 */
export type ViewFactory<T> = (app: T) => ReactElement

/**
 * Object-form options accepted by {@link withReact}.
 * `view` may be a ReactElement or a factory `(app) => ReactElement`.
 */
export interface WithReactOptions<T> {
  view: ReactElement | ViewFactory<T>
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Type guard: distinguish ReactElement from WithReactOptions.
 *
 * A ReactElement always has a `type` field (string for host, function/class
 * for composite). WithReactOptions does not — it has `view`. This lets us
 * accept both forms without ambiguity.
 */
function isReactElement(x: unknown): x is ReactElement {
  return (
    typeof x === "object" &&
    x !== null &&
    "type" in x &&
    !("view" in (x as Record<string, unknown>))
  )
}

/**
 * Resolve a view (ReactElement or factory) to a ReactElement.
 */
function resolveView<T>(view: ReactElement | ViewFactory<T>, app: T): ReactElement {
  return typeof view === "function" ? (view as ViewFactory<T>)(app) : view
}

/**
 * Associate a React element with an app for rendering.
 *
 * In pipe() composition, this captures the element so that subsequent
 * plugins and the final run() know what to render.
 *
 * The plugin wraps `run()` to automatically pass the element:
 * - Before: `app.run(<Board />, options)`
 * - After: `app.run()` (element already bound)
 *
 * Accepts three call forms:
 * - `withReact(element)` — legacy positional ReactElement
 * - `withReact({ view: element })` — object form with element
 * - `withReact({ view: (app) => element })` — object form with factory
 *
 * @param viewOrOptions - ReactElement (legacy) or `{ view: ReactElement | (app) => ReactElement }`
 * @returns Plugin function that binds the element to the app
 */
export function withReact<T extends RunnableApp>(
  viewOrOptions: ReactElement | WithReactOptions<T>,
): (app: T) => T & AppWithReact {
  return (app: T): T & AppWithReact => {
    const originalRun = app.run

    // Resolve the view spec to a ReactElement.
    //
    // - Bare ReactElement (legacy): use as-is.
    // - Object form with element: unwrap.
    // - Object form with factory: call factory(app) — the app passed here
    //   includes all plugins piped before withReact, so the factory can
    //   read (e.g.) app.chat, app.quit. Eager resolution matches idiomatic
    //   usage where withReact is the last entry in the pipe.
    const element = isReactElement(viewOrOptions)
      ? viewOrOptions
      : resolveView(viewOrOptions.view, app)

    return Object.assign(Object.create(app), {
      element,
      run(...args: unknown[]) {
        // If run() is called without an element, inject our bound element
        if (
          args.length === 0 ||
          typeof args[0] !== "object" ||
          args[0] === null ||
          !("type" in (args[0] as object))
        ) {
          // args[0] is likely options, not an element
          return originalRun.call(app, element, ...args)
        }
        // Otherwise pass through as-is
        return originalRun.apply(app, args as [ReactElement, ...unknown[]])
      },
    }) as T & AppWithReact
  }
}
