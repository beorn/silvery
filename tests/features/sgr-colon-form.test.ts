/**
 * SGR truecolor / extended-color colon-form parsing (ITU-T T.416).
 *
 * Bead: 15127 GAP 6 — sgr-colon-form
 *
 * Per ITU-T T.416 § 13.1.8, the SGR extended-color introducer (38, 48, 58) may
 * be followed by sub-parameters separated by COLON instead of SEMICOLON.
 * Examples emitted by terminals in the wild:
 *
 *   - `\x1b[38:2::255:100:0m`  — truecolor FG, colorspace-id slot empty (kitty, mintty)
 *   - `\x1b[38:2:255:100:0m`   — truecolor FG, no colorspace-id slot (some xterm builds)
 *   - `\x1b[38:5:196m`         — 256-color FG colon-form
 *   - `\x1b[48:2::0:0:255m`    — truecolor BG with empty colorspace-id slot
 *
 * Silvery's pipeline normalizes everything to the semicolon form
 * (`\x1b[38;2;R;G;Bm`) before render. This file tests:
 *
 *   (a) `parseSGRColor` extracts identical RGB / 256-index values regardless
 *       of which separator the input used (colon vs semicolon, with or
 *       without the empty colorspace-id slot).
 *   (b) `extractColonSGRReplacements` produces a `semicolonForm` string that
 *       carries the correct RGB triple for every wild colon variant.
 *
 * Pure parser tests — no pipeline edits.
 */

import { describe, test, expect } from "vitest"
import {
  extractColonSGRReplacements,
  parseSGRColor,
  type SGRColor,
} from "@silvery/ag-term"

// =============================================================================
// parseSGRColor — structured RGB / index extraction
// =============================================================================

describe("parseSGRColor — truecolor", () => {
  test("semicolon form: \\x1b[38;2;255;100;0m → fg rgb(255,100,0)", () => {
    expect(parseSGRColor("\x1b[38;2;255;100;0m")).toEqual([
      { layer: "fg", kind: "rgb", r: 255, g: 100, b: 0 },
    ])
  })

  test("colon form with empty colorspace-id: \\x1b[38:2::255:100:0m → fg rgb(255,100,0)", () => {
    expect(parseSGRColor("\x1b[38:2::255:100:0m")).toEqual([
      { layer: "fg", kind: "rgb", r: 255, g: 100, b: 0 },
    ])
  })

  test("colon form without colorspace-id slot: \\x1b[38:2:255:100:0m → fg rgb(255,100,0)", () => {
    expect(parseSGRColor("\x1b[38:2:255:100:0m")).toEqual([
      { layer: "fg", kind: "rgb", r: 255, g: 100, b: 0 },
    ])
  })

  test("background truecolor colon form: \\x1b[48:2::0:0:255m → bg rgb(0,0,255)", () => {
    expect(parseSGRColor("\x1b[48:2::0:0:255m")).toEqual([
      { layer: "bg", kind: "rgb", r: 0, g: 0, b: 255 },
    ])
  })

  test("background truecolor no-slot colon form: \\x1b[48:2:0:0:255m → bg rgb(0,0,255)", () => {
    expect(parseSGRColor("\x1b[48:2:0:0:255m")).toEqual([
      { layer: "bg", kind: "rgb", r: 0, g: 0, b: 255 },
    ])
  })

  test("underline truecolor: \\x1b[58:2::128:128:128m → ul rgb(128,128,128)", () => {
    expect(parseSGRColor("\x1b[58:2::128:128:128m")).toEqual([
      { layer: "ul", kind: "rgb", r: 128, g: 128, b: 128 },
    ])
  })
})

describe("parseSGRColor — 256-color (extended palette)", () => {
  test("semicolon form: \\x1b[38;5;196m → fg index 196", () => {
    expect(parseSGRColor("\x1b[38;5;196m")).toEqual([
      { layer: "fg", kind: "indexed", index: 196 },
    ])
  })

  test("colon form: \\x1b[38:5:196m → fg index 196", () => {
    expect(parseSGRColor("\x1b[38:5:196m")).toEqual([
      { layer: "fg", kind: "indexed", index: 196 },
    ])
  })

  test("background 256 colon form: \\x1b[48:5:21m → bg index 21", () => {
    expect(parseSGRColor("\x1b[48:5:21m")).toEqual([
      { layer: "bg", kind: "indexed", index: 21 },
    ])
  })
})

describe("parseSGRColor — equivalence (colon ≡ semicolon)", () => {
  const cases: Array<{ name: string; colon: string; semi: string }> = [
    {
      name: "fg truecolor",
      colon: "\x1b[38:2::10:20:30m",
      semi: "\x1b[38;2;10;20;30m",
    },
    {
      name: "fg truecolor no-slot",
      colon: "\x1b[38:2:10:20:30m",
      semi: "\x1b[38;2;10;20;30m",
    },
    {
      name: "bg truecolor",
      colon: "\x1b[48:2::200:150:50m",
      semi: "\x1b[48;2;200;150;50m",
    },
    {
      name: "ul truecolor",
      colon: "\x1b[58:2::255:255:255m",
      semi: "\x1b[58;2;255;255;255m",
    },
    {
      name: "fg 256-color",
      colon: "\x1b[38:5:226m",
      semi: "\x1b[38;5;226m",
    },
    {
      name: "bg 256-color",
      colon: "\x1b[48:5:0m",
      semi: "\x1b[48;5;0m",
    },
  ]

  for (const { name, colon, semi } of cases) {
    test(`${name}: colon parse == semicolon parse`, () => {
      const colonParsed = parseSGRColor(colon)
      const semiParsed = parseSGRColor(semi)
      expect(colonParsed).toEqual(semiParsed)
      expect(colonParsed.length).toBeGreaterThan(0)
    })
  }
})

