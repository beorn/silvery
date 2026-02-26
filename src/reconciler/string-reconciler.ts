/**
 * Separate React reconciler instance for renderStringSync.
 *
 * renderStringSync may be called from within React effects (e.g., useScrollback
 * freezing items to scrollback). If it uses the same reconciler singleton as the
 * main render tree, this causes re-entrancy: the nested reconciliation interferes
 * with the outer one, producing empty output.
 *
 * By using a dedicated reconciler instance, renderStringSync operates on an
 * independent fiber tree with no shared reconciler state.
 */

// @ts-expect-error - react-reconciler has no type declarations
import Reconciler from "react-reconciler"
import { hostConfig } from "./host-config.js"

/**
 * Dedicated reconciler for string rendering.
 *
 * Uses the same host config functions but overrides isPrimaryRenderer to false,
 * since this is a secondary renderer used only for one-shot string rendering.
 * This avoids conflicts with the main reconciler's hook ownership.
 */
export const stringReconciler = Reconciler({
  ...hostConfig,
  isPrimaryRenderer: false,
})
