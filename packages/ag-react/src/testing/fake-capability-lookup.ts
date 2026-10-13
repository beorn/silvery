/**
 * @fakes @silvery/ag-react
 *
 * A {@link CapabilityLookup} for tests of the hooks that read one
 * (`useCopyModeState`, `useDragState`): a real symbol-keyed lookup over a Map,
 * the same shape `createCapabilityRegistry().get` exposes. A member added to
 * `CapabilityLookup` fails to compile here; no cast stands in for the contract
 * (the one `as` is the generic narrowing `get` needs, shared with the real
 * registry).
 */
import type { CapabilityLookup } from "../context.ts"

export function createFakeCapabilityLookup(entries: [symbol, unknown][] = []): CapabilityLookup {
  const capabilities = new Map<symbol, unknown>(entries)
  return {
    get<T>(key: symbol): T | undefined {
      return capabilities.get(key) as T | undefined
    },
  } satisfies CapabilityLookup
}
