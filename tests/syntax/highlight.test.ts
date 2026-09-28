/**
 * @silvery/syntax — Highlight function tests
 *
 * Verifies:
 * - highlight() returns TokenLine[] for common languages (ts, js, py, rs, json)
 * - Each line produces non-empty tokens
 * - ANSI output is renderable (contains text, well-formed SGR sequences)
 * - Lazy-load doesn't block (grammar loaded on demand, subsequent calls hit cache)
 * - Unknown lang falls back to plain text without throwing
 * - Plain lang produces token-per-line with no color
 */

import { describe, test, expect, vi } from "vitest"
import { highlight, highlightToAnsi, canonicalLang } from "@silvery/syntax"

// =============================================================================
// canonicalLang alias resolution
// =============================================================================

describe("canonicalLang", () => {
  test("ts → typescript", () => {
    expect(canonicalLang("ts")).toBe("typescript")
  })

  test("py → python", () => {
    expect(canonicalLang("py")).toBe("python")
  })

  test("rs → rust", () => {
    expect(canonicalLang("rs")).toBe("rust")
  })

  test("sh → bash", () => {
    expect(canonicalLang("sh")).toBe("bash")
  })

  test("unknown passes through unchanged", () => {
    expect(canonicalLang("foobar")).toBe("foobar")
  })

  test("case-insensitive", () => {
    expect(canonicalLang("TS")).toBe("typescript")
    expect(canonicalLang("TypeScript")).toBe("typescript")
  })
})

// =============================================================================
// highlight() — structured token output
// =============================================================================

