/**
 * usePasteCallback — subscribe to bracketed paste events.
 *
 * Simple callback-based paste hook for run() apps.
 * For component composition with PasteProvider, use usePaste() instead.
 *
 * @example
 * ```tsx
 * usePasteCallback((text) => {
 *   insertText(text)
 * })
 * ```
 */

import { useContext, useEffect, useRef } from "react"
import { ChainAppContext } from "../context"

export type PasteCallback = (text: string) => void

export function usePasteCallback(handler: PasteCallback): void {
  const chain = useContext(ChainAppContext)

  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!chain) return
    return chain.paste.register((text) => {
      handlerRef.current(text)
    })
  }, [chain])
}
