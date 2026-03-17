/**
 * useModifierKeys — track held modifier key state.
 *
 * Returns which modifier keys (Cmd/Super, Ctrl, Alt, Shift) are currently held.
 * Tracks state from key events, so accuracy depends on Kitty protocol flags:
 *
 * - DISAMBIGUATE only: updates when any key is pressed with modifiers held
 * - REPORT_ALL_KEYS + REPORT_EVENTS: updates on modifier-only press/release
 *
 * The `enabled` option controls subscription — when false, the component
 * never re-renders from modifier changes. Use this to avoid re-rendering
 * many components when only one needs modifier state (e.g., only the
 * hovered link subscribes).
 *
 * @example
 * ```tsx
 * function Link({ href, children }) {
 *   const [hovered, setHovered] = useState(false)
 *   // Only subscribe when hovered — zero cost for non-hovered links
 *   const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
 *   const armed = hovered && cmdHeld
 *   return <Text underline={armed} onMouseEnter={() => setHovered(true)} ...>
 * }
 * ```
 */

import { useContext, useMemo, useSyncExternalStore } from "react"
import { RuntimeContext, type RuntimeContextValue } from "../context"
import type { Key } from "@silvery/tea/keys"

// ============================================================================
// Types
// ============================================================================

export interface ModifierState {
  /** Super/Cmd key (macOS Cmd, requires Kitty protocol) */
  super: boolean
  /** Ctrl key */
  ctrl: boolean
  /** Alt/Option key */
  alt: boolean
  /** Shift key */
  shift: boolean
}

export interface UseModifierKeysOptions {
  /**
   * Enable or disable subscription to modifier changes.
   * When false, returns the current snapshot but never triggers re-renders.
   * @default true
   */
  enabled?: boolean
}

// ============================================================================
// Global Singleton Store (per runtime)
// ============================================================================

const INITIAL: ModifierState = { super: false, ctrl: false, alt: false, shift: false }

/**
 * Last known modifier state (global, updated by any runtime's modifier store).
 * Read this from imperative code (event handlers, TEA update functions)
 * that can't use the useModifierKeys React hook.
 */
export let lastModifierState: Readonly<ModifierState> = INITIAL

interface ModifierStore {
  subscribe: (cb: () => void) => () => void
  getSnapshot: () => ModifierState
}

const stores = new WeakMap<RuntimeContextValue, ModifierStore>()

function getOrCreateStore(rt: RuntimeContextValue): ModifierStore {
  let store = stores.get(rt)
  if (store) return store

  let state = INITIAL
  const listeners = new Set<() => void>()

  function notify() {
    for (const cb of listeners) cb()
  }

  // Track modifiers from every key event
  rt.on("input", (_input: string, key: Key) => {
    const next: ModifierState = {
      super: !!key.super,
      ctrl: !!key.ctrl,
      alt: !!key.meta,
      shift: !!key.shift,
    }
    if (
      next.super !== state.super ||
      next.ctrl !== state.ctrl ||
      next.alt !== state.alt ||
      next.shift !== state.shift
    ) {
      state = next
      lastModifierState = next
      notify()
    }
  })

  // Reset on terminal focus loss (avoids stuck modifiers)
  rt.on("focus", (focused: boolean) => {
    if (!focused && (state.super || state.ctrl || state.alt || state.shift)) {
      state = INITIAL
      lastModifierState = INITIAL
      notify()
    }
  })

  store = {
    subscribe: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot: () => state,
  }
  stores.set(rt, store)
  return store
}

/**
 * Read the current modifier state imperatively (outside React).
 * For use in event handlers, TEA update functions, etc.
 */
export function getModifierState(rt: RuntimeContextValue): ModifierState {
  const store = stores.get(rt)
  return store ? store.getSnapshot() : INITIAL
}

// ============================================================================
// No-op subscribe (for disabled state)
// ============================================================================

const noopUnsubscribe = () => {}
const noopSubscribe = (_cb: () => void) => noopUnsubscribe

// ============================================================================
// Hook
// ============================================================================

/**
 * Track which modifier keys are currently held.
 *
 * When `enabled` is false, the hook returns the current snapshot but does
 * not subscribe to changes — the component never re-renders from modifier
 * key events. This enables the "only the hovered element subscribes" pattern.
 */
// TODO: When silvery state is signal-based, derive `armed` as a computed signal
// (hovered && cmdHeld) so the Link component never re-renders — only the
// underline style subscription triggers a targeted repaint.
export function useModifierKeys(opts?: UseModifierKeysOptions): ModifierState {
  const enabled = opts?.enabled ?? true
  const rt = useContext(RuntimeContext)

  // Memoize the store instance (stable across renders for same runtime)
  const store = useMemo(() => (rt ? getOrCreateStore(rt) : null), [rt])

  return useSyncExternalStore(
    enabled && store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : () => INITIAL,
    () => INITIAL, // server snapshot
  )
}
