/**
 * Input boundary hook tests.
 *
 * These hooks are the ergonomic layer above the raw `useInput` tuple:
 * command hotkeys, text insertion, and raw key observation are deliberately
 * separate so app code does not have to re-learn terminal protocol details.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import type { Key } from "@silvery/ag/keys"
import {
  ChainAppContext,
  Text,
  useHotkey,
  useHotkeyMap,
  useRawKeyEvent,
  useTextInput,
  type ChainAppContextValue,
  type ChainInputHandler,
  type ChainPasteHandler,
  type ChainRawKeyHandler,
} from "../src/exports"

function key(partial: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    eventType: "press",
    ...partial,
  }
}

function createFakeChain(): {
  readonly chain: ChainAppContextValue
  press(input: string, event?: Partial<Key>): void
  paste(text: string): void
  raw(input: string, event?: Partial<Key>): void
} {
  const inputHandlers: ChainInputHandler[] = []
  const pasteHandlers: ChainPasteHandler[] = []
  const rawHandlers: ChainRawKeyHandler[] = []

  function remove<T>(items: T[], item: T): void {
    const index = items.indexOf(item)
    if (index !== -1) items.splice(index, 1)
  }

  return {
    chain: {
      input: {
        register(handler) {
          inputHandlers.push(handler)
          return () => remove(inputHandlers, handler)
        },
        setActive() {},
      },
      paste: {
        register(handler) {
          pasteHandlers.push(handler)
          return () => remove(pasteHandlers, handler)
        },
      },
      rawKeys: {
        register(handler) {
          rawHandlers.push(handler)
          return () => remove(rawHandlers, handler)
        },
      },
      focusEvents: {
        register() {
          return () => {}
        },
      },
      events: {
        on() {
          return () => {}
        },
        emit() {},
      },
    },
    press(input, event = {}) {
      for (const handler of inputHandlers) handler(input, key(event))
    },
    paste(text) {
      for (const handler of pasteHandlers) handler(text)
    },
    raw(input, event = {}) {
      for (const handler of rawHandlers) handler(input, key(event))
    },
  }
}

function renderWithChain(element: React.ReactElement, chain = createFakeChain()): typeof chain {
  const render = createRenderer({ cols: 20, rows: 3 })
  render(<ChainAppContext.Provider value={chain.chain}>{element}</ChainAppContext.Provider>)
  return chain
}

describe("input boundary hooks", () => {
  test("useHotkey matches semantic command bindings without treating text as commands", () => {
    const onQuestion = vi.fn()
    const onRelease = vi.fn()

    function Probe(): React.ReactElement {
      useHotkey("shift+/", onQuestion)
      useHotkey("shift+/", onRelease)
      return <Text>probe</Text>
    }

    const chain = renderWithChain(<Probe />)
    chain.press("/", { shift: true, text: "?" })
    chain.press("/", { shift: true, text: "?", eventType: "release" })
    chain.press("", { shift: true, isModifierOnly: true })

    expect(onQuestion).toHaveBeenCalledTimes(1)
    expect(onQuestion.mock.calls[0]?.[0]).toMatchObject({ input: "/", binding: "shift+/" })
    expect(onQuestion.mock.calls[0]?.[0].key.text).toBe("?")
    expect(onRelease).toHaveBeenCalledTimes(1)
  })

  test("useHotkey exposes web-literate meta and alt names at the public boundary", () => {
    const onMeta = vi.fn()
    const onAlt = vi.fn()
    const onMod = vi.fn()

    function Probe(): React.ReactElement {
      useHotkey("meta+k", onMeta)
      useHotkey("alt+k", onAlt)
      useHotkey("mod+p", onMod)
      return <Text>probe</Text>
    }

    const chain = renderWithChain(<Probe />)
    chain.press("k", { super: true })
    chain.press("k", { meta: true })
    chain.press("p", { ctrl: true })
    chain.press("p", { super: true })

    expect(onMeta).toHaveBeenCalledTimes(1)
    expect(onAlt).toHaveBeenCalledTimes(1)
    expect(onMod).toHaveBeenCalledTimes(2)
  })

  test("useHotkeyMap dispatches several command bindings through one hook", () => {
    const up = vi.fn()
    const submit = vi.fn()

    function Probe(): React.ReactElement {
      useHotkeyMap({
        "ctrl+p": up,
        Enter: submit,
      })
      return <Text>probe</Text>
    }

    const chain = renderWithChain(<Probe />)
    chain.press("p", { ctrl: true })
    chain.press("\r", { return: true })

    expect(up).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  test("useTextInput emits typed text, graphemes, and paste text without command keys", () => {
    const onText = vi.fn()
    const onGrapheme = vi.fn()
    const onPaste = vi.fn()

    function Probe(): React.ReactElement {
      useTextInput({ onText, onGrapheme, onPaste })
      return <Text>probe</Text>
    }

    const chain = renderWithChain(<Probe />)
    chain.press("/", { shift: true, text: "?" })
    chain.press("p", { ctrl: true })
    chain.press("\r", { return: true })
    chain.paste("ab")

    expect(onText.mock.calls.map((call) => [call[0], call[1].source])).toEqual([
      ["?", "keyboard"],
      ["ab", "paste"],
    ])
    expect(onGrapheme.mock.calls.map((call) => call[0])).toEqual(["?", "a", "b"])
    expect(onPaste).toHaveBeenCalledWith(
      "ab",
      expect.objectContaining({ source: "paste", graphemes: ["a", "b"] }),
    )
  })

  test("useRawKeyEvent observes release and modifier-only events", () => {
    const raw = vi.fn()

    function Probe(): React.ReactElement {
      useRawKeyEvent(raw)
      return <Text>probe</Text>
    }

    const chain = renderWithChain(<Probe />)
    chain.raw("", { shift: true, isModifierOnly: true })
    chain.raw("k", { super: true, eventType: "release" })

    expect(raw.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        input: "",
        key: expect.objectContaining({ isModifierOnly: true }),
      }),
      expect.objectContaining({
        input: "k",
        key: expect.objectContaining({ eventType: "release" }),
      }),
    ])
  })
})
