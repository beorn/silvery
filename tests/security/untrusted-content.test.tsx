/**
 * Pre-enrollment security audit (hh 28598 slice a): untrusted hyperlink targets.
 *
 * Threat model goal: from the text it is given, a standard component (Text, Link)
 * puts only styling (SGR) and hyperlinks (OSC 8, scheme http/https/mailto) on the
 * terminal. Each test asserts the SECURE behaviour; a red test is a confirmed
 * finding and prints the offending bytes.
 *
 * @failure A BEL or ST inside Link href terminates OSC 8 early and smuggles OSC 52
 *   clipboard / OSC 2 title writes; file:/javascript:/data:/ssh: hrefs and inline
 *   OSC 8 in Text reach the terminal as OSC 8 targets.
 * @level l2
 * @consumer silvery Link, Text, OSC 8 emission, sanitizeAnsi (hh 28598 F1-F5)
 * @testonly none
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Text, Link } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import { sanitizeAnsi as agTermSanitize } from "../../packages/ag-term/src/ansi-sanitize"
import { sanitizeAnsi as inkSanitize } from "../../packages/ink/src/ink-sanitize"

const ESC = "\x1b"
const BEL = "\x07"
const ST = `${ESC}\\`
/** base64("Hi") */
const OSC52_WRITE = `${ESC}]52;c;SGk=${BEL}`

function show(s: string): string {
  return JSON.stringify(s)
}

/** Every OSC 8 URL that reached the terminal, in order. */
function osc8Urls(bytes: string): string[] {
  return [...bytes.matchAll(/\x1b\]8;([^;\x07\x1b]*);([^\x07\x1b]*)(?:\x07|\x1b\\)/g)]
    .map((m) => m[2]!)
    .filter((u) => u !== "")
}

async function renderBytes(
  element: React.ReactElement,
): Promise<{ bytes: string; clipboard: string | null }> {
  using term = createTermless({ cols: 60, rows: 4 })
  const handle = await run(element, term)
  const bytes = term.out.getText()
  const clipboard = term.clipboard.last
  handle.unmount()
  return { bytes, clipboard }
}

// =============================================================================
// Link href — the application passes an untrusted URL to a standard component
// =============================================================================

describe("Link href from untrusted text", () => {
  test("a BEL inside href cannot terminate the OSC 8 and smuggle a clipboard write", async () => {
    const href = `https://example.com/${BEL}${OSC52_WRITE}`
    const { bytes, clipboard } = await renderBytes(<Link href={href}>click</Link>)
    expect(clipboard, `clipboard was written; bytes: ${show(bytes)}`).toBeNull()
    expect(bytes, show(bytes)).not.toContain(`${ESC}]52;c;SGk=`)
  })

  test("an ST inside href cannot terminate the OSC 8 and smuggle a window-title change", async () => {
    const href = `https://example.com/${ST}${ESC}]2;pwned${BEL}`
    const { bytes } = await renderBytes(<Link href={href}>click</Link>)
    expect(bytes, show(bytes)).not.toContain(`${ESC}]2;pwned`)
  })

  test.each(["file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "ssh://evil"])(
    "href scheme %s does not reach the terminal as an OSC 8 target",
    async (href) => {
      const { bytes } = await renderBytes(<Link href={href}>click</Link>)
      const urls = osc8Urls(bytes)
      expect(urls, show(bytes)).toEqual(urls.filter((u) => /^(https?:|mailto:)/i.test(u)))
    },
  )
})

// =============================================================================
// Inline OSC 8 inside untrusted Text content
// =============================================================================

describe("inline OSC 8 in Text content", () => {
  test("a non-http scheme in an inline hyperlink does not reach the terminal", async () => {
    const text = `see ${ESC}]8;;file:///etc/passwd${ST}here${ESC}]8;;${ST} now`
    const { bytes } = await renderBytes(<Text>{text}</Text>)
    expect(osc8Urls(bytes), show(bytes)).toEqual([])
  })
})

// =============================================================================
// The two sanitizers, by contract (F5): only SGR and OSC 8 survive
// =============================================================================

describe("sanitizeAnsi contract: only SGR and OSC 8 survive", () => {
  const dangerous: Array<[string, string]> = [
    ["OSC 52 clipboard write", OSC52_WRITE],
    ["OSC 0 window title", `${ESC}]0;pwned${BEL}`],
    ["OSC 2 window title", `${ESC}]2;pwned${BEL}`],
    ["OSC 9 notification", `${ESC}]9;hello${BEL}`],
    ["OSC 1337 iTerm2 command", `${ESC}]1337;File=name=x:AAAA${BEL}`],
    ["OSC 7 cwd", `${ESC}]7;file://h/tmp${BEL}`],
    ["OSC 4 palette", `${ESC}]4;0;rgb:ff/00/00${BEL}`],
    ["OSC 10 fg colour", `${ESC}]10;#ff0000${BEL}`],
  ]

  test.each(dangerous)("@silvery/ag-term sanitizeAnsi strips %s", (_n, seq) => {
    const out = agTermSanitize(`a${seq}b`)
    expect(out, show(out)).toBe("ab")
  })

  test.each(dangerous)("@silvery/ink sanitizeAnsi strips %s", (_n, seq) => {
    const out = inkSanitize(`a${seq}b`)
    expect(out, show(out)).toBe("ab")
  })

  test.each(["file:///etc/passwd", "javascript:alert(1)"])(
    "@silvery/ink sanitizeAnsi does not pass an OSC 8 with scheme %s",
    (url) => {
      const out = inkSanitize(`${ESC}]8;;${url}${ST}x${ESC}]8;;${ST}`)
      expect(osc8Urls(out), show(out)).toEqual([])
    },
  )
})
