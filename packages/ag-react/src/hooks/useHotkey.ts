import { useContext, useEffect, useMemo, useRef } from "react"
import { ChainAppContext, RuntimeContext } from "../context"
import {
  isModifierOnlyEvent,
  matchHotkey,
  parseHotkey,
  type Key,
  type ParsedHotkey,
} from "@silvery/ag/keys"

export interface HotkeyEvent {
  readonly binding: string
  readonly input: string
  readonly key: Key
}

export type HotkeyHandler = (event: HotkeyEvent) => void | "exit"

export interface UseHotkeyOptions {
  /**
   * Enable or disable this binding.
   * @default true
   */
  isActive?: boolean
}

export type HotkeyMap = Readonly<Record<string, HotkeyHandler | undefined>>

type CompiledHotkey = {
  readonly binding: string
  readonly hotkey: ParsedHotkey
}

/**
 * Subscribe to a semantic command binding.
 *
 * Public modifier names follow web/platform vocabulary:
 * - `meta` means Cmd/Windows/Super
 * - `alt`/`option` means terminal Meta/Alt
 * - `mod` matches either Ctrl or Super
 */
export function useHotkey(
  binding: string,
  handler: HotkeyHandler,
  options: UseHotkeyOptions = {},
): void {
  const chain = useContext(ChainAppContext)
  const rt = useContext(RuntimeContext)
  const { isActive = true } = options
  const compiled = useMemo(() => compilePublicHotkey(binding), [binding])

  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!isActive) return
    if (!chain) return
    return chain.input.register((input, chainKey) => {
      const key = chainKey as Key
      if (!matchesAnyHotkey(compiled, input, key)) return undefined
      const result = handlerRef.current({ binding, input, key })
      if (result === "exit") {
        rt?.exit()
        return "exit"
      }
      return undefined
    })
  }, [binding, chain, compiled, isActive, rt])
}

/**
 * Subscribe to several command bindings through one React hook.
 */
export function useHotkeyMap(bindings: HotkeyMap, options: UseHotkeyOptions = {}): void {
  const chain = useContext(ChainAppContext)
  const rt = useContext(RuntimeContext)
  const { isActive = true } = options
  const compiled = useMemo(() => compilePublicHotkeyMap(bindings), [bindings])

  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings

  useEffect(() => {
    if (!isActive) return
    if (!chain) return
    return chain.input.register((input, chainKey) => {
      const key = chainKey as Key
      for (const item of compiled) {
        if (!matchesHotkey(item.hotkey, input, key)) continue
        const result = bindingsRef.current[item.binding]?.({ binding: item.binding, input, key })
        if (result === "exit") {
          rt?.exit()
          return "exit"
        }
        return undefined
      }
      return undefined
    })
  }, [chain, compiled, isActive, rt])
}

function compilePublicHotkeyMap(bindings: HotkeyMap): readonly CompiledHotkey[] {
  return Object.entries(bindings).flatMap(([binding, handler]) =>
    handler ? compilePublicHotkey(binding) : [],
  )
}

function compilePublicHotkey(binding: string): readonly CompiledHotkey[] {
  const parts = binding
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length <= 1) {
    return [{ binding, hotkey: parseHotkey(binding) }]
  }

  const key = parts.at(-1)!
  let variants: string[][] = [[]]
  for (const modifier of parts.slice(0, -1)) {
    const normalized = normalizePublicModifier(modifier)
    variants = variants.flatMap((current) => normalized.map((mod) => [...current, mod]))
  }

  const seen = new Set<string>()
  return variants.flatMap((mods) => {
    const normalizedBinding = [...mods, key].join("+")
    if (seen.has(normalizedBinding)) return []
    seen.add(normalizedBinding)
    return [{ binding, hotkey: parseHotkey(normalizedBinding) }]
  })
}

function normalizePublicModifier(modifier: string): readonly string[] {
  switch (modifier.toLowerCase()) {
    case "mod":
      return ["ctrl", "super"]
    case "meta":
      return ["super"]
    case "cmd":
    case "command":
    case "super":
      return ["super"]
    case "alt":
    case "opt":
    case "option":
      return ["meta"]
    default:
      return [modifier]
  }
}

function matchesAnyHotkey(hotkeys: readonly CompiledHotkey[], input: string, key: Key): boolean {
  return hotkeys.some((item) => matchesHotkey(item.hotkey, input, key))
}

function matchesHotkey(hotkey: ParsedHotkey, input: string, key: Key): boolean {
  if (key.eventType === "release") return false
  if (isModifierOnlyEvent(input, key)) return false
  return matchHotkey(hotkey, key, input)
}
