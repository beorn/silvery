import { useContext, useEffect, useRef } from "react"
import { ChainAppContext } from "../context"
import type { Key } from "@silvery/ag/keys"

export interface RawKeyEvent {
  readonly input: string
  readonly key: Key
}

export type RawKeyEventHandler = (event: RawKeyEvent) => void

export interface UseRawKeyEventOptions {
  /**
   * Enable or disable raw key observation.
   * @default true
   */
  isActive?: boolean
}

/**
 * Observe every key event that reaches the chain, including releases and
 * modifier-only events. Prefer `useHotkey` or `useTextInput` unless you need
 * protocol-level state such as key-up tracking.
 */
export function useRawKeyEvent(
  handler: RawKeyEventHandler,
  options: UseRawKeyEventOptions = {},
): void {
  const chain = useContext(ChainAppContext)
  const { isActive = true } = options

  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!isActive) return
    if (!chain) return
    return chain.rawKeys.register((input, chainKey) => {
      handlerRef.current({ input, key: chainKey as Key })
    })
  }, [chain, isActive])
}
