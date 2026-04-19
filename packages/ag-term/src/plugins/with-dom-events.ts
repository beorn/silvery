/**
 * withDomEvents() — Plugin for DOM-style event dispatch
 *
 * Wires mouse event dispatch through the render tree:
 * - Hit testing via scrollRect (tree-based, not manual registry)
 * - Bubbling from target → root with stopPropagation() support
 * - mouseenter/mouseleave tracking (no bubble, per DOM spec)
 * - Double-click detection (300ms / 2-cell threshold)
 * - Click-to-focus (focuses nearest focusable ancestor on mousedown)
 *
 * Mouse event handler props (onClick, onMouseDown, etc.) are already
 * defined on BoxProps/TextProps via MouseEventProps. This plugin wires
 * the dispatch that invokes them.
 *
 * @example
 * ```tsx
 * import { pipe, withDomEvents } from '@silvery/create'
 *
 * const app = pipe(
 *   baseApp,
 *   withFocus(),
 *   withDomEvents(),
 * )
 *
 * // Components can now use mouse event handlers
 * function Button() {
 *   return (
 *     <Box onClick={(e) => {
 *       console.log('clicked at', e.clientX, e.clientY)
 *       e.stopPropagation()
 *     }}>
 *       <Text>Click me</Text>
 *     </Box>
 *   )
 * }
 *
 * // Programmatic mouse events also dispatch through the tree
 * await app.click(10, 5)
 * await app.wheel(10, 5, 1)
 * ```
 */

