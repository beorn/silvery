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
 * import { pipe, withFocus } from '@silvery/create'
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

import type { App } from "@silvery/ag-term/app"
import { createFocusManager, type FocusManager, type FocusManagerOptions } from "./focus-manager"
import { createFocusEvent, createKeyEvent, dispatchFocusEvent, dispatchKeyEvent } from "./focus-events"
import { parseHotkey, parseKey } from "@silvery/ag/keys"
import { createSelectionFeature, type SelectionFeature } from "@silvery/ag-term/features/selection"
import { createCopyModeFeature, type CopyModeFeature } from "@silvery/ag-term/features/copy-mode"
import type { CapabilityRegistry } from "./internal/capability-registry"
import type { InputRouter } from "./internal/input-router"
import { SELECTION_CAPABILITY, COPY_MODE_CAPABILITY, FIND_CAPABILITY } from "./internal/capabilities"
import { createFindFeature, type FindFeature, type FindFeatureOptions } from "@silvery/ag-term/find-feature"

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
  /** Enable keyboard copy-mode via Esc+v (default: false) */
  copyMode?: boolean
  /** Capability registry for cross-feature discovery (required for copyMode) */
  capabilityRegistry?: CapabilityRegistry
  /** Input router for priority-based key dispatch (required for copyMode) */
  inputRouter?: InputRouter
}

/**
 * App enhanced with focus management.
 */
export type AppWithFocus = App & {
  /** The focus manager instance */
  readonly focusManager: FocusManager
  /** Copy-mode feature (only present when copyMode option is enabled) */
  readonly copyModeFeature?: CopyModeFeature
  /** Selection feature (only present when copyMode option is enabled) */
  readonly selectionFeature?: SelectionFeature
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
    const { handleTab = true, handleEscape = true, dispatchKeyEvents = true, copyMode = false } = options

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

    // --- Copy-mode setup ---
    let selectionFeature: SelectionFeature | undefined
    let copyModeFeatureInstance: CopyModeFeature | undefined
    let unregisterCopyModeKey: (() => void) | undefined

    // Track Escape press for Esc+v chord detection
    let lastEscapeTime = 0
    const ESC_V_CHORD_TIMEOUT = 500 // ms

    if (copyMode) {
      const registry = options.capabilityRegistry
      const router = options.inputRouter

      // Create selection feature (always needed for copy-mode)
      const invalidate = router ? () => router.invalidate() : () => {}
      selectionFeature = createSelectionFeature({ invalidate })

      // Register selection capability
      if (registry) {
        registry.register(SELECTION_CAPABILITY, selectionFeature)
      }

      // Create copy-mode feature (requires selection)
      copyModeFeatureInstance = createCopyModeFeature({
        selection: selectionFeature,
        invalidate,
      })

      // Register copy-mode capability
      if (registry) {
        registry.register(COPY_MODE_CAPABILITY, copyModeFeatureInstance)
      }

      // Register key handler via InputRouter at priority 200 (above normal app keys)
      if (router) {
        unregisterCopyModeKey = router.registerKeyHandler(200, (event) => {
          const cm = copyModeFeatureInstance!

          // When copy-mode is active, intercept all relevant keys
          if (cm.state.active) {
            switch (event.key) {
              case "h":
              case "j":
              case "k":
              case "l":
                cm.motion(event.key)
                return true
              case "v":
                cm.startVisual()
                return true
              case "V":
                cm.startVisualLine()
                return true
              case "y":
                cm.yank()
                return true
              case "Escape":
              case "q":
                cm.exit()
                return true
              case "0":
                // Move to line start
                copyModeUpdate_dispatch(cm, { type: "moveToLineStart" })
                return true
              case "$":
                // Move to line end
                copyModeUpdate_dispatch(cm, { type: "moveToLineEnd" })
                return true
              default:
                // Consume all other keys while in copy-mode (don't let them through)
                return true
            }
          }

          return false
        })
      }
    }

    // Wrap press() to intercept focus navigation keys
    const originalPress = app.press.bind(app)

    const enhancedApp = new Proxy(app, {
      get(target, prop, receiver) {
        if (prop === "focusManager") {
          return fm
        }

        if (prop === "copyModeFeature") {
          return copyModeFeatureInstance
        }

        if (prop === "selectionFeature") {
          return selectionFeature
        }

        if (prop === "press") {
          return async function focusPress(keyStr: string): Promise<typeof enhancedApp> {
            const { key, shift, alt } = parseHotkey(keyStr)

            const root = target.getContainer()

            // Copy-mode: dispatch through InputRouter first if active
            if (copyMode && copyModeFeatureInstance?.state.active) {
              const router = options.inputRouter
              if (router) {
                const claimed = router.dispatchKey({
                  key,
                  modifiers: { shift, alt },
                })
                if (claimed) return enhancedApp
              }
            }

            // Esc+v chord: track Escape presses, enter copy-mode on 'v' within timeout
            if (copyMode && copyModeFeatureInstance) {
              if (key === "Escape") {
                lastEscapeTime = Date.now()
                // Don't consume Escape here — let it fall through for blur behavior
              } else if (key === "v" && !shift && !alt && Date.now() - lastEscapeTime < ESC_V_CHORD_TIMEOUT) {
                lastEscapeTime = 0
                copyModeFeatureInstance.enter()
                return enhancedApp
              }
            }

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

        if (prop === Symbol.dispose || prop === "unmount") {
          return function disposeWithCopyMode(): void {
            // Clean up copy-mode resources
            unregisterCopyModeKey?.()
            copyModeFeatureInstance?.dispose()
            selectionFeature?.dispose()

            // Call original
            if (prop === Symbol.dispose) {
              target[Symbol.dispose]()
            } else {
              target.unmount()
            }
          }
        }

        return Reflect.get(target, prop, receiver)
      },
    }) as AppWithFocus

    return enhancedApp
  }
}

/**
 * Helper to dispatch raw copy-mode actions through the feature.
 * Used for actions not covered by the high-level API (moveToLineStart, etc.).
 */
function copyModeUpdate_dispatch(
  cm: CopyModeFeature,
  action: { type: "moveToLineStart" } | { type: "moveToLineEnd" },
): void {
  // Access the internal state machine directly via the feature's enter/exit pattern
  // For line-start/end, we use motion keys mapped to 0/$
  // The feature doesn't expose these directly, but we can use the state to calculate
  if (action.type === "moveToLineStart") {
    // Move left repeatedly to reach column 0
    const { state } = cm
    if (!state.active) return
    // Quick approach: just keep pressing left until col 0
    while (cm.state.cursor.col > 0) {
      cm.motion("h")
    }
  } else if (action.type === "moveToLineEnd") {
    const { state } = cm
    if (!state.active) return
    while (cm.state.cursor.col < state.bufferWidth - 1) {
      cm.motion("l")
    }
  }
}
