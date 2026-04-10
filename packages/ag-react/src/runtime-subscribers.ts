/**
 * RuntimeContext subscriber types — shared by render.tsx and InputBoundary.tsx.
 *
 * These are the internal callback types for the RuntimeContext event bus.
 * NOT the public useInput/usePaste hook types — those are in their respective hook files.
 *
 * See docs/guide/input-architecture.md for the full event pipeline.
 */

import type { Key } from "@silvery/ag/keys"

/** Internal callback type for RuntimeContext "input" event subscribers. */
export type InputCallback = (input: string, key: Key) => void

/** Internal callback type for RuntimeContext "paste" event subscribers. */
export type PasteCallback = (text: string) => void

export interface SubscriberList {
  input: Set<InputCallback>
  paste: Set<PasteCallback>
}

export function createSubscriberList(): SubscriberList {
  return { input: new Set(), paste: new Set() }
}
