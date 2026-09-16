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

import type { StoreApi } from "@silvery/create/signal-store"

import { createKeyEvent, dispatchKeyEvent } from "@silvery/ag/focus-events"
import type { FocusManager } from "@silvery/ag/focus-manager"
import { findByTestID } from "@silvery/ag/focus-queries"
import { keyToAnsi, keyToModifiers, keyToName, matchHotkey, parseHotkey } from "@silvery/ag/keys"
import type { IslandCommandPrefix } from "@silvery/ag/island-types"
import { type MouseEventProcessorState, processMouseEvent, hitTest } from "../mouse-events"
import { PASTE_START, PASTE_END } from "../bracketed-paste"
import type { Container } from "@silvery/ag-react/reconciler"
import { getContainerRoot } from "@silvery/ag-react/reconciler"
import type { AgNode } from "@silvery/ag/types"
import type { Key } from "./keys"
import type { EventHandler, EventHandlerContext, EventHandlers } from "./create-app"

const islandInputEncoder = new TextEncoder()

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

// The host-coordinate mouse event the focused-island router evaluates before
// SGR-encoding it for the guest.
type RoutedMouseData = {
  button: number
  x: number
  y: number
  action: string
  delta?: number
  deltaX?: number
  shift?: boolean
  meta?: boolean
  ctrl?: boolean
}

function focusedIslandNode(focusManager: FocusManager): AgNode | null {
  let node: AgNode | null = focusManager.activeElement
  while (node) {
    if (node.type === "silvery-island") {
      return nodeCanOwnFocus(node) ? node : null
    }
    node = node.parent
  }
  return null
}

function nodeCanOwnFocus(node: AgNode): boolean {
  if (node.hidden) return false
  const props = node.props as Record<string, unknown>
  return Boolean(props.focusable) && props.display !== "none"
}

function feedIsland(node: AgNode, data: string): boolean {
  if (!data) return false
  const state = node.islandState
  if (!state?.capabilities.input) return false
  const feed = state.handle?.input?.feed
  if (!feed) return false
  feed(islandInputEncoder.encode(data))
  return true
}

function keyToIslandAnsi(input: string, key: Key): string {
  const name = keyToName(key)
  const main = name || input
  if (!main) return ""
  const modifiers = keyToModifiers(key)
  const parts: string[] = []
  if (modifiers.ctrl) parts.push("Control")
  if (modifiers.meta) parts.push("Meta")
  if (modifiers.super) parts.push("Super")
  if (modifiers.hyper) parts.push("Hyper")
  if (modifiers.shift && name) parts.push("Shift")
  parts.push(main)
  return keyToAnsi(parts.join("+"))
}

export function canRouteKeyToFocusedIsland(
  input: string,
  key: Key,
  focusManager: FocusManager,
): boolean {
  if (key.eventType === "release") return false
  const node = focusedIslandNode(focusManager)
  if (!node) return false
  const state = node.islandState
  if (!state?.capabilities.input || !state.handle?.input?.feed) return false
  // Host command prefix (tmux model, @hab/.../20349): when the host reserves
  // this key, it is NOT routed to the guest — it falls through to the app's
  // `useInput`. This also correctly lets the runtime's Ctrl-C / Ctrl-Z
  // interceptors fire (they gate on `!canRouteKeyToFocusedIsland`), since a
  // reserved key is a host key.
  if (isHostCommandPrefixKey(state.commandPrefix, input, key)) return false
  // Cmd/Super + C/V/X are host-level clipboard chords (copy/cut/paste), not
  // terminal-guest input — a real terminal intercepts them for the OS clipboard
  // and never forwards them to the pty. Reserve them for the host so the app's
  // selection/clipboard handlers fire instead of the guest re-encoding them as
  // Kitty CSI-u bytes into the shell.
  if (isHostClipboardChord(input, key)) return false
  return true
}

/**
 * Whether this key can change focused-Island host ownership for the next key.
 * The event loop uses this as a render barrier without disabling ordinary key
 * repeat batching.
 */
export function isFocusedIslandHostInputBarrier(
  input: string,
  key: Key,
  focusManager: FocusManager,
): boolean {
  if (key.eventType === "release") return false
  const node = focusedIslandNode(focusManager)
  const state = node?.islandState
  if (!state?.capabilities.input || !state.handle?.input?.feed) return false
  return isHostCommandPrefixKey(state.commandPrefix, input, key)
}

