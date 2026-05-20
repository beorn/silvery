import { describe, expect, test } from "vitest"
import { evaluateStyleMath, parseStyleMath, type StyleMathContext } from "../src/style-math.ts"

/**
 * Tests for `min()` / `max()` / `clamp()` style math functions.
 *
 * Bead: @km/silvery/15111-min-max-clamp — cqi safety for the responsive
 * layout reframe (Phase A0.3). The parser+evaluator is engine-agnostic;
 * Box-prop integration lands in Phase A0.1 (separate bead).
 */

// Container: 100 cells inline × 40 cells block ⇒ 1cqi = 1 cell, 1cqb = 0.4 cell,
// 1cqmin = 0.4, 1cqmax = 1. Numbers chosen so unit math is obvious in tests.
const ctxStandard: StyleMathContext = {
  inlineSize: 100,
  blockSize: 40,
}

// Small container — exposes the cqi underflow case the bead targets.
// 5-cell inline × 5-cell block ⇒ 1cqi = 0.05, 10cqi = 0.5 (rounds to 0 under floor).
const ctxSmall: StyleMathContext = {
  inlineSize: 5,
  blockSize: 5,
}

function evalExpr(input: string, ctx: StyleMathContext = ctxStandard): number {
  const node = parseStyleMath(input)
  if (node === null) throw new Error(`parseStyleMath returned null for ${JSON.stringify(input)}`)
  return evaluateStyleMath(node, ctx)
}

describe("parseStyleMath — recognition", () => {
  test("plain integer is recognized", () => {
    expect(parseStyleMath("5")).not.toBeNull()
    expect(evalExpr("5")).toBe(5)
  })

  test("plain decimal is recognized", () => {
    expect(evalExpr("2.5")).toBeCloseTo(2.5)
  })

  test("cqi unit parses and resolves against container inline-size", () => {
    expect(evalExpr("10cqi")).toBe(10) // 10% of 100
    expect(evalExpr("50cqi")).toBe(50)
    expect(evalExpr("1cqi", ctxSmall)).toBeCloseTo(0.05)
  })

  test("cqb / cqmin / cqmax units parse and resolve", () => {
    expect(evalExpr("10cqb")).toBe(4) // 10% of 40
    expect(evalExpr("10cqmin")).toBe(4) // 10% of min(100, 40)
    expect(evalExpr("10cqmax")).toBe(10) // 10% of max(100, 40)
  })

  test("unknown garbage returns null (caller decides fallback)", () => {
    expect(parseStyleMath("not-a-value")).toBeNull()
    expect(parseStyleMath("min(")).toBeNull()
    expect(parseStyleMath("min(1, 2")).toBeNull() // missing close paren
    expect(parseStyleMath("min()")).toBeNull() // needs ≥ 1 arg
  })

  test("percent strings are NOT style math (caller routes those separately)", () => {
    expect(parseStyleMath("50%")).toBeNull()
  })
})

describe("min() — smallest of args", () => {
  test("two-arg min picks smaller", () => {
    expect(evalExpr("min(2, 5)")).toBe(2)
    expect(evalExpr("min(5, 2)")).toBe(2)
  })

  test("min with cqi value", () => {
    // 2cqi = 2, min(2, 5) = 2
    expect(evalExpr("min(2cqi, 5)")).toBe(2)
    // 50cqi = 50, min(50, 5) = 5
    expect(evalExpr("min(50cqi, 5)")).toBe(5)
  })

  test("variadic min (≥3 args)", () => {
    expect(evalExpr("min(7, 3, 5, 1, 9)")).toBe(1)
  })

  test("min with one arg returns that arg", () => {
    expect(evalExpr("min(4)")).toBe(4)
  })
})

describe("max() — largest of args", () => {
  test("two-arg max picks larger", () => {
    expect(evalExpr("max(2, 5)")).toBe(5)
    expect(evalExpr("max(5, 2)")).toBe(5)
  })

  test("max with cqi — the canonical cqi safety pattern", () => {
    // Big container: 2cqi = 2, max(1, 2) = 2 → padding scales up
    expect(evalExpr("max(1, 2cqi)", ctxStandard)).toBe(2)
    // Small container: 2cqi = 0.1, max(1, 0.1) = 1 → padding floors at 1 cell
    expect(evalExpr("max(1, 2cqi)", ctxSmall)).toBe(1)
  })

  test("variadic max", () => {
    expect(evalExpr("max(1, 3, 2, 5, 4)")).toBe(5)
  })
})

