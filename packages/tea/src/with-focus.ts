/**
 * withFocus() — Plugin for Tab/Shift+Tab focus navigation
 *
 * Intercepts `press()` calls to handle focus navigation keys:
 * - Tab → focus next
 * - Shift+Tab → focus previous
 * - Escape → blur (when something is focused)
 *
 * Also provides focus scope management and dispatches focus/blur
 * events through the render tree.
 *
 * @example
 * ```tsx
 * import { pipe, withFocus } from '@silvery/tea'
 *
 * const app = pipe(
 *   baseApp,
 *   withFocus(),
 * )
 *
 * // Tab/Shift+Tab now cycle focus through focusable nodes
 * await app.press('Tab')
 * await app.press('Shift+Tab')
 *
 * // Focus manager is accessible
 * app.focusManager.activeId  // currently focused testID
 * ```
 */

import type { App } from "@silvery/term/app"
import { createFocusManager, type FocusManager, type FocusManagerOptions } from "./focus-manager"
import {
  createFocusEvent,
  createKeyEvent,
  dispatchFocusEvent,
  dispatchKeyEvent,
} from "./focus-events"
import { parseHotkey, parseKey } from "./keys"

// =============================================================================
// Types
// =============================================================================

/**
 * Options for withFocus.
 */
export interface WithFocusOptions {
  /** Custom focus manager (creates a new one if not provided) */
  focusManager?: FocusManager
  /** Focus manager options (ignored if focusManager is provided) */
  focusManagerOptions?: FocusManagerOptions
  /** Handle Tab key for focus cycling (default: true) */
  handleTab?: boolean
  /** Handle Escape key to blur (default: true) */
  handleEscape?: boolean
  /** Dispatch keyboard events through focus tree (default: true) */
  dispatchKeyEvents?: boolean
}

/**
 * App enhanced with focus management.
 */
export type AppWithFocus = App & {
  /** The focus manager instance */
  readonly focusManager: FocusManager
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Add focus management to an App.
 *
 * Intercepts key presses for focus navigation (Tab/Shift+Tab/Escape)
 * and optionally dispatches keyboard events through the focus tree
 * with capture/target/bubble phases.
 *
 * @param options - Focus configuration (all defaults are sensible)
 * @returns Plugin function that enhances an App with focus management
 */
export function withFocus(options: WithFocusOptions = {}): (app: App) => AppWithFocus {
  return (app: App): AppWithFocus => {
    const { handleTab = true, handleEscape = true, dispatchKeyEvents = true } = options

    // Create or reuse focus manager
    const fm =
      options.focusManager ??
      createFocusManager({
        ...options.focusManagerOptions,
        // Wire up focus change events to dispatch through the tree
        onFocusChange: (oldNode, newNode, origin) => {
          // Call user's callback too if provided
          options.focusManagerOptions?.onFocusChange?.(oldNode, newNode, origin)

          // Dispatch blur event on old node
          if (oldNode) {
            const blurEvent = createFocusEvent("blur", oldNode, newNode)
            dispatchFocusEvent(blurEvent)
          }

          // Dispatch focus event on new node
          if (newNode) {
            const focusEvent = createFocusEvent("focus", newNode, oldNode)
            dispatchFocusEvent(focusEvent)
          }
        },
      })

    // Wrap press() to intercept focus navigation keys
    const originalPress = app.press.bind(app)

    const enhancedApp = new Proxy(app, {
      get(target, prop, receiver) {
        if (prop === "focusManager") {
          return fm
        }

        if (prop === "press") {
          return async function focusPress(keyStr: string): Promise<typeof enhancedApp> {
            const { key, shift } = parseHotkey(keyStr)

            const root = target.getContainer()

            // Tab → focus next
            if (handleTab && key === "Tab" && !shift) {
              fm.focusNext(root)
              return enhancedApp
            }

            // Shift+Tab → focus previous
            if (handleTab && key === "Tab" && shift) {
              fm.focusPrev(root)
              return enhancedApp
            }

            // Escape → blur (only when something is focused)
            if (handleEscape && key === "Escape" && fm.activeElement) {
              fm.blur()
              return enhancedApp
            }

            // Dispatch keyboard event through focus tree before passing through
            if (dispatchKeyEvents && fm.activeElement) {
              const [input, parsedKey] = parseKey(keyStr)
              const keyEvent = createKeyEvent(input, parsedKey, fm.activeElement)
              dispatchKeyEvent(keyEvent)

              // If the event was handled (stopPropagation), don't pass through
              if (keyEvent.propagationStopped || keyEvent.defaultPrevented) {
                return enhancedApp
              }
            }

            // Pass through to original press handler
            await originalPress(keyStr)
            return enhancedApp
          }
        }

        return Reflect.get(target, prop, receiver)
      },
    }) as AppWithFocus

    return enhancedApp
  }
}
