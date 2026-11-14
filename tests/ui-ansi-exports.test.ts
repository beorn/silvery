/**
 * @failure A standalone consumer needs the ANSI tokenizer silvery itself uses, and the only
 *   route to it was @silvery/ag-term internals; silvery/ui/ansi exported the rendering
 *   utilities but not tokenizeAnsi or its token type.
 * @level l1
 * @consumer silvery/ui/ansi subpath surface
 * @testonly none: this test imports only the published silvery/ui/ansi entry, so it needs no
 *   production symbol that exists for its sake
 */
import { describe, expect, it } from "vitest"
import { tokenizeAnsi, type AnsiToken } from "silvery/ui/ansi"

describe("silvery/ui/ansi tokenizer surface", () => {
  it("tokenizes through the published entry name, not an internal path", () => {
    const source = "plain \u001b[31mred\u001b[0m"
    const tokens: AnsiToken[] = tokenizeAnsi(source)
    expect(tokens.map((token) => token.value).join("")).toBe(source)
    expect(tokens.some((token) => token.type === "csi")).toBe(true)
  })

  it("keeps the token shape the tokenizer documents", () => {
    expect(tokenizeAnsi("x")).toEqual([{ type: "text", value: "x" } satisfies AnsiToken])
  })
})
