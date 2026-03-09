/**
 * Event handler composition for createApp runtime.
 *
 * Extracted from create-app.tsx to reduce nesting depth.
 * Contains: handler context creation, focus navigation dispatch,
 * mouse event dispatch, and key handler dispatch.
 *
 * All functions are pure or near-pure — they don't access the event loop's
 * mutable state (pendingRerender, isRendering, etc.), which stays in create-app.tsx.
 */

import type { StoreApi } from "zustand"

import { createKeyEvent, dispatchKeyEvent } from "@silvery/tea/focus-events"
import type { FocusManager } from "@silvery/tea/focus-manager"
import { findByTestID } from "@silvery/tea/focus-queries"
import { type MouseEventProcessorState, processMouseEvent, hitTest } from "../mouse-events"
import type { Container } from "@silvery/react/reconciler"
import { getContainerRoot } from "@silvery/react/reconciler"
import type { TeaNode } from "@silvery/tea/types"
import type { Key } from "./keys"
import type { EventHandler, EventHandlerContext, EventHandlers } from "./create-app"

// ============================================================================
// Types
// ============================================================================

/**
 * Namespaced event from a provider.
 */
export interface NamespacedEvent {
  type: string
  provider: string
  event: string
  data: unknown
}

// ============================================================================
// Handler Context
// ============================================================================

/**
 * Build the EventHandlerContext passed to user-defined event handlers.
 * Shared by runEventHandler() and press().
 *
 * When the store was created with `tea()` middleware, `dispatch` is
 * automatically wired from the store state.
 */
export function createHandlerContext<S>(
  store: StoreApi<S>,
  focusManager: FocusManager,
  container: Container,
): EventHandlerContext<S> {
  // Detect tea() middleware: store state has a dispatch function
  const state = store.getState() as Record<string, unknown>
  const teaDispatch = typeof state.dispatch === "function" ? state.dispatch : undefined

  return {
    set: store.setState,
    get: store.getState,
    focusManager,
    focus(testID: string) {
      const root = getContainerRoot(container)
      focusManager.focusById(testID, root, "programmatic")
    },
    activateScope(scopeId: string) {
      const root = getContainerRoot(container)
      focusManager.activateScope(scopeId, root)
    },
    getFocusPath() {
      const root = getContainerRoot(container)
      return focusManager.getFocusPath(root)
    },
    dispatch: teaDispatch as EventHandlerContext<S>["dispatch"],
    hitTest(x: number, y: number) {
      const root = getContainerRoot(container)
      return hitTest(root, x, y)
    },
  }
}

// ============================================================================
// Focus Navigation
// ============================================================================

/**
 * Dispatch a key event through the focus system and handle default
 * focus navigation (Tab, Shift+Tab, Enter scope, Escape scope).
 *
 * Returns "consumed" if the focus system handled the event (caller should
 * render and return), or "continue" if the event should proceed to app handlers.
 */
export function handleFocusNavigation(
  input: string,
  parsedKey: Key,
  focusManager: FocusManager,
  container: Container,
): "consumed" | "continue" {
  if (!focusManager.activeElement) return "continue"

  // Dispatch key event to focused node (capture + bubble phases)
  const keyEvent = createKeyEvent(input, parsedKey, focusManager.activeElement)
  dispatchKeyEvent(keyEvent)

  // If focus system consumed the event, skip app handlers
  if (keyEvent.propagationStopped || keyEvent.defaultPrevented) {
    return "consumed"
  }

  const root = getContainerRoot(container)

  // Tab: focus next
  if (parsedKey.tab && !parsedKey.shift) {
    focusManager.focusNext(root)
    return "consumed"
  }

  // Shift+Tab: focus previous
  if (parsedKey.tab && parsedKey.shift) {
    focusManager.focusPrev(root)
    return "consumed"
  }

  // Enter: if focused element has focusScope, enter that scope
  if (parsedKey.return) {
    const activeEl = focusManager.activeElement
    if (activeEl) {
      const props = activeEl.props as Record<string, unknown>
      const testID = typeof props.testID === "string" ? props.testID : null
      if (props.focusScope && testID) {
        focusManager.enterScope(testID)
        focusManager.focusNext(root, activeEl)
        return "consumed"
      }
    }
  }

  // Escape: exit the current focus scope
  if (parsedKey.escape && focusManager.scopeStack.length > 0) {
    const scopeId = focusManager.scopeStack[focusManager.scopeStack.length - 1]!
    focusManager.exitScope()
    const scopeNode = findByTestID(root, scopeId)
    if (scopeNode) {
      focusManager.focus(scopeNode, "keyboard")
    }
    return "consumed"
  }

  return "continue"
}

// ============================================================================
// Mouse Event Dispatch
// ============================================================================

/**
 * Dispatch a DOM-level mouse event to the node tree.
 * Called from runEventHandler for mouse events.
 */
export function dispatchMouseEventToTree(
  event: NamespacedEvent,
  mouseEventState: MouseEventProcessorState,
  root: TeaNode,
): void {
  if (event.event !== "mouse" || !event.data) return

  const mouseData = event.data as {
    button: number
    x: number
    y: number
    action: string
    delta?: number
    shift: boolean
    meta: boolean
    ctrl: boolean
  }

  processMouseEvent(
    mouseEventState,
    {
      button: mouseData.button,
      x: mouseData.x,
      y: mouseData.y,
      action: mouseData.action as "down" | "up" | "move" | "wheel",
      delta: mouseData.delta,
      shift: mouseData.shift,
      meta: mouseData.meta,
      ctrl: mouseData.ctrl,
    },
    root,
  )
}

// ============================================================================
// Event Handler Dispatch
// ============================================================================

/**
 * Invoke the namespaced handler for a single event (state mutation only, no render).
 * Returns true to continue, false to exit, or "flush" for a render barrier.
 *
 * Also dispatches DOM-level mouse events when applicable.
 */
export function invokeEventHandler<S>(
  event: NamespacedEvent,
  handlers: EventHandlers<S> | undefined,
  ctx: EventHandlerContext<S>,
  mouseEventState: MouseEventProcessorState,
  container: Container,
): boolean | "flush" {
  const namespacedHandler = handlers?.[event.type as keyof typeof handlers]

  if (namespacedHandler && typeof namespacedHandler === "function") {
    const result = (namespacedHandler as EventHandler<unknown, S>)(event.data, ctx)
    if (result === "exit") return false
    if (result === "flush") return "flush"
  }

  // DOM-level mouse event dispatch
  const root = getContainerRoot(container)
  dispatchMouseEventToTree(event, mouseEventState, root)

  return true
}

/**
 * Dispatch a term:key event to app handlers (namespaced + legacy).
 * Returns "exit" if the handler signaled exit, undefined otherwise.
 */
export function dispatchKeyToHandlers<S>(
  input: string,
  parsedKey: Key,
  handlers: EventHandlers<S> | undefined,
  ctx: EventHandlerContext<S>,
): "exit" | undefined {
  // Namespaced handler
  const namespacedHandler = handlers?.["term:key" as keyof typeof handlers]
  if (namespacedHandler && typeof namespacedHandler === "function") {
    const result = (namespacedHandler as EventHandler<unknown, S>)({ input, key: parsedKey }, ctx)
    if (result === "exit") return "exit"
  }

  // Legacy handler
  if ((handlers as any)?.key) {
    const result = (handlers as any).key(input, parsedKey, ctx)
    if (result === "exit") return "exit"
  }

  return undefined
}