/**
 * A focused island with a {@link IslandCommandPrefix} reserves a key for the
 * host iff the key matches `hotkey`, one of `reservedHotkeys`, OR the host is
 * `capturing` (mid-command). Reserved keys fall through to the app's `useInput`
 * instead of the guest.
 */
function isHostCommandPrefixKey(
  prefix: IslandCommandPrefix | undefined,
  input: string,
  key: Key,
): boolean {
  if (!prefix) return false
  if (prefix.capturing) return true
  if (matchHotkey(parseHotkey(prefix.hotkey), key, input)) return true
  return (prefix.reservedHotkeys ?? []).some((hotkey) =>
    matchHotkey(parseHotkey(hotkey), key, input),
  )
}

/**
 * Cmd/Super + C/V/X are host clipboard chords (macOS copy/cut/paste). A terminal
 * guest never wants them as pty input, so they are reserved for the host and fall
 * through to the app's `useInput` (mirroring {@link isHostCommandPrefixKey}).
 */
function isHostClipboardChord(input: string, key: Key): boolean {
  if (!keyToModifiers(key).super) return false
  const main = (keyToName(key) || input || "").toLowerCase()
  return main === "c" || main === "v" || main === "x"
}

function routeKeyToFocusedIsland(input: string, key: Key, focusManager: FocusManager): boolean {
  if (!canRouteKeyToFocusedIsland(input, key, focusManager)) return false
  const node = focusedIslandNode(focusManager)
  if (!node) return false
  return feedIsland(node, keyToIslandAnsi(input, key))
}

/**
 * Does the focused island's guest currently have bracketed-paste mode enabled?
 * Reads the same island mode state the protocol-mode aggregator uses
 * (`handle.modes.modes.bracketedPaste`), mirroring {@link islandWantsMouse}. A
 * guest that enabled DECSET 2004 (a shell line editor at its prompt) wants
 * pasted text wrapped in `\x1b[200~`/`\x1b[201~` so it treats the paste as one
 * atomic block instead of interpreting embedded newlines/control bytes as
 * keystrokes; absent modes owner ⇒ OFF.
 */
function islandWantsBracketedPaste(node: AgNode): boolean {
  return node.islandState?.handle?.modes?.modes.bracketedPaste === true
}

/**
 * Route pasted text to the focused input-capable island's guest — the paste
 * sibling of {@link routeKeyToFocusedIsland}. Keys have this routing; paste did
 * not, so a focused shell guest (e.g. a hab deck pane) never received Cmd-V.
 *
 * The runtime `term:paste` event carries the DECODED paste content — the host's
 * bracketed-paste parser already stripped the `\x1b[200~`/`\x1b[201~` markers.
 * When the guest has enabled bracketed-paste mode we re-wrap the text in those
 * markers (mode-aware, exactly like {@link routeMouseToFocusedIsland} gates on
 * the guest's mouse-tracking mode) so the guest's line editor sees one atomic
 * paste; otherwise we feed the raw text, matching a terminal that forwards a
 * paste as plain typed input to a pty whose app hasn't requested DECSET 2004.
 *
 * Returns true when a focused input-capable guest consumed the paste. The caller
 * then skips the app-level React `term:paste` dispatch, so shells get paste and
 * React apps without a focused island still get their `usePaste` event.
 */
export function routePasteToFocusedIsland(text: string, focusManager: FocusManager): boolean {
  if (!text) return false
  const node = focusedIslandNode(focusManager)
  if (!node) return false
  const state = node.islandState
  if (!state?.capabilities.input || !state.handle?.input?.feed) return false
  // Security: the paste text is attacker-influenceable (the OSC 52 clipboard
  // response path decodes arbitrary UTF-8 and fires it as a paste). Wrapping it
  // verbatim in PASTE_START/PASTE_END lets an embedded PASTE_END break out of
  // the envelope into a focused shell guest's line editor. Strip any inner
  // markers before re-wrapping so the guest sees exactly one atomic paste. Only
  // the bracketed branch needs this: the raw branch feeds the guest the bytes a
  // real terminal (bracketed-paste OFF) would forward verbatim.
  const payload = islandWantsBracketedPaste(node)
    ? `${PASTE_START}${stripBracketedPasteMarkers(text)}${PASTE_END}`
    : text
  return feedIsland(node, payload)
}

