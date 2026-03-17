/**
 * TerminalCache - A ListCache that pushes frozen items to terminal scrollback.
 *
 * Instead of keeping frozen items in memory, TerminalCache renders them to
 * strings and writes them to stdout. This makes frozen items part of the
 * terminal's native scrollback history, scrollable via mouse wheel, scrollbar,
 * or Shift+PageUp.
 *
 * This is a pure domain object — no React hooks, no side effects beyond
 * stdout writes. It implements the same ListCache<T> interface as
 * createListCache, so ListView can use either interchangeably.
 *
 * @example
 * ```tsx
 * const cache = createTerminalCache({
 *   render: (item, index) => `${index}: ${item.text}`,
 *   markers: true,
 * })
 * <ListView cache={cache} ... />
 * ```
 */

import type { ListCache, ListCacheConfig, ListCacheEntry } from "./list-cache"
import { OSC133 } from "./osc-markers"

/** Marker configuration for OSC 133 semantic markers around frozen items. */
export interface TerminalCacheMarkers<T = unknown> {
  /** Called before each frozen item's output. Return marker string or empty. */
  before?: (item: T, index: number) => string
  /** Called after each frozen item's output. Return marker string or empty. */
  after?: (item: T, index: number) => string
}

export interface TerminalCacheConfig<T = unknown> {
  /** Predicate: when true, item is eligible for caching (frozen to scrollback) */
  isCacheable?: (item: T, index: number) => boolean
  /** Max items to track. Default: 10_000 */
  capacity?: number
  /** Extra items to keep rendered beyond viewport. Default: 5 */
  overscan?: number
  /** Emit OSC 133 semantic markers around each frozen item.
   * true = default markers, or provide custom callbacks. */
  markers?: boolean | TerminalCacheMarkers<T>
  /** Render function: converts an item to a string for stdout output.
   * Required -- terminal cache needs to know how to render items as text. */
  render: (item: T, index: number) => string
  /** Terminal width for rendering. Default: process.stdout.columns ?? 80 */
  width?: number
  /** Output stream. Default: process.stdout */
  stdout?: { write(data: string): boolean }
}

const DEFAULT_CAPACITY = 10_000
const DEFAULT_OVERSCAN = 5

/**
 * Resolve the before/after marker strings for a given item.
 */
function resolveMarkers<T>(
  markers: boolean | TerminalCacheMarkers<T> | undefined,
  item: T,
  index: number,
): { before: string; after: string } {
  if (!markers) return { before: "", after: "" }
  if (markers === true) {
    return { before: OSC133.promptStart, after: OSC133.commandEnd(0) }
  }
  return {
    before: markers.before?.(item, index) ?? "",
    after: markers.after?.(item, index) ?? "",
  }
}

/** Create a TerminalCache -- a ListCache that pushes frozen items to terminal scrollback */
export function createTerminalCache<T>(config: TerminalCacheConfig<T>): ListCache<T> {
  const stdout = config.stdout ?? process.stdout
  const render = config.render
  const markers = config.markers

  const resolved: Required<ListCacheConfig<T>> = {
    isCacheable: config.isCacheable ?? (() => true),
    capacity: config.capacity ?? DEFAULT_CAPACITY,
    overscan: config.overscan ?? DEFAULT_OVERSCAN,
  }

  // Key -> entry lookup
  let entries = new Map<string | number, ListCacheEntry>()
  // Manually frozen keys (via imperative freeze())
  let manuallyFrozen = new Set<string | number>()
  // Current frozen prefix length
  let _frozenCount = 0

  // Event listeners
  const listeners = {
    freeze: new Set<(entry: ListCacheEntry) => void>(),
    evict: new Set<(entry: ListCacheEntry) => void>(),
  }

  function emit(event: "freeze" | "evict", entry: ListCacheEntry): void {
    for (const handler of listeners[event]) {
      handler(entry)
    }
  }

  function evictOldest(): void {
    while (entries.size > resolved.capacity) {
      // Evict the first (oldest) entry
      const first = entries.entries().next()
      if (first.done) break
      const [key, entry] = first.value
      entries.delete(key)
      manuallyFrozen.delete(key)
      emit("evict", entry)
    }
  }

  /**
   * Write a single frozen item to stdout with optional OSC 133 markers.
   * Each line gets \r\n line endings for correct terminal rendering.
   */
  function writeToScrollback(item: T, index: number): void {
    const { before, after } = resolveMarkers(markers, item, index)
    if (before) stdout.write(before)
    const text = render(item, index) + "\n"
    stdout.write(text.replace(/\n/g, "\r\n"))
    if (after) stdout.write(after)
  }

  return {
    get config(): Required<ListCacheConfig<T>> {
      return resolved
    },

    get frozenCount(): number {
      return _frozenCount
    },

    update(items: T[], getKey: (item: T, index: number) => string | number): number {
      const prevFrozenCount = _frozenCount

      // Compute contiguous frozen prefix: items from index 0 where either
      // isCacheable returns true OR the key is in the manually-frozen set
      let newFrozenCount = 0
      for (let i = 0; i < items.length; i++) {
        const key = getKey(items[i]!, i)
        const cacheable = resolved.isCacheable(items[i]!, i) || manuallyFrozen.has(key)
        if (!cacheable) break
        newFrozenCount = i + 1
      }

      // Update entries for the frozen prefix
      const newEntries = new Map<string | number, ListCacheEntry>()
      for (let i = 0; i < newFrozenCount; i++) {
        const key = getKey(items[i]!, i)
        const entry: ListCacheEntry = { key, index: i }
        newEntries.set(key, entry)
      }

      // Fire evict events for entries that were in the old map but not in the new one
      for (const [key, entry] of entries) {
        if (!newEntries.has(key)) {
          emit("evict", entry)
        }
      }

      // Write newly frozen items to terminal scrollback and fire freeze events
      for (let i = prevFrozenCount; i < newFrozenCount; i++) {
        const key = getKey(items[i]!, i)
        const entry = newEntries.get(key)!
        writeToScrollback(items[i]!, i)
        if (!entries.has(key)) {
          emit("freeze", entry)
        }
      }

      entries = newEntries
      _frozenCount = newFrozenCount

      evictOldest()

      return _frozenCount
    },

    getEntry(key: string | number): ListCacheEntry | undefined {
      return entries.get(key)
    },

    clear(): void {
      for (const [, entry] of entries) {
        emit("evict", entry)
      }
      entries = new Map()
      manuallyFrozen = new Set()
      _frozenCount = 0
    },

    invalidateAll(): void {
      // Reset frozen count and entries for re-evaluation on next update().
      // Already-written items remain in terminal scrollback (can't un-write them).
      _frozenCount = 0
      entries = new Map()
    },

    freeze(key: string | number): void {
      manuallyFrozen.add(key)
    },

    on(event: "freeze" | "evict", handler: (entry: ListCacheEntry) => void): () => void {
      listeners[event].add(handler)
      return () => {
        listeners[event].delete(handler)
      }
    },
  }
}