import type { App } from "../app"
import type { FocusManager } from "@silvery/create/focus-manager"
import {
  createMouseEventProcessor,
  processMouseEvent,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "../mouse-events"
import { createInputRouter, type InputRouter } from "@silvery/create/internal/input-router"
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from "@silvery/create/internal/capability-registry"
import { INPUT_ROUTER } from "@silvery/create/internal/capabilities"

// =============================================================================
// Types
// =============================================================================

/**
 * Options for withDomEvents.
 */
export interface WithDomEventsOptions {
  /** Focus manager for click-to-focus behavior.
   *  If the app has a focusManager property, it's used automatically. */
  focusManager?: FocusManager

  /**
   * Pre-built capability registry. If not provided, a new one is created.
   * Allows withTerminal (or other plugins) to pre-register capabilities like clipboard.
   */
  capabilityRegistry?: CapabilityRegistry
}

/**
 * App enhanced with DOM event dispatch and interaction features.
 */
export interface AppWithDomEvents {
  /** The capability registry for cross-feature discovery. */
  readonly capabilityRegistry: CapabilityRegistry

  /** The input router for priority-based event dispatch. */
  readonly inputRouter: InputRouter
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Add DOM-style mouse event dispatch to an App.
 *
 * This plugin creates a mouse event processor and ensures that
 * click(), doubleClick(), and wheel() methods on the app dispatch
 * events through the render tree with proper bubbling.
 *
 * The App's buildApp() already sets up mouse event processing.
 * This plugin is provided for explicit composition via pipe()
 * and ensures the focus manager is connected for click-to-focus.
 *
 * @param options - Configuration (focusManager for click-to-focus)
 * @returns Plugin function that enhances an App with DOM event dispatch
 */
export function withDomEvents(
  options: WithDomEventsOptions = {},
): <T extends App>(app: T) => T & AppWithDomEvents {
  return <T extends App>(app: T): T & AppWithDomEvents => {
    // Get focus manager from options or from the app itself
    const fm = options.focusManager ?? (app as App & { focusManager?: FocusManager }).focusManager

    // Create a mouse event processor with the focus manager
    const processorOptions: MouseEventProcessorOptions = {}
    if (fm) {
      processorOptions.focusManager = fm
    }
    const mouseState = createMouseEventProcessor(processorOptions)

    // --- Capability Registry ---
    // Reuse registry from options, from a previous plugin (e.g., withTerminal), or create new
    const existingRegistry = (app as any).capabilityRegistry as CapabilityRegistry | undefined
    const registry = options.capabilityRegistry ?? existingRegistry ?? createCapabilityRegistry()

    // --- Input Router ---
    // invalidate() triggers a re-render. For now, we use a simple approach:
    // the composed app may have a store with setState. If not, invalidate is a no-op
    // until wired by withRender or create-app.
    let invalidateCallback = () => {}
    const router = createInputRouter({ invalidate: () => invalidateCallback() })
    registry.register(INPUT_ROUTER, router)

    // Selection is now handled by create-app.tsx's inline event loop and
    // exposed via a bridge SelectionFeature in the capability registry.
    // withDomEvents no longer creates or dispatches selection events.

    // Override click, doubleClick, and wheel to use our processor
    // which is connected to the focus manager and input router
    const enhanced = new Proxy(app, {
      get(target, prop, receiver) {
        if (prop === "capabilityRegistry") return registry
        if (prop === "inputRouter") return router

        if (prop === "click") {
          return async function enhancedClick(
            x: number,
            y: number,
            clickOptions?: { button?: number },
          ): Promise<T> {
            const button = clickOptions?.button ?? 0

            // Dispatch through input router first
            const downClaimed = router.dispatchMouse({
              x,
              y,
              button,
              type: "mousedown",
            })

            if (!downClaimed) {
              // Fall through to DOM event processor
              const root = target.getContainer()
              processMouseEvent(
                mouseState,
                { button, x, y, action: "down", shift: false, meta: false, ctrl: false },
                root,
              )
            }

            const upClaimed = router.dispatchMouse({
              x,
              y,
              button,
              type: "mouseup",
            })

            if (!upClaimed) {
              const root = target.getContainer()
              processMouseEvent(
                mouseState,
                { button, x, y, action: "up", shift: false, meta: false, ctrl: false },
                root,
              )
            }

            await Promise.resolve()
            return receiver as T
          }
        }

        if (prop === "doubleClick") {
          return async function enhancedDoubleClick(
            x: number,
            y: number,
            clickOptions?: { button?: number },
          ): Promise<T> {
            const button = clickOptions?.button ?? 0
            const root = target.getContainer()
            const parsed = {
              button,
              x,
              y,
              action: "down" as const,
              shift: false,
              meta: false,
              ctrl: false,
            }
            // First click
            processMouseEvent(mouseState, parsed, root)
            processMouseEvent(mouseState, { ...parsed, action: "up" }, root)
            // Second click (triggers double-click detection)
            processMouseEvent(mouseState, parsed, root)
            processMouseEvent(mouseState, { ...parsed, action: "up" }, root)
            await Promise.resolve()
            return receiver as T
          }
        }

        if (prop === "wheel") {
          return async function enhancedWheel(x: number, y: number, delta: number): Promise<T> {
            // Dispatch through input router first
            const claimed = router.dispatchMouse({
              x,
              y,
              button: 0,
              type: "wheel",
            })

            if (!claimed) {
              const root = target.getContainer()
              processMouseEvent(
                mouseState,
                {
                  button: 0,
                  x,
                  y,
                  action: "wheel",
                  delta,
                  shift: false,
                  meta: false,
                  ctrl: false,
                },
                root,
              )
            }

            await Promise.resolve()
            return receiver as T
          }
        }

        // Intercept run() to inject capabilityRegistry into options
        // so createApp wires it into CapabilityRegistryContext for React hooks.
        if (prop === "run") {
          const originalRun = Reflect.get(target, prop, receiver) as (...a: any[]) => any
          if (typeof originalRun === "function") {
            return function enhancedRun(...args: unknown[]) {
              // Inject capabilityRegistry into the options argument.
              // run() can be called as run(), run(element), or run(element, options).
              // We need to find or create the options object and add our registry.
              const inject = { capabilityRegistry: registry }

              if (args.length === 0) {
                return originalRun.call(target, inject)
              } else if (args.length === 1) {
                const arg = args[0]
                if (arg && typeof arg === "object" && "type" in (arg as object)) {
                  return originalRun.call(target, arg, inject)
                } else {
                  return originalRun.call(target, { ...(arg as object), ...inject })
                }
              } else {
                const opts = { ...(args[1] as object), ...inject }
                return originalRun.call(target, args[0], opts)
              }
            }
          }
        }

        return Reflect.get(target, prop, receiver)
      },
    }) as T & AppWithDomEvents

    // Wire invalidation to re-render if the app has a compatible mechanism.
    // The store pattern: app may have a signal-store with setState.
    const appAny = app as any
    if (typeof appAny.store?.setState === "function") {
      invalidateCallback = () => {
        appAny.store.setState((prev: any) => ({ ...prev, _inv: ((prev._inv as number) ?? 0) + 1 }))
      }
    }

    return enhanced
  }
}
