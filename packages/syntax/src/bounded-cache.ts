/**
 * Process-lifetime content caches: entries + bytes + age, one library.
 *
 * Exact pin of lru-cache 11.5.2 (@cto e84ed6d7 / 2ded2ccc). @silvery/syntax
 * cannot import @silvery/ag-term, so this factory is the same contract as
 * packages/ag-term/src/bounded-cache.ts.
 */
import { LRUCache } from "lru-cache"

/** Non-nullish cache values — lru-cache's `V extends {}` without the `{}` literal. */
type LruValue = object | string | number | boolean | bigint | symbol

export const CACHE_MAX_ENTRIES = 10_000
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
  max?: number
  maxSize?: number
  ttl?: number
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
    ttlResolution: 1000,
    updateAgeOnGet: options?.updateAgeOnGet ?? true,
  })
}
