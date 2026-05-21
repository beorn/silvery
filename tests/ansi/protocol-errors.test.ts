/**
 * Protocol parser loud-error tests.
 *
 * Tracks: @km/silvery/15127-custom-protocol-implementation/protocol-loud-errors
 *
 * Contract:
 * - `null` is reserved for "no input matched, but input was valid" — the
 *   parser does not recognize this input as belonging to its protocol
 *   family at all (no prefix, no marker). Used by discriminator chains
 *   to mean "next parser please."
 * - `throw ProtocolError` for "this WAS for us but is broken" — the parser
 *   committed to the protocol (prefix matched) then the body failed
 *   validation. Callers log and continue.
 *
 * Each parser covered by the 15127 audit's GAP 1 list is exercised:
 * advanced-clipboard, clipboard, osc-colors, mouse, focus-reporting,
 * bracketed-paste.
 */

import { describe, expect, test } from "vitest"
import { parseClipboardResponse } from "../../packages/ag-term/src/clipboard"
import { parseBracketedPaste, PASTE_START } from "../../packages/ag-term/src/bracketed-paste"
import { parseFocusEvent } from "../../packages/ag-term/src/focus-reporting"
import { parseMouseSequence } from "../../packages/ag-term/src/mouse"
import {
  parseOsc5522Response,
  parsePasteData,
} from "../../packages/ag-term/src/ansi/advanced-clipboard"
import { isProtocolError, ProtocolError } from "../../packages/ansi/src/protocol-error"
import { parseOscColorResponse } from "../../packages/ansi/src/osc-colors"

const ESC = "\x1b"
const ST = `${ESC}\\`
const BEL = "\x07"

function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64")
}

// ============================================================================
// ProtocolError class
// ============================================================================

describe("ProtocolError", () => {
  test("carries structured context (parser, reason, input, inputLength)", () => {
    const err = new ProtocolError({
      parser: "parseFoo",
      input: "garbage",
      reason: "missing terminator",
    })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ProtocolError)
    expect(err.name).toBe("ProtocolError")
    expect(err.parser).toBe("parseFoo")
    expect(err.reason).toBe("missing terminator")
    expect(err.input).toBe("garbage")
    expect(err.inputLength).toBe("garbage".length)
    expect(err.message).toContain("parseFoo")
    expect(err.message).toContain("missing terminator")
  })

  test("truncates long inputs but preserves inputLength", () => {
    const huge = "A".repeat(10_000)
    const err = new ProtocolError({
      parser: "parseFoo",
      input: huge,
      reason: "too big",
    })
    expect(err.inputLength).toBe(10_000)
    expect(err.input.length).toBeLessThan(huge.length)
    expect(err.input).toContain("more chars")
  })

  test("isProtocolError narrows correctly", () => {
    const err: unknown = new ProtocolError({
      parser: "x",
      input: "y",
      reason: "z",
    })
    expect(isProtocolError(err)).toBe(true)
    expect(isProtocolError(new Error("plain"))).toBe(false)
    expect(isProtocolError("string")).toBe(false)
    expect(isProtocolError(null)).toBe(false)
  })
})

// ============================================================================
// parseClipboardResponse (OSC 52) — loud on prefix-matched malformed input,
// silent (null) on no prefix.
// ============================================================================

describe("parseClipboardResponse — loud on malformed", () => {
  test("returns null when OSC 52 prefix is absent (next parser please)", () => {
    expect(parseClipboardResponse("not an osc sequence")).toBeNull()
    expect(parseClipboardResponse("")).toBeNull()
  })

  test("returns null for query marker (not a response, but valid OSC52)", () => {
    // ? marker means this is a query, not a response — silent skip is correct.
    expect(parseClipboardResponse(`${ESC}]52;c;?${BEL}`)).toBeNull()
  })

  test("throws ProtocolError when prefix matched but no terminator", () => {
    const base64 = toBase64("hello")
    let thrown: unknown
    try {
      parseClipboardResponse(`${ESC}]52;c;${base64}`)
    } catch (err) {
      thrown = err
    }
    expect(isProtocolError(thrown)).toBe(true)
    expect((thrown as ProtocolError).parser).toBe("parseClipboardResponse")
    expect((thrown as ProtocolError).reason).toMatch(/terminator/i)
  })
})

// ============================================================================
// parseBracketedPaste — loud when PASTE_START found but no PASTE_END.
// ============================================================================

describe("parseBracketedPaste — loud on incomplete paste", () => {
  test("returns null when no PASTE_START (next parser please)", () => {
    expect(parseBracketedPaste("plain keys")).toBeNull()
    expect(parseBracketedPaste("")).toBeNull()
  })

  test("throws ProtocolError when PASTE_START present but no PASTE_END", () => {
    let thrown: unknown
    try {
      parseBracketedPaste(`${PASTE_START}partial content with no end`)
    } catch (err) {
      thrown = err
    }
    expect(isProtocolError(thrown)).toBe(true)
    expect((thrown as ProtocolError).parser).toBe("parseBracketedPaste")
    expect((thrown as ProtocolError).reason).toMatch(/PASTE_END/)
  })
})

// ============================================================================
// parseFocusEvent — null is the *only* non-match signal; no malformed
// branch exists in this parser. The contract test is that null still
// means "not for us" — no behavior change expected.
// ============================================================================