describe("highlight — TypeScript", () => {
  test("returns one TokenLine per newline", async () => {
    const code = "const x = 1\nconst y = 2"
    const lines = await highlight(code, "ts", "github-dark")
    expect(lines).toHaveLength(2)
  })

  test("each line has at least one token", async () => {
    const lines = await highlight("const x = 1", "ts", "github-dark")
    expect(lines[0]!.tokens.length).toBeGreaterThan(0)
  })

  test("tokens contain the original text content", async () => {
    const code = "const x = 1"
    const lines = await highlight(code, "ts", "github-dark")
    const allText = lines.flatMap((l) => l.tokens.map((t) => t.text)).join("")
    expect(allText).toBe(code)
  })

  test("at least one token has a color (highlighting is active)", async () => {
    // "const" should be colored as a keyword by any decent theme
    const lines = await highlight("const x = 1", "typescript", "github-dark")
    const hasColor = lines.some((l) => l.tokens.some((t) => t.color))
    expect(hasColor).toBe(true)
  })

  test("colors are 7-char hex strings (#rrggbb)", async () => {
    const lines = await highlight("const x = 1", "typescript", "github-dark")
    for (const line of lines) {
      for (const tok of line.tokens) {
        if (tok.color) {
          expect(tok.color).toMatch(/^#[0-9a-f]{6}$/)
        }
      }
    }
  })
})

describe("highlight — JavaScript", () => {
  test("highlights JS code non-empty", async () => {
    const lines = await highlight("function hello() { return 'world' }", "js", "github-dark")
    expect(lines.length).toBeGreaterThan(0)
    const text = lines.flatMap((l) => l.tokens.map((t) => t.text)).join("")
    expect(text).toContain("hello")
    expect(text).toContain("world")
  })
})

describe("highlight — Python", () => {
  test("highlights Python code non-empty", async () => {
    const code = "def greet(name):\n    return f'Hello {name}'"
    const lines = await highlight(code, "py", "github-dark")
    expect(lines).toHaveLength(2)
    const text = lines.flatMap((l) => l.tokens.map((t) => t.text)).join("\n")
    expect(text).toContain("greet")
  })
})

describe("highlight — Rust", () => {
  test("highlights Rust code non-empty", async () => {
    const code = 'fn main() { println!("hello"); }'
    const lines = await highlight(code, "rs", "github-dark")
    expect(lines.length).toBeGreaterThan(0)
    const text = lines.flatMap((l) => l.tokens.map((t) => t.text)).join("")
    expect(text).toContain("main")
  })
})

describe("highlight — JSON", () => {
  test("highlights JSON code non-empty", async () => {
    const code = '{ "key": "value", "num": 42 }'
    const lines = await highlight(code, "json", "github-dark")
    expect(lines.length).toBeGreaterThan(0)
    const text = lines.flatMap((l) => l.tokens.map((t) => t.text)).join("")
    expect(text).toContain("key")
    expect(text).toContain("42")
  })
})

// =============================================================================
// Plain / unknown language fallback
// =============================================================================

describe("highlight — plain text", () => {
  test("plain lang returns token-per-line, no colors", async () => {
    const code = "hello world\nline 2"
    const lines = await highlight(code, "plain")
    expect(lines).toHaveLength(2)
    expect(lines[0]!.tokens[0]!.text).toBe("hello world")
    expect(lines[0]!.tokens[0]!.color).toBeUndefined()
  })

  test("omitting lang defaults to plain", async () => {
    const lines = await highlight("just text")
    expect(lines[0]!.tokens[0]!.text).toBe("just text")
    expect(lines[0]!.tokens[0]!.color).toBeUndefined()
  })

  test("unknown language falls back gracefully (no throw)", async () => {
    const lines = await highlight("some code here", "xyzzy-unknown-lang")
    expect(lines.length).toBeGreaterThan(0)
    // Text content is preserved
    const allText = lines.flatMap((l) => l.tokens.map((t) => t.text)).join("")
    expect(allText).toBe("some code here")
  })
})

// =============================================================================
// Cache behavior
// =============================================================================

describe("highlight — cache", () => {
  test("second call returns the same result array reference (cache hit)", async () => {
    const code = "const x = 1"
    const first = await highlight(code, "ts", "github-dark")
    const second = await highlight(code, "ts", "github-dark")
    expect(first).toBe(second) // same reference = cache hit
  })

  test("different inputs produce different results", async () => {
    const a = await highlight("const x = 1", "ts", "github-dark")
    const b = await highlight("let y = 2", "ts", "github-dark")
    expect(a).not.toBe(b)
  })
})

// =============================================================================
// ANSI output
// =============================================================================

describe("highlightToAnsi", () => {
  test("returns non-empty string for TypeScript code", async () => {
    const ansi = await highlightToAnsi("const x = 1", "ts", "github-dark")
    expect(ansi.length).toBeGreaterThan(0)
  })

  test("contains the original text content", async () => {
    const code = "const x = 1"
    const ansi = await highlightToAnsi(code, "ts", "github-dark")
    // Strip ANSI escapes to compare plain text
    const plain = ansi.replace(/\x1b\[[^m]*m/g, "")
    expect(plain).toBe(code)
  })

  test("ANSI output contains SGR escape sequences for colored tokens", async () => {
    const ansi = await highlightToAnsi("const x = 1", "typescript", "github-dark")
    // Should contain at least one CSI sequence (ESC[)
    expect(ansi).toContain("\x1b[")
  })

  test("multi-line code: lines joined with LF", async () => {
    const ansi = await highlightToAnsi("a\nb\nc", "plain")
    const stripped = ansi.replace(/\x1b\[[^m]*m/g, "")
    expect(stripped).toBe("a\nb\nc")
  })

  test("SGR sequences are well-formed: only ESC[ ... m patterns", async () => {
    const ansi = await highlightToAnsi("const x = 1", "ts", "github-dark")
    // All escape sequences should match \x1b[<digits/semicolons>m
    const badSeq = ansi.match(/\x1b(?!\[[0-9;]*m)/g)
    expect(badSeq).toBeNull()
  })

  test("ANSI output ends with SGR reset (no color bleed)", async () => {
    const ansi = await highlightToAnsi("const x = 1", "typescript", "github-dark")
    // If there are any color codes, the output should end with a reset
    if (ansi.includes("\x1b[")) {
      expect(ansi).toMatch(/\x1b\[0m$/)
    }
  })
})

// =============================================================================
// Lazy-load: grammar loaded on demand
// =============================================================================

describe("lazy loading", () => {
  test("highlighting succeeds without pre-loading grammars", async () => {
    // Fresh module, so a fresh highlighter with no grammars loaded (E-1, 25632).
    vi.resetModules()
    const { highlight } = await import("@silvery/syntax")
    const lines = await highlight("const x = 1", "typescript", "github-dark")
    expect(lines.length).toBeGreaterThan(0)
    const hasColor = lines.some((l) => l.tokens.some((t) => t.color))
    expect(hasColor).toBe(true)
  })

  test("multiple languages load independently", async () => {
    vi.resetModules()
    const { highlight } = await import("@silvery/syntax")
    const [ts, py, rs] = await Promise.all([
      highlight("const x = 1", "ts", "github-dark"),
      highlight("def foo(): pass", "py", "github-dark"),
      highlight("fn main() {}", "rs", "github-dark"),
    ])
    expect(ts!.length).toBeGreaterThan(0)
    expect(py!.length).toBeGreaterThan(0)
    expect(rs!.length).toBeGreaterThan(0)
  })
})
