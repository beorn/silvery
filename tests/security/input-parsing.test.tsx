/**
 * Pre-enrollment security audit (hh 28598): bytes on the terminal input stream.
 *
 * A malicious terminal, or anything that can write into stdin, controls these
 * bytes. Each test asserts the SECURE behaviour (no throw out of the parser,
 * input stays alive); a red test is a confirmed finding.
 */

import { describe, test, expect } from "vitest"
import { parseKey } from "../../packages/ag/src/keys"
import { parseBracketedPaste } from "../../packages/ag-term/src/bracketed-paste"

const ESC = "\x1b"

describe("key parser on malformed Kitty sequences", () => {
  test.each([
    `${ESC}[97:1114112u`, // shifted-key field above U+10FFFF
    `${ESC}[97:1:1114112u`, // base-layout field above U+10FFFF
    `${ESC}[97:99999999999999999999999u`, // not a safe integer
    `${ESC}[1114112u`, // primary codepoint above U+10FFFF
  ])("parseKey(%j) does not throw", (bytes) => {
    expect(() => parseKey(bytes)).not.toThrow()
  })
})

describe("bracketed paste parser on a paste split across reads", () => {
  test("a paste start with no end in the same chunk does not throw to the caller", () => {
    // render.tsx:419, xterm/index.ts:326 and ui/canvas/index.ts:386 call this
    // with no catch; only runtime/renderer.ts and input-owner.ts catch.
    expect(() => parseBracketedPaste(`${ESC}[200~abc`)).not.toThrow()
  })
})
