/**
 * Focus Manager — standalone state container for the silvery focus system.
 *
 * Pure TypeScript, no React dependency. The subscribe/getSnapshot pattern
 * enables useSyncExternalStore in hooks.
 *
 * Replaces the flat focus list in context.ts (FocusContext with focusables Map).
 */

import type { AgNode, Rect } from "./types"
import {
  findByTestID,
  findFocusableAncestor,
  getTabOrder,
  findSpatialTarget,
  getExplicitFocusLink,
} from "./focus-queries"
import { setFocused } from "./interactive-signals"
import { syncFocusedSignal } from "./layout-signals"

// ============================================================================
// Types
// ============================================================================

export type FocusOrigin = "keyboard" | "mouse" | "programmatic"

/**
 * Callback fired when focus changes. Used by the runtime to dispatch
 * DOM-level focus/blur events without coupling FocusManager to the event system.
 *
 * @param oldNode - The node losing focus (null if nothing was focused)
 * @param newNode - The node gaining focus (null on blur)
 * @param origin - How focus was acquired
 */
export type FocusChangeCallback = (
  oldNode: AgNode | null,
  newNode: AgNode | null,
  origin: FocusOrigin | null,
) => void

export interface FocusSnapshot {
  activeId: string | null
  previousId: string | null
  focusOrigin: FocusOrigin | null
  scopeStack: readonly string[]
  /** The currently active peer scope (WPF FocusScope model) */
  activeScopeId: string | null
}

export interface FocusManagerOptions {
  /** Called when focus changes — wire up event dispatch here */
  onFocusChange?: FocusChangeCallback
}

/**
 * Options for registering a hook-based (virtual) focusable.
 *
 * Hook focusables are registered via React hooks (e.g. `useFocus()` in the
 * Ink compat layer) rather than by the `focusable` prop on a tree node. They
 * participate in Tab cycling but don't have a backing `AgNode` — activeId
 * tracking is by id only, and `activeElement` is null when a hook focusable
 * is the active target.
 */
export interface HookFocusableOptions {
  /** Registration is inert when false — skipped in tab order, never reports focused */
  isActive?: boolean
  /** Focus this id when registered (only when isActive !== false) */
  autoFocus?: boolean
}

export interface FocusManager {
  /** Currently focused node */
  readonly activeElement: AgNode | null
  /** testID of the currently focused node */
  readonly activeId: string | null
  /** Previously focused node */
  readonly previousElement: AgNode | null
  /** testID of the previously focused node */
  readonly previousId: string | null
  /** How focus was most recently acquired */
  readonly focusOrigin: FocusOrigin | null
  /** Stack of active focus scope IDs */
  readonly scopeStack: readonly string[]
  /** Map of scope ID -> last focused testID within that scope */
  readonly scopeMemory: Readonly<Record<string, string>>

  /** Focus a specific node */
  focus(node: AgNode, origin?: FocusOrigin): void
  /** Focus a node by testID (requires root for tree search) */
  focusById(id: string, root: AgNode, origin?: FocusOrigin): void
  /**
   * Focus a hook-registered (virtual) id directly without tree traversal.
   * Unlike `focusById`, this never needs a root — used by `useFocus()` hooks
   * that track focus by id only.
   */
  focusVirtualId(id: string, origin?: FocusOrigin): void
  /** Clear focus */
  blur(): void

  // ---- Hook-based (virtual) focusables ----

  /**
   * Register a hook-based focusable id (e.g. from `useFocus()` in Ink compat).
   *
   * Hook focusables form a flat list alongside the tree-based focusables.
   * `focusNext`/`focusPrev` interleave: tree focusables come first (document
   * order), then hook focusables (registration order). A single unified tab
   * cycle walks both.
   *
   * Returns an unregister callback (safe to call on effect cleanup).
   */
  registerHookFocusable(id: string, options?: HookFocusableOptions): () => void
  /** Update an existing hook-focusable's active state. */
  setHookFocusableActive(id: string, isActive: boolean): void
  /** Whether any hook focusables are currently registered. */
  readonly hasHookFocusables: boolean
  /**
   * Global focus enable (Ink compat). When false, `focusNext`/`focusPrev`
   * become no-ops for hook-registered focusables. Tree-based focusables
   * ignore this flag — apps using `useFocusable` are not affected.
   */
  readonly hookFocusEnabled: boolean
  setHookFocusEnabled(enabled: boolean): void

