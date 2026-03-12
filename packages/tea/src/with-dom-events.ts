/**
 * withDomEvents() — Plugin for DOM-style event dispatch
 *
 * Wires mouse event dispatch through the render tree:
 * - Hit testing via screenRect (tree-based, not manual registry)
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
 * import { pipe, withDomEvents } from '@silvery/tea'
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

import type { App } from "@silvery/term/app"
import type { FocusManager } from "./focus-manager"
import {
  createMouseEventProcessor,
  processMouseEvent,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "@silvery/term/mouse-events"

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
export function withDomEvents(options: WithDomEventsOptions = {}): <T extends App>(app: T) => T {
  return <T extends App>(app: T): T => {
    // Get focus manager from options or from the app itself
    const fm = options.focusManager ?? (app as App & { focusManager?: FocusManager }).focusManager

    // Create a mouse event processor with the focus manager
    const processorOptions: MouseEventProcessorOptions = {}
    if (fm) {
      processorOptions.focusManager = fm
    }
    const mouseState = createMouseEventProcessor(processorOptions)

    // Override click, doubleClick, and wheel to use our processor
    // which is connected to the focus manager
    return new Proxy(app, {
      get(target, prop, receiver) {
        if (prop === "click") {
          return async function enhancedClick(
            x: number,
            y: number,
            clickOptions?: { button?: number },
          ): Promise<T> {
            const button = clickOptions?.button ?? 0
            const root = target.getContainer()
            processMouseEvent(
              mouseState,
              { button, x, y, action: "down", shift: false, meta: false, ctrl: false },
              root,
            )
            processMouseEvent(
              mouseState,
              { button, x, y, action: "up", shift: false, meta: false, ctrl: false },
              root,
            )
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
            await Promise.resolve()
            return receiver as T
          }
        }

        return Reflect.get(target, prop, receiver)
      },
    }) as T
  }
}