describe("clamp() — bounded preferred value", () => {
  test("clamp returns preferred when in range", () => {
    expect(evalExpr("clamp(0, 5, 10)")).toBe(5)
  })

  test("clamp floors at low bound", () => {
    expect(evalExpr("clamp(3, 1, 10)")).toBe(3)
  })

  test("clamp ceils at high bound", () => {
    expect(evalExpr("clamp(0, 15, 10)")).toBe(10)
  })

  test("clamp with cqi for preferred — bead's width example", () => {
    // width: clamp(40, 100cqi, 120) on 100-cell container ⇒ 100cqi = 100, in [40, 120] → 100
    expect(evalExpr("clamp(40, 100cqi, 120)", ctxStandard)).toBe(100)
    // On a 5-cell container, 100cqi = 5, clamp(40, 5, 120) = 40
    expect(evalExpr("clamp(40, 100cqi, 120)", ctxSmall)).toBe(40)
    // On a 200-cell container, 100cqi = 200, clamp(40, 200, 120) = 120
    expect(evalExpr("clamp(40, 100cqi, 120)", { inlineSize: 200, blockSize: 100 })).toBe(120)
  })

  test("clamp requires exactly 3 args", () => {
    expect(parseStyleMath("clamp(1, 2)")).toBeNull()
    expect(parseStyleMath("clamp(1, 2, 3, 4)")).toBeNull()
  })

  test("clamp is equivalent to min(high, max(low, val))", () => {
    const ctx = ctxStandard
    expect(evalExpr("clamp(2, 5cqi, 30)", ctx)).toBe(evalExpr("min(30, max(2, 5cqi))", ctx))
    expect(evalExpr("clamp(2, 50cqi, 30)", ctx)).toBe(evalExpr("min(30, max(2, 50cqi))", ctx))
    expect(evalExpr("clamp(20, 5cqi, 30)", ctx)).toBe(evalExpr("min(30, max(20, 5cqi))", ctx))
  })
})

describe("Arithmetic — `+`, `-`, `*` (constant), `/` (constant)", () => {
  test("addition", () => {
    expect(evalExpr("2 + 3")).toBe(5)
  })

  test("subtraction", () => {
    expect(evalExpr("10 - 3")).toBe(7)
  })

  test("multiplication", () => {
    expect(evalExpr("3 * 4")).toBe(12)
  })

  test("division", () => {
    expect(evalExpr("12 / 4")).toBe(3)
  })

  test("cqi + numeric — bead's marginLeft example", () => {
    // 10cqi - 4 on 100-cell container = 6
    expect(evalExpr("10cqi - 4", ctxStandard)).toBe(6)
    // max(0, 10cqi - 4) on 30-cell container: 10cqi = 3, 3 - 4 = -1, max(0, -1) = 0
    expect(evalExpr("max(0, 10cqi - 4)", { inlineSize: 30, blockSize: 30 })).toBe(0)
  })

  test("operator precedence: * / before + -", () => {
    expect(evalExpr("2 + 3 * 4")).toBe(14)
    expect(evalExpr("10 - 6 / 2")).toBe(7)
  })

  test("left-to-right associativity for same-precedence ops", () => {
    expect(evalExpr("10 - 3 - 2")).toBe(5)
    expect(evalExpr("12 / 4 / 3")).toBe(1)
  })

  test("arithmetic inside function args", () => {
    expect(evalExpr("min(2 + 1, 5)")).toBe(3)
    expect(evalExpr("max(1, 2 * 3)")).toBe(6)
  })
})

