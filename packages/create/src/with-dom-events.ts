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

import type { App } from "@silvery/ag-term/app"
import type { FocusManager } from "./focus-manager"
import {
  createMouseEventProcessor,
  processMouseEvent,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "@silvery/ag-term/mouse-events"
import { createInputRouter, type InputRouter } from "./internal/input-router"
import { createCapabilityRegistry, type CapabilityRegistry } from "./internal/capability-registry"
import { SELECTION_CAPABILITY, CLIPBOARD_CAPABILITY, DRAG_CAPABILITY, INPUT_ROUTER } from "./internal/capabilities"
import { createSelectionFeature, type SelectionFeature } from "@silvery/ag-term/features"
import { createDragFeature, type DragFeature } from "@silvery/ag-term/features"
import { hitTest } from "@silvery/ag-term/mouse-events"

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
   * Enable text selection via mouse drag.
   * When true, creates a SelectionFeature and registers it in the capability registry.
   * Default: false
   */
  selection?: boolean

  /**
   * Enable drag-and-drop via mouse.
   * When true, creates a DragFeature and registers it in the capability registry.
   * Draggable nodes (draggable=true) can be dragged to drop targets (onDrop handlers).
   * Default: false
   */
  drag?: boolean

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

  /** The selection feature (only present when selection is enabled). */
  readonly selectionFeature?: SelectionFeature

  /** The drag feature (only present when drag is enabled). */
  readonly dragFeature?: DragFeature
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
export function withDomEvents(options: WithDomEventsOptions = {}): <T extends App>(app: T) => T & AppWithDomEvents {
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

    // --- Selection Feature ---
    const selectionEnabled = options.selection ?? false
    let selectionFeature: SelectionFeature | undefined

    if (selectionEnabled) {
      // Selection needs a buffer — it will be lazily resolved when mouse events arrive.
      // For now, create with a deferred buffer access pattern.
      // The buffer is accessed from the app's lastBuffer() method.
      const bufferProxy = new Proxy({} as import("@silvery/ag-term/buffer").TerminalBuffer, {
        get(_target, prop) {
          const buf = app.lastBuffer?.()
          if (!buf) throw new Error("SelectionFeature: no buffer available yet")
          return (buf as any)[prop]
        },
      })

      const clipboard = registry.get<import("@silvery/ag-term/features").ClipboardCapability>(CLIPBOARD_CAPABILITY)

      selectionFeature = createSelectionFeature({
        buffer: bufferProxy,
        clipboard: clipboard ?? undefined,
        invalidate: () => router.invalidate(),
      })

      registry.register(SELECTION_CAPABILITY, selectionFeature)

      // Register selection mouse handler at priority 100 (high — intercepts before component handlers)
      router.registerMouseHandler(100, (event) => {
        if (event.button !== 0) return false // only left button

        if (event.type === "mousedown") {
          selectionFeature!.handleMouseDown(event.x, event.y, event.modifiers?.alt ?? false)
          return false // don't consume mousedown — let components handle click-to-focus etc.
        }

        if (event.type === "mousemove" && selectionFeature!.state.selecting) {
          selectionFeature!.handleMouseMove(event.x, event.y)
          return true // consume move during active selection
        }

        if (event.type === "mouseup" && selectionFeature!.state.selecting) {
          selectionFeature!.handleMouseUp(event.x, event.y)
          return false // don't consume mouseup
        }

        return false
      })
    }

    // --- Drag Feature ---
    const dragEnabled = options.drag ?? false
    let dragFeature: DragFeature | undefined

    if (dragEnabled) {
      dragFeature = createDragFeature({
        invalidate: () => router.invalidate(),
      })

      registry.register(DRAG_CAPABILITY, dragFeature)

      // Register drag mouse handler at priority 150 (beats selection at 100)
      router.registerMouseHandler(150, (event) => {
        if (event.button !== 0) return false // only left button

        if (event.type === "mousedown") {
          // Hit test to find the node under the cursor
          const root = app.getContainer()
          const node = hitTest(root, event.x, event.y)
          if (node) {
            const claimed = dragFeature!.handleMouseDown(event.x, event.y, node)
            if (claimed) return false // don't consume mousedown — let click-to-focus work
          }
          return false
        }

        if (event.type === "mousemove" && dragFeature!.tracking) {
          const root = app.getContainer()
          dragFeature!.handleMouseMove(event.x, event.y, (x, y) => hitTest(root, x, y))
          return true // consume move during drag tracking
        }

        if (event.type === "mouseup" && dragFeature!.tracking) {
          const wasDragging = dragFeature!.state !== null
          const root = app.getContainer()
          dragFeature!.handleMouseUp(event.x, event.y, (x, y) => hitTest(root, x, y))
          return wasDragging // only consume if drag was active (not just pointing)
        }

        return false
      })

      // Register Escape key handler to cancel drag at priority 150
      router.registerKeyHandler(150, (event) => {
        if (event.key === "escape" && dragFeature!.tracking) {
          dragFeature!.cancel()
          return true
        }
        return false
      })

      // Register drag ghost overlay at z-order 200 (above selection at 100)
      router.registerOverlay(200, () => {
        // Drag ghost rendering — currently a no-op placeholder.
        // The actual ghost rendering will be handled by a React component
        // that subscribes to dragFeature.state for position updates.
      })
    }

    // Override click, doubleClick, and wheel to use our processor
    // which is connected to the focus manager and input router
    const enhanced = new Proxy(app, {
      get(target, prop, receiver) {
        if (prop === "capabilityRegistry") return registry
        if (prop === "inputRouter") return router
        if (prop === "selectionFeature") return selectionFeature
        if (prop === "dragFeature") return dragFeature

        if (prop === "click") {
          return async function enhancedClick(x: number, y: number, clickOptions?: { button?: number }): Promise<T> {
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
