import { useContext, useEffect, useRef } from "react"
import { ChainAppContext } from "../context"
import { isModifierOnlyEvent, type Key } from "@silvery/ag/keys"

export interface TextInputEvent {
  readonly source: "keyboard" | "paste"
  readonly text: string
  readonly graphemes: readonly string[]
  readonly input: string
  readonly key: Key | null
}

export type TextInputHandler = (text: string, event: TextInputEvent) => void
export type GraphemeInputHandler = (grapheme: string, event: TextInputEvent) => void

export interface UseTextInputOptions {
  /**
   * Enable or disable text input.
   * @default true
   */
  isActive?: boolean
  onText: TextInputHandler
  onGrapheme?: GraphemeInputHandler
  onPaste?: TextInputHandler
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/**
 * Subscribe to textual input only.
 *
 * Command keys, navigation, release events, and modifier-only events are
 * filtered out. Text uses `key.text ?? input`, preserving shifted punctuation,
 * composed characters, and terminal-provided text.
 */
export function useTextInput(options: UseTextInputOptions): void {
  const chain = useContext(ChainAppContext)
  const { isActive = true } = options

  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!isActive) return
    if (!chain) return
    return chain.input.register((input, chainKey) => {
      const key = chainKey as Key
      const text = textFromKeyboardEvent(input, key)
      if (text === null) return undefined
      emitText(optionsRef.current, {
        source: "keyboard",
        text,
        graphemes: splitGraphemes(text),
        input,
        key,
      })
      return undefined
    })
  }, [chain, isActive])

  useEffect(() => {
    if (!isActive) return
    if (!chain) return
    return chain.paste.register((text) => {
      const event: TextInputEvent = {
        source: "paste",
        text,
        graphemes: splitGraphemes(text),
        input: text,
        key: null,
      }
      emitText(optionsRef.current, event)
      optionsRef.current.onPaste?.(text, event)
    })
  }, [chain, isActive])
}

function emitText(options: UseTextInputOptions, event: TextInputEvent): void {
  options.onText(event.text, event)
  for (const grapheme of event.graphemes) {
    options.onGrapheme?.(grapheme, event)
  }
}

function textFromKeyboardEvent(input: string, key: Key): string | null {
  if (key.eventType === "release") return null
  if (isModifierOnlyEvent(input, key)) return null
  if (key.ctrl || key.super || key.hyper) return null
  if (isNavigationOrEditKey(key)) return null

  const text = key.text ?? input
  if (text.length === 0) return null
  if (key.meta && key.text === undefined) return null
  if (!hasPrintableText(text)) return null
  return text
}

function isNavigationOrEditKey(key: Key): boolean {
  return (
    key.upArrow ||
    key.downArrow ||
    key.leftArrow ||
    key.rightArrow ||
    key.pageDown ||
    key.pageUp ||
    key.home ||
    key.end ||
    key.return ||
    key.escape ||
    key.tab ||
    key.backspace ||
    key.delete
  )
}

function hasPrintableText(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) return true
  }
  return false
}

function splitGraphemes(text: string): readonly string[] {
  return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment)
}