describe("Nested calls", () => {
  test("max(1, min(5, 3cqi)) — bead's nested example", () => {
    // 3cqi = 3, min(5, 3) = 3, max(1, 3) = 3
    expect(evalExpr("max(1, min(5, 3cqi))")).toBe(3)
    // On 5-cell container: 3cqi = 0.15, min(5, 0.15) = 0.15, max(1, 0.15) = 1
    expect(evalExpr("max(1, min(5, 3cqi))", ctxSmall)).toBe(1)
  })

  test("deeply nested", () => {
    expect(evalExpr("min(max(1, 2), max(3, 4))")).toBe(2)
  })

  test("clamp with nested cqi", () => {
    expect(evalExpr("clamp(min(2, 3), 100cqi, max(120, 150))", ctxStandard)).toBe(100)
  })
})

describe("Property invariants (acceptance criteria from bead)", () => {
  // The bead asks for property tests. Sample-based here keeps deterministic;
  // a fuzz suite under FUZZ=1 can extend it later.
  const sampleArgs = [
    [0, 1],
    [-3, 5],
    [10, 10],
    [2.5, 7.3],
    [100, 1],
    [-1, -5],
  ]

  test("min(a, b) ≤ a AND min(a, b) ≤ b", () => {
    for (const [a, b] of sampleArgs) {
      const result = evalExpr(`min(${a!}, ${b!})`)
      expect(result).toBeLessThanOrEqual(a!)
      expect(result).toBeLessThanOrEqual(b!)
    }
  })

  test("max(a, b) ≥ a AND max(a, b) ≥ b", () => {
    for (const [a, b] of sampleArgs) {
      const result = evalExpr(`max(${a!}, ${b!})`)
      expect(result).toBeGreaterThanOrEqual(a!)
      expect(result).toBeGreaterThanOrEqual(b!)
    }
  })

  test("clamp(low, val, high) ∈ [low, high] for low ≤ high", () => {
    const cases: Array<[number, number, number]> = [
      [0, -5, 10],
      [0, 5, 10],
      [0, 50, 10],
      [-10, 0, 10],
      [2.5, 7.5, 12.5],
      [5, 5, 5], // low == high == val
    ]
    for (const [low, val, high] of cases) {
      const result = evalExpr(`clamp(${low}, ${val}, ${high})`)
      expect(result).toBeGreaterThanOrEqual(low)
      expect(result).toBeLessThanOrEqual(high)
    }
  })

  test("clamp ≡ min(high, max(low, val)) — algebraic identity", () => {
    const cases: Array<[number, number, number]> = [
      [0, -5, 10],
      [0, 50, 10],
      [-5, 3, 7],
      [1.5, 2.5, 3.5],
    ]
    for (const [low, val, high] of cases) {
      expect(evalExpr(`clamp(${low}, ${val}, ${high})`)).toBe(
        evalExpr(`min(${high}, max(${low}, ${val}))`),
      )
    }
  })

  test("cqi safety: max(N, X cqi) ≥ N for all container sizes", () => {
    for (const inline of [1, 5, 10, 50, 100, 500]) {
      const ctx = { inlineSize: inline, blockSize: inline }
      for (const floor of [1, 2, 4]) {
        for (const cqi of [1, 2, 10]) {
          const result = evalExpr(`max(${floor}, ${cqi}cqi)`, ctx)
          expect(result).toBeGreaterThanOrEqual(floor)
        }
      }
    }
  })
})

describe("Whitespace tolerance", () => {
  test("spaces around args and operators", () => {
    expect(evalExpr("min( 2 , 5 )")).toBe(2)
    expect(evalExpr("max(1,  2cqi)")).toBe(2)
    expect(evalExpr("  clamp( 0 , 5 , 10 )  ")).toBe(5)
    expect(evalExpr("2  +  3")).toBe(5)
  })
})

describe("Error reporting", () => {
  test("unknown function name returns null", () => {
    expect(parseStyleMath("calc(1 + 2)")).toBeNull()
    expect(parseStyleMath("foo(1, 2)")).toBeNull()
  })

  test("unknown unit returns null", () => {
    expect(parseStyleMath("5px")).toBeNull()
    expect(parseStyleMath("10vw")).toBeNull()
  })

  test("clamp arg order is not auto-corrected (low > high → still evaluates min(high, max(low, val)))", () => {
    // CSS spec: clamp(20, 5, 10) means min(10, max(20, 5)) = min(10, 20) = 10.
    // Document that we follow the spec literally; lint can warn separately.
    expect(evalExpr("clamp(20, 5, 10)")).toBe(10)
  })
})
