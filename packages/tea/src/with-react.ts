/**
 * withReact(element) — Plugin: mount React reconciler + virtual buffer
 *
 * This plugin represents the React rendering layer in silvery's plugin
 * composition model. It mounts a React element through the reconciler,
 * manages the virtual buffer, and re-renders reactively on store changes.
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
 * Currently, withReact stores the element for use by the runtime
 * that calls run(). Future iterations will extract the full React
 * reconciler lifecycle into this plugin.
 *
 * @example
 * ```tsx
 * import { pipe, withReact } from '@silvery/tea'
 *
 * // The element is associated with the app for later mounting
 * const app = pipe(baseApp, withReact(<MyComponent />))
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

// =============================================================================
// Implementation
// =============================================================================

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
 * @param element - The React element to render
 * @returns Plugin function that binds the element to the app
 */
export function withReact<T extends RunnableApp>(element: ReactElement): (app: T) => T & AppWithReact {
  return (app: T): T & AppWithReact => {
    const originalRun = app.run

    return Object.assign(Object.create(app), {
      element,
      run(...args: unknown[]) {
        // If run() is called without an element, inject our bound element
        if (args.length === 0 || typeof args[0] !== "object" || args[0] === null || !("type" in (args[0] as object))) {
          // args[0] is likely options, not an element
          return originalRun.call(app, element, ...args)
        }
        // Otherwise pass through as-is
        return originalRun.apply(app, args as [ReactElement, ...unknown[]])
      },
    }) as T & AppWithReact
  }
}
