/**
 * usePasteEvents — bridges runtime paste events to PasteHandler context.
 *
 * Subscribes to the runtime's paste events, enriches with internal clipboard
 * data, and routes to the nearest ancestor PasteHandler.
 *
 * Call this hook in your app root to enable paste routing.
 *
 * @example
 * ```tsx
 * function AppRoot() {
 *   usePasteEvents()
 *   return <MyApp />
 * }
 * ```
 */

import { useContext, useEffect, useRef } from "react"
import { ChainAppContext } from "../context"
import { createPasteEvent, getInternalClipboard } from "@silvery/ag-term/copy-extraction"
import { usePaste } from "./usePaste"

/**
 * Bridge runtime paste events to the nearest PasteHandler.
 *
 * When a bracketed paste event arrives from the terminal:
 * 1. Checks internal clipboard to detect internal copies
 * 2. Creates a PasteEvent with source and rich data
 * 3. Routes to nearest PasteHandler via context
 * 4. If no PasteHandler, the event is silently ignored
 */
export function usePasteEvents(): void {
  const chain = useContext(ChainAppContext)
  const pasteHandler = usePaste()

  // Use ref for handler to avoid teardown/setup on every render
  const handlerRef = useRef(pasteHandler)
  handlerRef.current = pasteHandler

  useEffect(() => {
    if (!chain) return
    return chain.paste.register((text: string) => {
      const handler = handlerRef.current
      if (!handler) return
      const clipboard = getInternalClipboard()
      const event = createPasteEvent(text, clipboard)
      handler.onPaste(event)
    })
  }, [chain])
}