describe("parseFocusEvent — silent skip on no match", () => {
  test("returns null when neither CSI I nor CSI O present", () => {
    expect(parseFocusEvent("random input")).toBeNull()
    expect(parseFocusEvent("")).toBeNull()
  })

  test("still parses valid focus events", () => {
    expect(parseFocusEvent("\x1b[I")).toEqual({ type: "focus-in" })
    expect(parseFocusEvent("\x1b[O")).toEqual({ type: "focus-out" })
  })
})

// ============================================================================
// parseMouseSequence — null is "not SGR mouse." This parser has no
// "committed but malformed" branch since the regex either matches the
// full SGR shape or it doesn't.
// ============================================================================

describe("parseMouseSequence — silent skip on shape mismatch", () => {
  test("returns null when input is not an SGR mouse sequence", () => {
    expect(parseMouseSequence("not mouse")).toBeNull()
    expect(parseMouseSequence("")).toBeNull()
    expect(parseMouseSequence("\x1b[<0;5")).toBeNull() // partial
  })

  test("still parses valid SGR mouse events", () => {
    const result = parseMouseSequence("\x1b[<0;10;5M")
    expect(result).not.toBeNull()
    expect(result!.button).toBe(0)
    expect(result!.action).toBe("down")
  })
})

// ============================================================================
// parseOscColorResponse (OSC 10/11/12) — loud on prefix-matched malformed.
// ============================================================================

describe("parseOscColorResponse — loud on malformed", () => {
  test("returns null when OSC prefix is absent (next parser please)", () => {
    expect(parseOscColorResponse("garbage", 11)).toBeNull()
  })

  test("throws ProtocolError when prefix matched but no terminator", () => {
    let thrown: unknown
    try {
      parseOscColorResponse(`${ESC}]11;rgb:ff/ff/ff`, 11)
    } catch (err) {
      thrown = err
    }
    expect(isProtocolError(thrown)).toBe(true)
    expect((thrown as ProtocolError).parser).toBe("parseOscColorResponse")
    expect((thrown as ProtocolError).reason).toMatch(/terminator/i)
  })

  test("throws ProtocolError when body is not a valid rgb: spec", () => {
    let thrown: unknown
    try {
      parseOscColorResponse(`${ESC}]11;notacolor${BEL}`, 11)
    } catch (err) {
      thrown = err
    }
    expect(isProtocolError(thrown)).toBe(true)
    expect((thrown as ProtocolError).parser).toBe("parseOscColorResponse")
    expect((thrown as ProtocolError).reason).toMatch(/rgb/i)
  })
})

// ============================================================================
// parseOsc5522Response — loud on prefix-matched malformed, silent on no prefix.
// ============================================================================

describe("parseOsc5522Response — loud on malformed", () => {
  test("returns null when 5522 prefix is absent (next parser please)", () => {
    expect(parseOsc5522Response("not 5522")).toBeNull()
  })

  test("throws ProtocolError when prefix matched but no ST terminator", () => {
    let thrown: unknown
    try {
      parseOsc5522Response(`${ESC}]5522;type=read`)
    } catch (err) {
      thrown = err
    }
    expect(isProtocolError(thrown)).toBe(true)
    expect((thrown as ProtocolError).parser).toBe("parseOsc5522Response")
    expect((thrown as ProtocolError).reason).toMatch(/terminator|ST/i)
  })
})

// ============================================================================
// parsePasteData — loud when 5522 DATA shape is identified but mime/payload
// missing; null when type/status is not DATA (wrong message variant — caller
// chains parsers, this is "next-please" within the protocol).
// ============================================================================

describe("parsePasteData — loud on malformed DATA", () => {
  test("returns null for non-5522 input (no prefix)", () => {
    expect(parsePasteData("plain text")).toBeNull()
  })

  test("returns null for 5522 read DONE (not a DATA message)", () => {
    expect(parsePasteData(`${ESC}]5522;type=read:status=DONE${ST}`)).toBeNull()
  })

  test("returns null for 5522 write response (wrong message variant)", () => {
    expect(parsePasteData(`${ESC}]5522;type=write:status=DONE${ST}`)).toBeNull()
  })

  test("throws ProtocolError when DATA status present but mime missing", () => {
    let thrown: unknown
    try {
      // type=read, status=DATA, but no mime or payload field
      parsePasteData(`${ESC}]5522;type=read:status=DATA${ST}`)
    } catch (err) {
      thrown = err
    }
    expect(isProtocolError(thrown)).toBe(true)
    expect((thrown as ProtocolError).parser).toBe("parsePasteData")
    expect((thrown as ProtocolError).reason).toMatch(/mime|payload/i)
  })
})

// ============================================================================
// Dispatcher boundary — parsers may throw; caller MUST log and continue.
// This documents the contract; the runtime test lives in input-owner.test.ts
// (separate file). Here we just demonstrate the catch shape.
// ============================================================================

describe("Caller catch boundary pattern", () => {
  test("a try/catch around a parser surface captures ProtocolError", () => {
    let caught: ProtocolError | null = null
    try {
      const base64 = toBase64("hello")
      parseClipboardResponse(`${ESC}]52;c;${base64}`) // no terminator → throws
    } catch (err) {
      if (isProtocolError(err)) caught = err
    }
    expect(caught).not.toBeNull()
    expect(caught!.parser).toBe("parseClipboardResponse")
  })
})
