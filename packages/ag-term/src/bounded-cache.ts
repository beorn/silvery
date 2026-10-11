/**
 * Process-lifetime content caches: entries + bytes + age, one library.
 *
 * @cto e84ed6d7 / 2ded2ccc — every silvery cache that lives as long as the
 * process or its owner is bounded by max entries, max bytes, and max age
 * through lru-cache 11.5.2. Age is checked on read (`ttlAutopurge: false`),
 * never by a timer. DisplayWidthCache is the memo exception: its TTL is
 * age-from-insert (`updateAgeOnGet: false`); other caches pass the default
 * `true` (idle age).
 *
 * A cache states its bound in bytes, or as entries × the largest entry with
 * the product written down, never entries alone. Here: 10 000 entries ×
 * (2 bytes per key character + 48) with a 2 MiB byte cap, 10 minute TTL.
 */
import { LRUCache } from "lru-cache"

/** Non-nullish cache values — lru-cache's `V extends {}` without the `{}` literal. */
type LruValue = object | string | number | boolean | bigint | symbol

export const CACHE_MAX_ENTRIES = 10_000
/** 2 MiB — 2 bytes per key character + 48 overhead, @cto e84ed6d7 item 5. */
export const CACHE_MAX_BYTES = 2 * 1024 * 1024
export const CACHE_MAX_AGE_MS = 10 * 60 * 1000
export const CACHE_BYTES_PER_CHAR = 2
export const CACHE_ENTRY_OVERHEAD = 48
export const CACHE_MAX_KEY_CHARS = 4096
export const CACHE_MAX_ENTRY_SIZE =
  CACHE_BYTES_PER_CHAR * CACHE_MAX_KEY_CHARS + CACHE_ENTRY_OVERHEAD

export function contentKeySize(key: string): number {
  return CACHE_BYTES_PER_CHAR * key.length + CACHE_ENTRY_OVERHEAD
}

/**
 * Flatten a string so a JSC/V8 substring view cannot pin its parent rope.
 * Cache *set* copies; *get* does not (hit path).
 */
export function isolateString(text: string): string {
  if (text.length === 0) return text
  return Buffer.from(text, "utf16le").toString("utf16le")
}

export function setIsolated<V extends LruValue>(
  cache: LRUCache<string, V>,
  key: string,
  value: V,
): void {
  cache.set(isolateString(key), value)
}

export type BoundedStringCacheOptions<V extends LruValue> = {
  /** Max entries. Default 10 000. */
  max?: number
  /** Max bytes from sizeCalculation. Default 2 MiB. */
  maxSize?: number
  /** TTL ms. Default 10 minutes. */
  ttl?: number
  /**
   * Idle-age (true, default) vs insert-age (false). DisplayWidthCache is the
   * memo that passes false; other census caches keep true.
   */
  updateAgeOnGet?: boolean
  sizeCalculation?: (value: V, key: string) => number
}

export function createBoundedStringCache<V extends LruValue>(
  options?: BoundedStringCacheOptions<V>,
): LRUCache<string, V> {
  return new LRUCache<string, V>({
    max: options?.max ?? CACHE_MAX_ENTRIES,
    maxSize: options?.maxSize ?? CACHE_MAX_BYTES,
    maxEntrySize: CACHE_MAX_ENTRY_SIZE,
    sizeCalculation: options?.sizeCalculation ?? ((_value, key) => contentKeySize(key)),
    ttl: options?.ttl ?? CACHE_MAX_AGE_MS,
    ttlAutopurge: false,
    // 0, not a resolution: lru-cache arms a setTimeout on every clock read when ttlResolution > 0, so a
    // nonzero value put a timer behind each cache read and broke 'never by a timer' (pulse contract, CI #855).
    ttlResolution: 0,
    updateAgeOnGet: options?.updateAgeOnGet ?? true,
  })
}
