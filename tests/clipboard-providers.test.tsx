/**
 * Tests for PasteProvider and paste event handling.
 *
 * Uses createRenderer for synchronous rendering to verify context resolution.
 *
 * NOTE: CopyProvider/useCopyProvider tests were removed — the old React context
 * pattern for semantic copy enrichment was replaced by the runtime-level
 * SelectionFeature in the interactions runtime refactor (Phase 5).
 */
import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "../src/index.js"
import { PasteProvider, usePaste, type PasteHandler } from "../packages/ag-react/src/hooks/usePaste"
import type { PasteEvent } from "../packages/ag-term/src/copy-extraction"
import {
  parseBracketedPaste,
  PASTE_START,
  PASTE_END,
} from "../packages/ag-term/src/bracketed-paste"

// ============================================================================
// PasteProvider Context
// ============================================================================

describe("PasteProvider", () => {
  test("usePaste returns null when no handler in tree", () => {
    let resolvedHandler: PasteHandler | null = "not-set" as any

    function TestComponent() {
      resolvedHandler = usePaste()
      return <Text>test</Text>
    }

    const render = createRenderer({ cols: 40, rows: 10 })
    render(<TestComponent />)

    expect(resolvedHandler).toBeNull()
  })

  test("usePaste returns nearest ancestor handler", () => {
    let resolvedHandler: PasteHandler | null = null

    const outerHandler: PasteHandler = {
      onPaste: vi.fn(),
    }

    const innerHandler: PasteHandler = {
      onPaste: vi.fn(),
    }

    function TestComponent() {
      resolvedHandler = usePaste()
      return <Text>test</Text>
    }

    const render = createRenderer({ cols: 40, rows: 10 })
    render(
      <PasteProvider handler={outerHandler}>
        <PasteProvider handler={innerHandler}>
          <TestComponent />
        </PasteProvider>
      </PasteProvider>,
    )

    expect(resolvedHandler).toBe(innerHandler)

    const pasteEvent: PasteEvent = { text: "pasted", source: "external" }
    resolvedHandler!.onPaste(pasteEvent)
    expect(innerHandler.onPaste).toHaveBeenCalledWith(pasteEvent)
    expect(outerHandler.onPaste).not.toHaveBeenCalled()
  })

  test("paste handler receives full PasteEvent with internal data", () => {
    const onPaste = vi.fn()
    const handler: PasteHandler = { onPaste }

    let resolvedHandler: PasteHandler | null = null

    function TestComponent() {
      resolvedHandler = usePaste()
      return <Text>test</Text>
    }

    const render = createRenderer({ cols: 40, rows: 10 })
    render(
      <PasteProvider handler={handler}>
        <TestComponent />
      </PasteProvider>,
    )

    const pasteEvent: PasteEvent = {
      text: "rich text",
      source: "internal",
      data: {
        text: "rich text",
        markdown: "**rich text**",
        html: "<strong>rich text</strong>",
        internal: { nodeId: "abc-123" },
      },
    }
    resolvedHandler!.onPaste(pasteEvent)

    expect(onPaste).toHaveBeenCalledWith(pasteEvent)
    const received = onPaste.mock.calls[0]![0] as PasteEvent
    expect(received.source).toBe("internal")
    expect(received.data?.markdown).toBe("**rich text**")
    expect(received.data?.internal).toEqual({ nodeId: "abc-123" })
  })
})

// ============================================================================
// Bracketed Paste Parsing (integration with PasteEvent creation)
// ============================================================================

describe("bracketed paste parsing", () => {
  test("detects complete paste sequences", () => {
    const input = `${PASTE_START}Hello World${PASTE_END}`
    const result = parseBracketedPaste(input)

    expect(result).toEqual({ type: "paste", content: "Hello World" })
  })

  test("handles multiline content", () => {
    const input = `${PASTE_START}line 1\nline 2\nline 3${PASTE_END}`
    const result = parseBracketedPaste(input)

    expect(result).toEqual({
      type: "paste",
      content: "line 1\nline 2\nline 3",
    })
  })

  test("returns null for incomplete sequence", () => {
    const input = `${PASTE_START}incomplete`
    const result = parseBracketedPaste(input)

    expect(result).toBeNull()
  })

  test("returns null for no paste markers", () => {
    const result = parseBracketedPaste("just normal text")
    expect(result).toBeNull()
  })
})