  /**
   * Handle a subtree being removed from the tree.
   * If the focused node (or previous node) is within the removed subtree,
   * clear the reference to prevent dead node retention and broken navigation.
   */
  handleSubtreeRemoved(removedRoot: AgNode): void

  /** Push a focus scope onto the stack */
  enterScope(scopeId: string): void
  /** Pop the current focus scope */
  exitScope(): void

  /** The currently active peer scope ID (WPF FocusScope model) */
  readonly activeScopeId: string | null
  /**
   * Activate a peer focus scope. Saves current focus in the old scope's memory,
   * switches to the new scope, and restores the remembered focus (or focuses
   * the first focusable element in the scope subtree).
   */
  activateScope(scopeId: string, root: AgNode): void

  /** Get the testID path from focused node to root */
  getFocusPath(root: AgNode): string[]
  /** Check if a subtree rooted at testID contains the focused node */
  hasFocusWithin(root: AgNode, testID: string): boolean

  /** Focus the next focusable node in tab order */
  focusNext(root: AgNode, scope?: AgNode): void
  /** Focus the previous focusable node in tab order */
  focusPrev(root: AgNode, scope?: AgNode): void
  /** Focus in a spatial direction (up/down/left/right) */
  focusDirection(
    root: AgNode,
    direction: "up" | "down" | "left" | "right",
    layoutFn?: (node: AgNode) => Rect | null,
  ): void

