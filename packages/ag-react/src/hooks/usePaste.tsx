/**
 * usePaste — React context for paste event handling.
 *
 * Components register a PasteHandler via PasteProvider. When a bracketed
 * paste event arrives, it is routed to the nearest ancestor PasteHandler.
 *
 * PasteEvents include source detection: "internal" when the paste matches
 * the last copy from this app (with rich ClipboardData), "external" otherwise.
 *
 * @example
 * ```tsx
 * const handler: PasteHandler = {
 *   onPaste(event) {
 *     if (event.source === "internal" && event.data?.markdown) {
 *       insertMarkdown(event.data.markdown)
 *     } else {
 *       insertPlainText(event.text)
 *     }
 *   }
 * }
 *
 * <PasteProvider handler={handler}>
 *   <MyEditor />
 * </PasteProvider>
 * ```
 */

import React, { createContext, useContext, type ReactNode } from "react"
import type { PasteEvent } from "@silvery/ag-term/semantic-copy"

// ============================================================================
// Types
// ============================================================================

/**
 * Handler for paste events. Register via PasteProvider.
 */
export interface PasteHandler {
  onPaste(event: PasteEvent): void
}

// ============================================================================
// Context
// ============================================================================

const PasteContext = createContext<PasteHandler | null>(null)

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Registers a paste handler for its subtree.
 * When a bracketed paste event arrives, it is routed to the nearest
 * ancestor PasteHandler.
 */
export function PasteProvider({
  handler,
  children,
}: {
  handler: PasteHandler
  children: ReactNode
}) {
  return React.createElement(PasteContext.Provider, { value: handler }, children)
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the nearest ancestor PasteHandler.
 * Returns null if no handler is in the tree above this component.
 */
export function usePaste(): PasteHandler | null {
  return useContext(PasteContext)
}