describe("parseSGRColor — compound sequences", () => {
  test("multiple colors in one CSI: bold + fg colon truecolor + bg semicolon truecolor", () => {
    // \x1b[1;38:2::255:0:0;48;2;0;255;0m
    // Bold, FG truecolor (colon form), BG truecolor (semicolon form)
    const colors = parseSGRColor("\x1b[1;38:2::255:0:0;48;2;0;255;0m")
    expect(colors).toEqual([
      { layer: "fg", kind: "rgb", r: 255, g: 0, b: 0 },
      { layer: "bg", kind: "rgb", r: 0, g: 255, b: 0 },
    ])
  })

  test("ignores non-color SGR params", () => {
    expect(parseSGRColor("\x1b[1;31;4m")).toEqual([])
  })

  test("returns empty for empty SGR (\\x1b[m)", () => {
    expect(parseSGRColor("\x1b[m")).toEqual([])
  })

  test("returns empty for reset (\\x1b[0m)", () => {
    expect(parseSGRColor("\x1b[0m")).toEqual([])
  })
})

describe("parseSGRColor — malformed inputs degrade silently", () => {
  test("non-SGR CSI returns empty", () => {
    expect(parseSGRColor("\x1b[2J")).toEqual([])
  })

  test("missing RGB triple in colon form returns empty", () => {
    // 38:2 with no params at all
    expect(parseSGRColor("\x1b[38:2m")).toEqual([])
  })

  test("missing RGB triple in semicolon form returns empty", () => {
    expect(parseSGRColor("\x1b[38;2m")).toEqual([])
  })

  test("missing index in colon 256 returns empty", () => {
    expect(parseSGRColor("\x1b[38:5m")).toEqual([])
  })
})

// =============================================================================
// extractColonSGRReplacements — the round-trip wrapper
// =============================================================================

describe("extractColonSGRReplacements — truecolor round-trip", () => {
  test("with empty colorspace-id slot: \\x1b[38:2::255:100:0m", () => {
    const reps = extractColonSGRReplacements("\x1b[38:2::255:100:0m")
    expect(reps).toHaveLength(1)
    expect(reps[0]!.semicolonForm).toBe("\x1b[38;2;255;100;0m")
    expect(reps[0]!.colonForm).toBe("\x1b[38:2::255:100:0m")
  })

  test("without colorspace-id slot: \\x1b[38:2:255:100:0m", () => {
    const reps = extractColonSGRReplacements("\x1b[38:2:255:100:0m")
    expect(reps).toHaveLength(1)
    // The semicolon form must carry the correct RGB triple (255,100,0) —
    // pre-fix this was (100,0,0) due to nums[3] precedence bug.
    expect(reps[0]!.semicolonForm).toBe("\x1b[38;2;255;100;0m")
    expect(reps[0]!.colonForm).toBe("\x1b[38:2:255:100:0m")
  })

  test("background with empty slot: \\x1b[48:2::0:0:255m", () => {
    const reps = extractColonSGRReplacements("\x1b[48:2::0:0:255m")
    expect(reps).toHaveLength(1)
    expect(reps[0]!.semicolonForm).toBe("\x1b[48;2;0;0;255m")
  })

  test("background no slot: \\x1b[48:2:0:0:255m", () => {
    const reps = extractColonSGRReplacements("\x1b[48:2:0:0:255m")
    expect(reps).toHaveLength(1)
    expect(reps[0]!.semicolonForm).toBe("\x1b[48;2;0;0;255m")
  })

  test("256-color colon form fg: \\x1b[38:5:196m", () => {
    const reps = extractColonSGRReplacements("\x1b[38:5:196m")
    expect(reps).toHaveLength(1)
    expect(reps[0]!.semicolonForm).toBe("\x1b[38;5;196m")
    expect(reps[0]!.colonForm).toBe("\x1b[38:5:196m")
  })

  test("256-color colon form bg: \\x1b[48:5:21m", () => {
    const reps = extractColonSGRReplacements("\x1b[48:5:21m")
    expect(reps).toHaveLength(1)
    expect(reps[0]!.semicolonForm).toBe("\x1b[48;5;21m")
  })

  test("non-colon form returns empty (no replacement needed)", () => {
    expect(extractColonSGRReplacements("\x1b[38;2;255;0;0m")).toEqual([])
  })

  test("mixed compound: colon FG + semicolon BG → only colon part replaced", () => {
    const reps = extractColonSGRReplacements("\x1b[38:2::255:0:0;48;2;0;255;0m")
    expect(reps).toHaveLength(1)
    expect(reps[0]!.semicolonForm).toBe("\x1b[38;2;255;0;0m")
    expect(reps[0]!.colonForm).toBe("\x1b[38:2::255:0:0m")
  })
})

// =============================================================================
// Type export sanity
// =============================================================================

describe("public types", () => {
  test("SGRColor has discriminated union shape", () => {
    const rgb: SGRColor = { layer: "fg", kind: "rgb", r: 1, g: 2, b: 3 }
    const indexed: SGRColor = { layer: "bg", kind: "indexed", index: 196 }
    expect(rgb.kind).toBe("rgb")
    expect(indexed.kind).toBe("indexed")
  })
})
