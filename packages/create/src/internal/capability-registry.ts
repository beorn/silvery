/**
 * Capability Registry — symbol-keyed service registry for cross-feature communication.
 *
 * Each createApp instance gets its own registry. Interaction features use it to
 * discover each other (e.g., selection looks up clipboard capability).
 *
 * @internal Not exported from the public barrel.
 */

// =============================================================================
// Types
// =============================================================================

/** Symbol-keyed service registry for cross-feature communication. */
export interface CapabilityRegistry {
  /** Register a capability. Overwrites any existing registration for the same key. */
  register<T>(key: symbol, capability: T): void

  /** Look up a capability. Returns undefined if not registered. */
  get<T>(key: symbol): T | undefined
}

// =============================================================================
// Implementation
// =============================================================================

/** Create a new capability registry (one per app instance). */
export function createCapabilityRegistry(): CapabilityRegistry {
  const capabilities = new Map<symbol, unknown>()

  return {
    register<T>(key: symbol, capability: T): void {
      capabilities.set(key, capability)
    },

    get<T>(key: symbol): T | undefined {
      return capabilities.get(key) as T | undefined
    },
  }
}
