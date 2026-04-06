/**
 * Input Router — priority-based event dispatcher for interaction features.
 *
 * Interaction features (selection, find, copy-mode, drag) register mouse/key
 * handlers at different priorities. Events dispatch in priority order (highest
 * first). A handler claims an event by returning true, preventing lower-priority
 * handlers from seeing it.
 *
 * Also manages overlay renderers (find highlights, drag ghosts) and render
 * invalidation via an injected callback.
 *
 * @internal Not exported from the public barrel.
 */

// =============================================================================
// Types
// =============================================================================

/** Mouse event passed to registered handlers. */
export interface RouterMouseEvent {
  readonly x: number
  readonly y: number
  readonly button: number
  readonly type: "mousedown" | "mouseup" | "mousemove" | "wheel"
  readonly modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean }
}

/** Key event passed to registered handlers. */
export interface RouterKeyEvent {
  readonly key: string
  readonly modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean }
}

/** Handler that receives a mouse event. Returns true to claim (consume) the event. */
export type MouseHandler = (event: RouterMouseEvent) => boolean

/** Handler that receives a key event. Returns true to claim (consume) the event. */
export type KeyHandler = (event: RouterKeyEvent) => boolean

/** Renderer for overlay content (find highlights, selection indicators, drag ghosts). */
export type OverlayRenderer = () => void

/** A registered handler entry with priority and insertion order. */
interface HandlerEntry<T> {
  readonly priority: number
  readonly order: number
  readonly handler: T
}

/** Options for creating an InputRouter. */
export interface InputRouterOptions {
  /** Callback to trigger a render pass. Decoupled from store internals. */
  readonly invalidate: () => void
}

/** Priority-based event dispatcher for interaction features. */
export interface InputRouter {
  /** Register a mouse handler at the given priority. Returns an unregister function. */
  registerMouseHandler(priority: number, handler: MouseHandler): () => void

  /** Dispatch a mouse event to registered handlers. Returns true if any handler claimed it. */
  dispatchMouse(event: RouterMouseEvent): boolean

  /** Register a key handler at the given priority. Returns an unregister function. */
  registerKeyHandler(priority: number, handler: KeyHandler): () => void

  /** Dispatch a key event to registered handlers. Returns true if any handler claimed it. */
  dispatchKey(event: RouterKeyEvent): boolean

  /** Trigger a new output/render pass (e.g., after selection state change). */
  invalidate(): void

  /** Register an overlay renderer at the given priority. Returns an unregister function. */
  registerOverlay(priority: number, renderer: OverlayRenderer): () => void

  /** Get all overlay renderers sorted by priority (highest first). */
  getOverlays(): OverlayRenderer[]
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Compare handler entries for dispatch order:
 * - Higher priority dispatches first
 * - Same priority: lower insertion order (first registered) wins
 */
function compareEntries<T>(a: HandlerEntry<T>, b: HandlerEntry<T>): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.order - b.order
}

/**
 * Create a priority-based input router.
 *
 * The `invalidate` callback is injected by the caller (typically wired to the
 * store/render pipeline by withDomEvents). This keeps the router decoupled
 * from silvery internals.
 */
export function createInputRouter(options: InputRouterOptions): InputRouter {
  const { invalidate } = options

  let nextOrder = 0
  const mouseHandlers: HandlerEntry<MouseHandler>[] = []
  const keyHandlers: HandlerEntry<KeyHandler>[] = []
  const overlays: HandlerEntry<OverlayRenderer>[] = []

  function addEntry<T>(list: HandlerEntry<T>[], priority: number, handler: T): () => void {
    const entry: HandlerEntry<T> = { priority, order: nextOrder++, handler }
    list.push(entry)
    list.sort(compareEntries)
    return () => {
      const idx = list.indexOf(entry)
      if (idx !== -1) list.splice(idx, 1)
    }
  }

  function dispatch<T, E>(list: HandlerEntry<T>[], event: E): boolean {
    for (const entry of list) {
      if ((entry.handler as (event: E) => boolean)(event)) {
        return true
      }
    }
    return false
  }

  return {
    registerMouseHandler(priority: number, handler: MouseHandler): () => void {
      return addEntry(mouseHandlers, priority, handler)
    },

    dispatchMouse(event: RouterMouseEvent): boolean {
      return dispatch(mouseHandlers, event)
    },

    registerKeyHandler(priority: number, handler: KeyHandler): () => void {
      return addEntry(keyHandlers, priority, handler)
    },

    dispatchKey(event: RouterKeyEvent): boolean {
      return dispatch(keyHandlers, event)
    },

    invalidate,

    registerOverlay(priority: number, renderer: OverlayRenderer): () => void {
      return addEntry(overlays, priority, renderer)
    },

    getOverlays(): OverlayRenderer[] {
      // Already sorted by compareEntries (highest priority first)
      return overlays.map((entry) => entry.handler)
    },
  }
}