/**
 * Remove every embedded bracketed-paste marker (PASTE_START / PASTE_END) from
 * paste content — the neutralization behind {@link routePasteToFocusedIsland}'s
 * envelope. Inner DECSET paste markers have no legitimate meaning in literal
 * paste content, so removing them is safe and it closes the envelope-breakout
 * hole.
 *
 * Handles markers that would be *reconstructed* when a removal joins the
 * surrounding fragments (e.g. `"\x1b[20" + "\x1b[201~" + "1~"` rebuilds a
 * PASTE_END if you only pass once). This is a linear-time stack scan: we build
 * the output one code point at a time and drop the tail the instant it completes
 * a marker, so the output never contains a marker as a substring at any point
 * and no fragment join can survive. Both markers are 6 ASCII bytes sharing the
 * `"\x1b[20"` prefix and `"~"` suffix, so we test both after each append.
 */
export function stripBracketedPasteMarkers(text: string): string {
  // Fast path: no marker present ⇒ return as-is (the common plain-text paste).
  if (!text.includes(PASTE_START) && !text.includes(PASTE_END)) return text
  const markerLen = PASTE_END.length // === PASTE_START.length
  const out: string[] = []
  for (const ch of text) {
    out.push(ch)
    if (out.length >= markerLen) {
      const tail = out.slice(out.length - markerLen).join("")
      if (tail === PASTE_START || tail === PASTE_END) {
        out.length -= markerLen
      }
    }
  }
  return out.join("")
}

function encodeIslandMouse(
  data: RoutedMouseData,
  localCol: number,
  localRow: number,
): string | null {
  let button = data.button
  let terminator: "M" | "m" = "M"
  if (data.action === "up") {
    terminator = "m"
  } else if (data.action === "move") {
    button += 32
  } else if (data.action === "wheel") {
    // Single-axis wheel tick: horizontal (deltaX) → 66 (left) / 67 (right);
    // otherwise vertical (delta/deltaY) → 64 (up) / 65 (down). Preserves the
    // axis when forwarding a wheel event to a focused island guest.
    const dx = data.deltaX ?? 0
    button = dx !== 0 ? (dx < 0 ? 66 : 67) : (data.delta ?? 1) < 0 ? 64 : 65
  } else if (data.action !== "down") {
    return null
  }
  if (data.shift) button += 4
  if (data.meta) button += 8
  if (data.ctrl) button += 16
  return `\x1b[<${button};${localCol + 1};${localRow + 1}${terminator}`
}

function routeMouseToFocusedIsland(event: NamespacedEvent, focusManager: FocusManager): boolean {
  if (event.event !== "mouse" || !event.data) return false
  const node = focusedIslandNode(focusManager)
  if (!node?.boxRect) return false
  // Mode-aware routing (@hab/.../20349): only forward mouse to the guest when
  // the guest has actually ENABLED mouse reporting (DECSET 1000/1002/1003 via
  // its island mode state). A guest with mouse OFF doesn't want SGR reports —
  // feeding them just makes it echo garbage — so we return false and let the
  // event reach the host mouse path (DOM onClick dispatch + app handlers) for
  // pane switching.
  if (!islandWantsMouse(node)) return false
  const data = event.data as RoutedMouseData
  const rect = node.boxRect
  const x = Math.floor(data.x)
  const y = Math.floor(data.y)
  if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) {
    return false
  }
  const encoded = encodeIslandMouse(data, x - rect.x, y - rect.y)
  if (!encoded) return false
  return feedIsland(node, encoded)
}

/**
 * Does the focused island's guest currently request mouse tracking? Reads the
 * same island mode state the protocol-mode aggregator uses
 * (`handle.modes.modes.mouseTracking`). Mouse is ON when the guest requests any
 * tracking granularity other than `"off"`; absent modes owner ⇒ OFF.
 */
