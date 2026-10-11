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
