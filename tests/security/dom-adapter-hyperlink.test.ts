/**
 * Pre-enrollment security audit (hh 28598 slice a): DOM adapter hyperlink target.
 *
 * The DOM adapter turns a cell hyperlink into `<a href=…>`. A `javascript:`
 * target runs script on click; the threat model rates DOM output that runs
 * script as High. The test stubs the minimum `document` surface the adapter
 * touches and asserts the SECURE behaviour (no anchor with a scheme other
 * than http/https/mailto).
 *
 * @failure DOM adapter emits javascript:/data:/file: as <a href>, so a click
 *   runs script or opens a local file.
 * @level l2
 * @consumer silvery DOM adapter (hh 28598 F4)
 * @testonly none
 */

import {
  deriveLinkTarget,
  hyperlink,
  sanitizeHyperlinkTarget,
  type DerivedLinkTarget,
} from "@silvery/ansi"
import { TerminalBuffer, bufferToHTML } from "@silvery/ag-term/buffer"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createDOMAdapter, DOMRenderBuffer } from "../../packages/ag-term/src/adapters/dom-adapter"

interface StubEl {
  tag: string
  children: StubEl[]
  style: { cssText: string }
  className: string
  textContent: string
  attrs: Record<string, string>
  setAttribute(k: string, v: string): void
  getAttribute(k: string): string | null
  appendChild(c: StubEl): StubEl
  innerHTML: string
}

function makeEl(tag: string): StubEl {
  const el: StubEl = {
    tag,
    children: [],
    style: { cssText: "" },
    className: "",
    textContent: "",
    attrs: {},
    setAttribute(k, v) {
      el.attrs[k] = v
    },
    getAttribute(k) {
      return el.attrs[k] ?? null
    },
    appendChild(c) {
      el.children.push(c)
      return c
    },
    get innerHTML() {
      return ""
    },
    set innerHTML(_v: string) {
      el.children.length = 0
    },
  }
  return el
}

function anchors(el: StubEl, out: StubEl[] = []): StubEl[] {
  if (el.tag === "a") out.push(el)
  for (const c of el.children) anchors(c, out)
  return out
}

describe("DOM adapter hyperlink target", () => {
  const hadDocument = "document" in globalThis
  const saved = (globalThis as { document?: unknown }).document
  beforeEach(() => {
    ;(globalThis as { document?: unknown }).document = { createElement: makeEl }
  })
  afterEach(() => {
    if (hadDocument) (globalThis as { document?: unknown }).document = saved
    else delete (globalThis as { document?: unknown }).document
  })

  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
  ])("a cell hyperlink %s is not emitted as an anchor href", (href) => {
    const adapter = createDOMAdapter()
    const buffer = adapter.createBuffer(20, 1) as DOMRenderBuffer
    const container = makeEl("div")
    buffer.setContainer(container as unknown as HTMLElement)
    buffer.drawText(0, 0, "click", { hyperlink: href })
    adapter.flush(buffer, null)
    const hrefs = anchors(container).map((a) => a.getAttribute("href"))
    expect(hrefs, JSON.stringify(hrefs)).toEqual(
      hrefs.filter((h) => h !== null && /^(https?:|mailto:)/i.test(h)),
    )
  })

  test.each(["file:///tmp/example.ts", "km://node/42", "https://example.com/"])(
    "DOM resolves generated %s through the web policy",
    (uri) => {
      const adapter = createDOMAdapter()
      const buffer = adapter.createBuffer(20, 1) as DOMRenderBuffer
      const container = makeEl("div")
      buffer.setContainer(container as unknown as HTMLElement)
      buffer.drawText(0, 0, "click", { hyperlink: deriveLinkTarget(uri) })
      adapter.flush(buffer, null)
      expect(anchors(container).map((a) => a.getAttribute("href"))).toEqual(
        uri.startsWith("https:") ? [uri] : [],
      )
    },
  )

  test("an http hyperlink is still emitted as an anchor (control)", () => {
    const adapter = createDOMAdapter()
    const buffer = adapter.createBuffer(20, 1) as DOMRenderBuffer
    const container = makeEl("div")
    buffer.setContainer(container as unknown as HTMLElement)
    buffer.drawText(0, 0, "click", { hyperlink: "https://example.com/" })
    adapter.flush(buffer, null)
    expect(anchors(container).map((a) => a.getAttribute("href"))).toEqual(["https://example.com/"])
  })
})

describe("derived hyperlink policy and buffer provenance", () => {
  test("one immutable producer identity accepts absolute URIs, never raw or forged input", () => {
    const target = deriveLinkTarget("km://node/42")
    expect(Object.isFrozen(target)).toBe(true)
    expect(hyperlink("node", target)).toContain("km://node/42")
    expect(hyperlink("node", "km://node/42")).toBe("node")
    expect(hyperlink("node", JSON.parse(JSON.stringify(target)) as DerivedLinkTarget)).toBe("node")
    expect(sanitizeHyperlinkTarget("file:///tmp/x")).toBeUndefined()
  })
  test.each([
    "file:///tmp/example.ts",
    "file://localhost/tmp/example.ts",
    "urn:node:42",
    "app+nav://node/42",
  ])("absolute generated destination %s is emitted by the terminal builder", (uri) => {
    expect(hyperlink("label", deriveLinkTarget(uri))).toContain(uri)
  })
  test("generated byte cap counts UTF-8 bytes at the boundary", () => {
    expect(() => deriveLinkTarget("km:" + "x".repeat(2080))).not.toThrow()
    expect(() => deriveLinkTarget("km:" + "x".repeat(2081))).toThrow()
    expect(() => deriveLinkTarget("km:" + "é".repeat(1041))).toThrow()
  })
  test.each([
    "",
    "relative/path",
    "file://remote/tmp/x",
    "file:relative",
    "km://a b",
    "km://a\x07b",
    "km://a\x9db",
    "km://" + "x".repeat(2084),
  ])("invalid generated URI %s throws at mint time", (uri) =>
    expect(() => deriveLinkTarget(uri)).toThrow(),
  )
})

test("buffer HTML refuses generated non-web hrefs while retaining the label", () => {
  const b = new TerminalBuffer(4, 1)
  b.setCell(0, 0, { char: "a", hyperlink: deriveLinkTarget("file:///tmp/example.ts") })
  expect(bufferToHTML(b)).not.toContain("href=")
  expect(bufferToHTML(b)).toContain("a")
})