  /** Subscribe for React integration (useSyncExternalStore) */
  subscribe(listener: () => void): () => void
  /** Get immutable snapshot for useSyncExternalStore */
  getSnapshot(): FocusSnapshot
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Internal shape for a hook-registered focusable.
 * Order in the list reflects registration order (Ink-compatible tab order).
 */
interface HookFocusable {
  id: string
  isActive: boolean
}

export function createFocusManager(options?: FocusManagerOptions): FocusManager {
  const onFocusChange = options?.onFocusChange

  // Internal state
  let activeElement: AgNode | null = null
  let activeId: string | null = null
  let previousElement: AgNode | null = null
  let previousId: string | null = null
  let focusOrigin: FocusOrigin | null = null
  const scopeStack: string[] = []
  const scopeMemory: Record<string, string> = {}
  let activeScopeId: string | null = null

  // Hook-registered focusables (flat list, Ink-style).
  const hookFocusables: HookFocusable[] = []
  // Global focus enable (Ink compat — `enableFocus()` / `disableFocus()` knob).
  let hookFocusEnabled = true

  // Subscriber management
  const listeners = new Set<() => void>()
  let snapshot: FocusSnapshot | null = null
  /** Counter incremented on every notify(); used by activateScope to detect inner notifications. */
  let notifyCount = 0

  function notify(): void {
    snapshot = null // Invalidate cached snapshot
    notifyCount++
    for (const listener of listeners) {
      listener()
    }
  }

  function getTestID(node: AgNode): string | null {
    const props = node.props as Record<string, unknown>
    return typeof props.testID === "string" ? props.testID : null
  }

  // ---- Focus operations ----

  function focus(node: AgNode, origin: FocusOrigin = "programmatic"): void {
    // Skip if already focused on this node
    if (activeElement === node) {
      // Still update origin if different
      if (focusOrigin !== origin) {
        focusOrigin = origin
        notify()
      }
      return
    }

    const oldElement = activeElement
    previousElement = activeElement
    previousId = activeId
    activeElement = node
    activeId = getTestID(node)
    focusOrigin = origin

    // Update interactive state on affected nodes
    if (oldElement) {
      setFocused(oldElement, false)
      syncFocusedSignal(oldElement, false)
    }
    setFocused(node, true)
    syncFocusedSignal(node, true)

    // Remember this focus in the current scope
    if (activeId && scopeStack.length > 0) {
      scopeMemory[scopeStack[scopeStack.length - 1]!] = activeId
    }

    notify()

    // Fire focus change callback (after state is updated)
    onFocusChange?.(oldElement, node, origin)
  }

  function focusById(id: string, root: AgNode, origin: FocusOrigin = "programmatic"): void {
    const node = findByTestID(root, id)
    if (node) {
      // Walk up to the nearest focusable ancestor if the found node isn't focusable
      const focusable = findFocusableAncestor(node)
      if (focusable) {
        focus(focusable, origin)
        return
      }
    }
    // Virtual focus: set the ID without a DOM node. This enables named focus
    // targets (e.g. "board-area", "detail-pane") without requiring wrapper Boxes
    // that would disrupt layout.

    // Idempotent: skip if already virtually focused on this ID (prevents infinite
    // re-render loops when focus() is called during render).
    if (activeId === id && !activeElement) return

    const oldElement = activeElement
    previousElement = activeElement
    previousId = activeId
    activeElement = null
    activeId = id
    focusOrigin = origin

    // Update interactive state — old element loses focus, no new node to set
    if (oldElement) {
      setFocused(oldElement, false)
      syncFocusedSignal(oldElement, false)
    }

    notify()

    // Fire focus change callback (old element blurs, no new node for virtual focus)
    onFocusChange?.(oldElement, null, origin)
  }

  function blur(): void {
    if (!activeElement && !activeId) return

    const oldElement = activeElement
    previousElement = activeElement
    previousId = activeId
    activeElement = null
    activeId = null
    focusOrigin = null

    // Update interactive state — old element loses focus
    if (oldElement) {
      setFocused(oldElement, false)
      syncFocusedSignal(oldElement, false)
    }

    notify()

    // Fire focus change callback (after state is updated)
    onFocusChange?.(oldElement, null, null)
  }

  // ---- Hook-based (virtual) focusables ----

  /**
   * Set the focused target to a hook-registered id directly (no tree lookup).
   * activeElement becomes null (no backing node), activeId is the hook id.
   */
  function focusVirtualId(id: string, origin: FocusOrigin = "programmatic"): void {
    if (activeId === id && !activeElement) {
      if (focusOrigin !== origin) {
        focusOrigin = origin
        notify()
      }
      return
    }
    const oldElement = activeElement
    previousElement = activeElement
    previousId = activeId
    activeElement = null
    activeId = id
    focusOrigin = origin

    if (oldElement) {
      setFocused(oldElement, false)
      syncFocusedSignal(oldElement, false)
    }

    notify()

    onFocusChange?.(oldElement, null, origin)
  }

  function unregisterHookFocusable(id: string): void {
    const idx = hookFocusables.findIndex((f) => f.id === id)
    if (idx === -1) return
    hookFocusables.splice(idx, 1)
    // Clear active focus if the removed id was focused.
    if (activeId === id && !activeElement) {
      previousId = activeId
      activeId = null
      focusOrigin = null
      notify()
      onFocusChange?.(null, null, null)
      return
    }
    notify()
  }

  function registerHookFocusable(id: string, opts: HookFocusableOptions = {}): () => void {
    const { isActive = true, autoFocus = false } = opts

    // Dedup by id — last registration wins (matches Ink behavior on re-mount).
    const existing = hookFocusables.findIndex((f) => f.id === id)
    if (existing !== -1) {
      // Skip notification if nothing changed (prevents render loops)
      if (hookFocusables[existing]!.isActive === isActive && !autoFocus) {
        return () => unregisterHookFocusable(id)
      }
      hookFocusables[existing] = { id, isActive }
    } else {
      hookFocusables.push({ id, isActive })
    }

    if (autoFocus && isActive && activeId === null) {
      focusVirtualId(id, "programmatic")
    } else {
      notify()
    }

    return () => unregisterHookFocusable(id)
  }

  function setHookFocusableActive(id: string, isActive: boolean): void {
    const entry = hookFocusables.find((f) => f.id === id)
    if (!entry) return
    if (entry.isActive === isActive) return
    entry.isActive = isActive
    // If the active virtual id was deactivated, clear it.
    if (!isActive && activeId === id && !activeElement) {
      previousId = activeId
      activeId = null
      focusOrigin = null
      notify()
      onFocusChange?.(null, null, null)
      return
    }
    notify()
  }

  function setHookFocusEnabled(enabled: boolean): void {
    if (hookFocusEnabled === enabled) return
    hookFocusEnabled = enabled
    notify()
  }

  // ---- Subtree removal ----

  /**
   * Check if a node is the given target or contains it as a descendant.
   */
  function subtreeContains(subtreeRoot: AgNode, target: AgNode): boolean {
    if (subtreeRoot === target) return true
    for (const child of subtreeRoot.children) {
      if (subtreeContains(child, target)) return true
    }
    return false
  }

  /**
   * Handle a subtree being removed from the tree. If the active or previous
   * element lives within the removed subtree, clear the dangling reference.
   * This prevents dead node retention and broken navigation (indexOf → -1).
   */
  function handleSubtreeRemoved(removedRoot: AgNode): void {
    let changed = false

    if (activeElement && subtreeContains(removedRoot, activeElement)) {
      const oldElement = activeElement
      // Clear interactive focus state before removing reference
      setFocused(oldElement, false)
      syncFocusedSignal(oldElement, false)
      previousElement = activeElement
      previousId = activeId
      activeElement = null
      activeId = null
      focusOrigin = null
      changed = true
      onFocusChange?.(oldElement, null, null)
    }

    if (previousElement && subtreeContains(removedRoot, previousElement)) {
      previousElement = null
      previousId = null
      changed = true
    }

    if (changed) {
      notify()
    }
  }

  // ---- Scope management ----

  function enterScope(scopeId: string): void {
    scopeStack.push(scopeId)
    notify()
  }

  function exitScope(): void {
    const exited = scopeStack.pop()
    if (exited === undefined) return

    // Restore focus to the remembered element in the parent scope
    // (Caller is responsible for providing root to restore if needed)
    notify()
  }

  // ---- Peer scope activation (WPF FocusScope model) ----

  function activateScope(scopeId: string, root: AgNode): void {
    // Save current focus in the outgoing scope's memory
    if (activeScopeId && activeId) {
      scopeMemory[activeScopeId] = activeId
    }

    // Switch scope
    activeScopeId = scopeId

    // Restore focus: remembered element, or first focusable in scope.
    // Track whether notify() fired during focus/focusById to avoid double-notify.
    const countBefore = notifyCount
    const remembered = scopeMemory[scopeId]
    if (remembered) {
      focusById(remembered, root, "programmatic")
    } else {
      const scopeNode = findByTestID(root, scopeId)
      if (scopeNode) {
        const order = getTabOrder(root, scopeNode)
        if (order.length > 0) {
          focus(order[0]!, "programmatic")
        }
      }
    }

    // Only notify if focus/focusById didn't already notify.
    if (notifyCount === countBefore) {
      notify()
    }
  }

  // ---- Tree queries ----

  function getFocusPath(root: AgNode): string[] {
    if (!activeElement) return []

    const path: string[] = []
    let current: AgNode | null = activeElement
    while (current && current !== root.parent) {
      const id = getTestID(current)
      if (id) path.push(id)
      current = current.parent
    }
    return path
  }

  function hasFocusWithin(root: AgNode, testID: string): boolean {
    if (!activeElement) return false

    // Find the node with the given testID
    const target = findByTestID(root, testID)
    if (!target) return false

    // Walk up from activeElement to see if we pass through target
    let current: AgNode | null = activeElement
    while (current) {
      if (current === target) return true
      current = current.parent
    }
    return false
  }

  // ---- Navigation ----

  /**
   * Resolve the effective scope node for tab navigation.
   * If an explicit scope is provided, use it. Otherwise, if the scopeStack
   * is non-empty, find the topmost scope node in the tree by testID.
   */
  function resolveScope(root: AgNode, explicitScope?: AgNode): AgNode | undefined {
    if (explicitScope) return explicitScope

    if (scopeStack.length > 0) {
      const scopeId = scopeStack[scopeStack.length - 1]!
      const scopeNode = findByTestID(root, scopeId)
      if (scopeNode) return scopeNode
    }

    return undefined
  }

  /**
   * Unified tab entry — either a tree-based AgNode or a hook-registered id.
   * Tree focusables come first (document order), then hook focusables
   * (registration order). Inactive hook focusables are excluded.
   */
  type TabEntry = { kind: "node"; node: AgNode } | { kind: "hook"; id: string }

  function buildTabEntries(root: AgNode, scope?: AgNode): TabEntry[] {
    const effectiveScope = resolveScope(root, scope)
    const nodes = getTabOrder(root, effectiveScope)
    const entries: TabEntry[] = nodes.map((node) => ({ kind: "node", node }))
    // Hook focusables are only included when no explicit tree scope is active —
    // they're inherently scope-less. Skip inactive or when globally disabled.
    // Dedup: skip hook focusables whose id matches a tree node's testID —
    // the component is already in the tab order via the tree scan.
    if (!effectiveScope && hookFocusEnabled) {
      const treeIds = new Set(
        nodes
          .map((n) => (n.props as Record<string, unknown>).testID as string | undefined)
          .filter(Boolean),
      )
      for (const entry of hookFocusables) {
        if (entry.isActive && !treeIds.has(entry.id)) entries.push({ kind: "hook", id: entry.id })
      }
    }
    return entries
  }

  function currentTabIndex(entries: TabEntry[]): number {
    if (activeElement) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!
        if (e.kind === "node" && e.node === activeElement) return i
      }
      return -1
    }
    if (activeId) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!
        if (e.kind === "hook" && e.id === activeId) return i
      }
    }
    return -1
  }

  function focusTabEntry(entry: TabEntry, origin: FocusOrigin): void {
    if (entry.kind === "node") {
      focus(entry.node, origin)
    } else {
      focusVirtualId(entry.id, origin)
    }
  }

  function focusNext(root: AgNode, scope?: AgNode): void {
    const entries = buildTabEntries(root, scope)
    if (entries.length === 0) return

    const currentIndex = currentTabIndex(entries)
    if (currentIndex === -1) {
      // Nothing focused — focus the first entry
      focusTabEntry(entries[0]!, "keyboard")
      return
    }

    const nextIndex = (currentIndex + 1) % entries.length
    focusTabEntry(entries[nextIndex]!, "keyboard")
  }

  function focusPrev(root: AgNode, scope?: AgNode): void {
    const entries = buildTabEntries(root, scope)
    if (entries.length === 0) return

    const currentIndex = currentTabIndex(entries)
    if (currentIndex === -1) {
      // Nothing focused — focus the last entry
      focusTabEntry(entries[entries.length - 1]!, "keyboard")
      return
    }

    const prevIndex = currentIndex <= 0 ? entries.length - 1 : currentIndex - 1
    focusTabEntry(entries[prevIndex]!, "keyboard")
  }

  function focusDirection(
    root: AgNode,
    direction: "up" | "down" | "left" | "right",
    layoutFn?: (node: AgNode) => Rect | null,
  ): void {
    if (!activeElement) return

    // Check for explicit focus link first
    const explicitTarget = getExplicitFocusLink(activeElement, direction)
    if (explicitTarget) {
      focusById(explicitTarget, root, "keyboard")
      return
    }

    // Fall back to spatial navigation
    const candidates = getTabOrder(root)
    const resolvedLayoutFn = layoutFn ?? ((node: AgNode) => node.scrollRect)
    const target = findSpatialTarget(activeElement, direction, candidates, resolvedLayoutFn)
    if (target) {
      focus(target, "keyboard")
    }
  }

  // ---- Subscribe/snapshot for useSyncExternalStore ----

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function getSnapshot(): FocusSnapshot {
    if (!snapshot) {
      snapshot = {
        activeId,
        previousId,
        focusOrigin,
        scopeStack: [...scopeStack],
        activeScopeId,
      }
    }
    return snapshot
  }

  // ---- Public interface ----

  return {
    get activeElement() {
      return activeElement
    },
    get activeId() {
      return activeId
    },
    get previousElement() {
      return previousElement
    },
    get previousId() {
      return previousId
    },
    get focusOrigin() {
      return focusOrigin
    },
    get scopeStack() {
      return [...scopeStack] as readonly string[]
    },
    get scopeMemory() {
      return scopeMemory as Readonly<Record<string, string>>
    },
    get activeScopeId() {
      return activeScopeId
    },

    focus,
    focusById,
    focusVirtualId,
    blur,
    handleSubtreeRemoved,

    enterScope,
    exitScope,
    activateScope,

    getFocusPath,
    hasFocusWithin,

    focusNext,
    focusPrev,
    focusDirection,

    subscribe,
    getSnapshot,

    // Hook-based focusables (Ink compat)
    registerHookFocusable,
    setHookFocusableActive,
    get hasHookFocusables() {
      return hookFocusables.length > 0
    },
    get hookFocusEnabled() {
      return hookFocusEnabled
    },
    setHookFocusEnabled,
  }
}
