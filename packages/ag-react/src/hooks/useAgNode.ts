/**
 * useAgNode — access the current component's AgNode and its reactive signals.
 *
 * Returns the AgNode and its rect signals (boxRect, scrollRect, screenRect).
 * Signals are alien-signals writable functions — call with no args to read.
 * Use inside an `effect()` from `@silvery/signals` for reactive subscriptions.
 *
 * Returns null if called outside a silvery component tree.
 */

import { useContext } from "react"
import { NodeContext } from "../context"
import { getLayoutSignals, type LayoutSignals } from "@silvery/ag/layout-signals"
import type { AgNode } from "@silvery/ag/types"

export interface AgNodeHandle {
  /** The underlying AgNode */
  readonly node: AgNode
  /** Reactive layout signals — rects + textContent + focused */
  readonly signals: LayoutSignals
}

export function useAgNode(): AgNodeHandle | null {
  const node = useContext(NodeContext)
  if (!node) return null
  const signals = getLayoutSignals(node)
  return { node, signals }
}
