/**
 * Pre-enrollment security audit (hh 28598): untrusted content reaching the terminal.
 *
 * Threat model goal: from the text it is given, a standard component (Text, Link)
 * puts only styling (SGR) and hyperlinks (OSC 8, scheme http/https/mailto) on the
 * terminal. Each test asserts the SECURE behaviour; a red test is a confirmed
 * finding and prints the offending bytes.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text, Link } from "../../src/index.js"
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

async function renderBytes(element: React.ReactElement): Promise<{ bytes: string; clipboard: string | null }> {
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
// Control set: raw escapes inside Text must never reach the terminal
// =============================================================================

describe("raw escape sequences in Text content (expected clean)", () => {
  /** [name, text rendered through <Text>, marker that must not reach the terminal] */
  const cases: Array<[string, string, string]> = [
    ["CSI erase scrollback", `a${ESC}[3Jb`, `${ESC}[3J`],
    ["CSI private mode", `a${ESC}[?1234hb`, `${ESC}[?1234h`],
    ["CSI with intermediate (DECSCUSR)", `a${ESC}[2 qb`, `${ESC}[2 q`],
    ["CSI delete line (final M)", `a${ESC}[2Mb`, `${ESC}[2M`],
    ["OSC 52 clipboard write", `a${OSC52_WRITE}b`, `${ESC}]52`],
    ["OSC 0 window title", `a${ESC}]0;pwned${BEL}b`, `${ESC}]0;`],
    ["OSC 9 notification", `a${ESC}]9;hello${BEL}b`, `${ESC}]9;`],
    ["DCS", `a${ESC}Pq#0;2;0;0;0${ST}b`, `${ESC}P`],
    ["APC (Kitty graphics)", `a${ESC}_Ga=d${ST}b`, `${ESC}_G`],
    ["C1 CSI 0x9b", `a\x9b3Jb`, "\x9b"],
    ["C1 OSC 0x9d", `a\x9d52;c;SGk=\x9cb`, "\x9d"],
    ["C0 shift-out", `a\x0eb\x0f`, "\x0e"],
    ["C0 backspace", `ab\x08\x08c`, "\x08"],
    ["ESC charset G0", `a${ESC}(0b`, `${ESC}(0`],
    ["ESC 7 (DECSC)", `a${ESC}7b`, `${ESC}7`],
    ["unterminated OSC", `a${ESC}]52;c;SGk=`, `${ESC}]52`],
    ["unterminated CSI at end", `a${ESC}[`, `${ESC}[\x1b[0m`],
  ]
  test.each(cases)("%s", async (_name, text, marker) => {
    const { bytes, clipboard } = await renderBytes(<Text>{text}</Text>)
    expect(clipboard, show(bytes)).toBeNull()
    expect(bytes, show(bytes)).not.toContain(marker)
  })

  test("the same set nested inside Box/Text with wrap and truncate", async () => {
    const text = cases.map(([, t]) => t).join(" ")
    const markers = cases.map(([, , m]) => m)
    const el = (
      <Box flexDirection="column" width={30}>
        <Text wrap="wrap">{text}</Text>
        <Text wrap="truncate">{text}</Text>
      </Box>
    )
    const { bytes, clipboard } = await renderBytes(el)
    expect(clipboard, show(bytes)).toBeNull()
    for (const marker of markers) expect(bytes, `${show(marker)} in ${show(bytes)}`).not.toContain(marker)
  })
})

// =============================================================================
// The two sanitizers, by contract
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