function islandWantsMouse(node: AgNode): boolean {
  const tracking = node.islandState?.handle?.modes?.modes.mouseTracking
  return tracking !== undefined && tracking !== "off"
}

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
  options: { handleTabCycling?: boolean } = {},
): "consumed" | "continue" {
  const handleTabCycling = options.handleTabCycling ?? true

  if (routeKeyToFocusedIsland(input, parsedKey, focusManager)) {
    return "consumed"
  }

  // Dispatch key event to focused node (capture + bubble phases)
  if (focusManager.activeElement) {
    const keyEvent = createKeyEvent(input, parsedKey, focusManager.activeElement)
    dispatchKeyEvent(keyEvent)

    // If focus system consumed the event, skip app handlers
    if (keyEvent.propagationStopped || keyEvent.defaultPrevented) {
      return "consumed"
    }
  }

  const root = getContainerRoot(container)

  // Tab: focus next (works even when nothing is focused — starts from first).
  // Apps with only a single focusable (or none) can opt out via
  // `handleTabCycling: false` so Tab / Shift+Tab reach useInput instead —
  // common pattern for Claude-Code-style "shift+tab cycles permission mode"
  // bindings where focus navigation isn't useful.
  if (handleTabCycling && parsedKey.tab && !parsedKey.shift) {
    focusManager.focusNext(root)
    return "consumed"
  }

  if (handleTabCycling && parsedKey.tab && parsedKey.shift) {
    focusManager.focusPrev(root)
    return "consumed"
  }

  // Enter: if focused element has focusScope, enter that scope
  if (parsedKey.return && focusManager.activeElement) {
    const activeEl = focusManager.activeElement
    const props = activeEl.props as Record<string, unknown>
    const testID = typeof props.testID === "string" ? props.testID : null
    if (props.focusScope && testID) {
      focusManager.enterScope(testID)
      focusManager.focusNext(root, activeEl)
      return "consumed"
    }
  }

  // Escape: exit the current focus scope if one is open.
  //
  // Apps handle their own Escape routing via keybindings (close dialogs, exit
  // modes, etc.), so we only intercept Escape when there is an actual focus
  // scope to pop. Previously this also called focusManager.blur() as a
  // fallback, but that consumed Escape before app handlers could run — for
  // example preventing `console.close` from firing while the board has the
  // auto-focused "board-area" Box as activeElement. Apps that want the old
  // behaviour can implement it in their own key handler.
  if (parsedKey.escape) {
    if (focusManager.scopeStack.length > 0) {
      const scopeId = focusManager.scopeStack[focusManager.scopeStack.length - 1]!
      // Only pop scopes that correspond to a focusable Box in the tree (entered
      // via Enter on an element with `focusScope` + `testID`). Apps may push
      // virtual scopes onto the stack to drive their own inputMode routing
      // (e.g. km-tui's dialog-guard pushes `dialog:datePrompt` as the canonical
      // "what mode are we in" signal); those virtual scopes have no Box backing
      // and the app handles Escape itself via keybindings. Auto-popping them
      // here would silently break the app's Escape handler — observed as
      // "Escape closes the focus scope but the dialog UI stays open" because
      // `withFocusChain` short-circuits the keybinding lane on `consumed`. See
      // km-otm6c (regression of km-qaco9).
      const scopeNode = findByTestID(root, scopeId)
      if (!scopeNode) {
        return "continue"
      }
      focusManager.exitScope()
      focusManager.focus(scopeNode, "keyboard")
      return "consumed"
    }
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
  root: AgNode,
): boolean {
  if (event.event !== "mouse" || !event.data) return false

  const mouseData = event.data as {
    button: number
    x: number
    y: number
    coordinateMode?: "cell" | "pixel"
    clientX?: number
    clientY?: number
    action: string
    delta?: number
    deltaX?: number
    receivedAt?: number
    inputBatchId?: number
    shift: boolean
    meta: boolean
    ctrl: boolean
  }

  return processMouseEvent(
    mouseEventState,
    {
      button: mouseData.button,
      x: mouseData.x,
      y: mouseData.y,
      // The payload is the input owner's ParsedMouse: carry the units it
      // actually applied (and the pixel client coordinates when it did), so
      // `nativeEvent` / `clientX` on the component event tell the truth.
      coordinateMode: mouseData.coordinateMode ?? "cell",
      ...(mouseData.clientX === undefined ? {} : { clientX: mouseData.clientX }),
      ...(mouseData.clientY === undefined ? {} : { clientY: mouseData.clientY }),
      action: mouseData.action as "down" | "up" | "move" | "wheel",
      delta: mouseData.delta,
      deltaX: mouseData.deltaX,
      receivedAt: mouseData.receivedAt,
      inputBatchId: mouseData.inputBatchId,
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
  // DOM-level mouse event dispatch FIRST — component handlers (onClick, etc.)
  // can call preventDefault() to suppress the app-level handler.
  const root = getContainerRoot(container)
  const prevented = dispatchMouseEventToTree(event, mouseEventState, root)

  if (!prevented && routeMouseToFocusedIsland(event, ctx.focusManager)) return true

  // Skip app handler if a component called preventDefault()
  if (prevented) return true

  const namespacedHandler = handlers?.[event.type as keyof typeof handlers]

  if (namespacedHandler && typeof namespacedHandler === "function") {
    const result = (namespacedHandler as EventHandler<unknown, S>)(event.data, ctx)
    if (result === "exit") return false
    if (result === "flush") return "flush"
  }

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
