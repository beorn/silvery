/**
 * @failure  a plain URL in rendered text is not found, or is found with the
 *           sentence's punctuation (or an unbalanced paren) attached, so the
 *           hyperlink a renderer emits points at a URL that does not exist.
 * @level    l2
 * @consumer @km/maddoc/28205-wrapped-url-links-only-its-first-row
 * @testonly none
 *
 * The one boundary table for the one URL finder every renderer adopts. Each
 * row is a rule the previous private copies disagreed about.
 */

import { describe, expect, it } from "vitest"
import { findUrls } from "../src/find-urls.ts"

const urls = (text: string): string[] => findUrls(text).map((range) => range.url)

describe("findUrls", () => {
  it("finds http and https, and nothing else", () => {
    expect(urls("http://example.com")).toEqual(["http://example.com"])
    expect(urls("https://example.com")).toEqual(["https://example.com"])
    expect(urls("ftp://example.com")).toEqual([])
    expect(urls("file:///etc/hosts")).toEqual([])
    expect(urls("mailto:a@b.com")).toEqual([])
    expect(urls("")).toEqual([])
  })

  it("does not start a URL mid-word", () => {
    expect(urls("xhttps://example.com")).toEqual([])
    expect(urls("_https://example.com")).toEqual([])
    expect(urls("see:https://example.com")).toEqual(["https://example.com"])
    expect(urls("(https://example.com)")).toEqual(["https://example.com"])
  })

  it("is case-insensitive on the scheme and keeps the text as written", () => {
    expect(urls("HTTPS://Example.com/A")).toEqual(["HTTPS://Example.com/A"])
  })

  it("stops at whitespace, quotes, backticks and brackets", () => {
    expect(urls("see https://example.com/a and more")).toEqual(["https://example.com/a"])
    expect(urls('"https://example.com/a"')).toEqual(["https://example.com/a"])
    expect(urls("'https://example.com/a'")).toEqual(["https://example.com/a"])
    expect(urls("`https://example.com/a`")).toEqual(["https://example.com/a"])
    expect(urls("[https://example.com/a]")).toEqual(["https://example.com/a"])
    expect(urls("<https://example.com/a>")).toEqual(["https://example.com/a"])
    expect(urls("{https://example.com/a}")).toEqual(["https://example.com/a"])
  })

  it("trims trailing sentence punctuation", () => {
    expect(urls("https://example.com/a.")).toEqual(["https://example.com/a"])
    expect(urls("https://example.com/a,")).toEqual(["https://example.com/a"])
    expect(urls("https://example.com/a:")).toEqual(["https://example.com/a"])
    expect(urls("https://example.com/a;")).toEqual(["https://example.com/a"])
    expect(urls("https://example.com/a!")).toEqual(["https://example.com/a"])
    expect(urls("https://example.com/a?")).toEqual(["https://example.com/a"])
    expect(urls("https://example.com/a...)")).toEqual(["https://example.com/a"])
  })

  it("keeps a balanced paren and drops an unbalanced one", () => {
    expect(urls("https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ])
    expect(urls("(see https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ])
    expect(urls("https://example.com/a).")).toEqual(["https://example.com/a"])
  })

  it("never returns overlapping ranges for a scheme inside an earlier URL", () => {
    // The inner scheme follows `/` or `=`, so the word-boundary lookbehind
    // admits it. The accepted outer range already covers it — a second range
    // there would double-render the text it spans.
    expect(urls("https://web.archive.org/web/2020/https://x.example/page")).toEqual([
      "https://web.archive.org/web/2020/https://x.example/page",
    ])
    expect(urls("https://x.example/?url=https://y.example/b")).toEqual([
      "https://x.example/?url=https://y.example/b",
    ])
    expect(
      urls("see https://web.archive.org/web/2020/https://x.example/page then https://z.example"),
    ).toEqual(["https://web.archive.org/web/2020/https://x.example/page", "https://z.example"])
  })

  it("reads the operator's curl line as exactly one URL", () => {
    const line =
      "curl -fsSL https://raw.githubusercontent.com/mvschwarz/openrig/v0.6.7/scripts/install.sh | sh -s -- --dry-run"
    expect(urls(line)).toEqual([
      "https://raw.githubusercontent.com/mvschwarz/openrig/v0.6.7/scripts/install.sh",
    ])
  })

  it("returns ranges into the original text, in order and non-overlapping", () => {
    const text = "a https://one.example/x b https://two.example/y z"
    const ranges = findUrls(text)
    expect(ranges.map((range) => range.url)).toEqual([
      "https://one.example/x",
      "https://two.example/y",
    ])
    for (const range of ranges) {
      expect(text.slice(range.start, range.end)).toBe(range.url)
      expect(range.end).toBeGreaterThan(range.start)
    }
    expect(ranges[0]!.start).toBeLessThan(ranges[1]!.start)
    expect(ranges[0]!.end).toBeLessThanOrEqual(ranges[1]!.start)
  })

  it("ignores a bare scheme", () => {
    expect(urls("https://")).toEqual([])
    expect(urls("a https:// b")).toEqual([])
  })
})
