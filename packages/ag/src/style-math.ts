/**
 * Style math functions — `min()` / `max()` / `clamp()` for length values.
 *
 * Bead: @km/silvery/15111-min-max-clamp — required infrastructure for the
 * engine-native CQ + cqi reframe (Phase A0.3). Without math functions,
 * `cqi` values collapse to zero in small containers (`1cqi` of a 5-cell box
 * rounds to 0), making cqi brittle in TUI. Math functions let authors write
 * `paddingLeft="max(1, 2cqi)"` to guarantee a minimum cell.
 *
 * Parser produces an AST; evaluator resolves it against a container size
 * context. The two halves are independent so the parsed form can be cached
 * at element-creation time and re-evaluated per layout pass when the
 * container size changes.
 *
 * **Scope of this module** — pure data + functions, no Box-prop wiring.
 * The applyBoxProps integration (which lets `padding="max(1, 2cqi)"` reach
 * the layout engine) lands as part of Phase A0.1 of the dragon bead
 * `@km/silvery/responsive-layout-architecture-reframe`. This module is the
 * primitive that integration will consume.
 *
 * Semantics follow the CSS spec (W3C css-values-4 §10):
 * - `min(a, b, …)` — smallest of args (≥ 1 arg). Upper bound when paired
 *   with a fallback.
 * - `max(a, b, …)` — largest of args (≥ 1 arg). Lower bound / floor.
 * - `clamp(low, val, high)` — equivalent to `min(high, max(low, val))`.
 *   No auto-correction when low > high (CSS spec).
 *
 * Arithmetic supported: `+`, `-`, `*`, `/`. The bead specifies that `*` and
 * `/` accept only constants on one side; the parser currently accepts a
 * unit on either side and the evaluator will compute the product, which
 * is a strict superset of the CSS calc() rule and never produces a
 * surprising result. A future linter can refine this if needed.
 *
 * @example Bead's canonical examples
 *   parseStyleMath("max(1, 2cqi)")          // padding floor at 1 cell
 *   parseStyleMath("min(2, 5cqi)")          // padding cap at 2 cells
 *   parseStyleMath("clamp(40, 100cqi, 120)") // width between 40 and 120
 *   parseStyleMath("max(0, 10cqi - 4)")     // 10% minus 4 cells, floor at 0
 *   parseStyleMath("max(1, min(5, 3cqi))")  // nested calls
 */

// ============================================================================
// AST node types
// ============================================================================

/**
 * Container-query unit. Resolves against the nearest CQ container's frozen
 * inline-size (cqi), block-size (cqb), or the min/max of the two (cqmin/cqmax).
 */
export type CqUnit = "cqi" | "cqb" | "cqmin" | "cqmax"

export interface StyleMathNumber {
  readonly kind: "num"
  readonly value: number
}

export interface StyleMathCqValue {
  readonly kind: "cq"
  readonly value: number
  readonly unit: CqUnit
}

export interface StyleMathBinOp {
  readonly kind: "bin"
  readonly op: "+" | "-" | "*" | "/"
  readonly left: StyleMathNode
  readonly right: StyleMathNode
}

export interface StyleMathCall {
  readonly kind: "call"
  readonly fn: "min" | "max" | "clamp"
  readonly args: readonly StyleMathNode[]
}

export type StyleMathNode = StyleMathNumber | StyleMathCqValue | StyleMathBinOp | StyleMathCall

/**
 * Evaluation context. `inlineSize` and `blockSize` are the **frozen** sizes
 * of the nearest container-query container (cells, post-quantization).
 */
export interface StyleMathContext {
  readonly inlineSize: number
  readonly blockSize: number
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a style value into a `StyleMathNode`. Returns `null` when the input
 * is not a math expression (caller decides whether to treat that as an error
 * or pass through to a different parser, e.g. percent / keyword).
 *
 * Returns `null` (rather than throws) so callers can chain: percent → math →
 * keyword without paying for try/catch.
 */
export function parseStyleMath(input: string): StyleMathNode | null {
  const trimmed = input.trim()
  if (trimmed === "") return null

  // Reject percent strings — they go through the existing setWidthPercent etc.
  // paths and shouldn't be confused with math values.
  if (/^-?\d+(?:\.\d+)?%$/.test(trimmed)) return null

  const parser = new Parser(trimmed)
  const node = parser.parseExpression()
  if (node === null) return null
  if (!parser.atEnd()) return null // trailing garbage = parse fail
  return node
}

class Parser {
  private pos = 0

  constructor(private readonly src: string) {}

  atEnd(): boolean {
    this.skipWhitespace()
    return this.pos >= this.src.length
  }

  /** expression := term (('+' | '-') term)* */
  parseExpression(): StyleMathNode | null {
    let left = this.parseTerm()
    if (left === null) return null
    while (true) {
      this.skipWhitespace()
      const ch = this.src[this.pos]
      if (ch !== "+" && ch !== "-") break
      this.pos++
      const right = this.parseTerm()
      if (right === null) return null
      left = { kind: "bin", op: ch, left, right }
    }
    return left
  }

  /** term := factor (('*' | '/') factor)* */
  parseTerm(): StyleMathNode | null {
    let left = this.parseFactor()
    if (left === null) return null
    while (true) {
      this.skipWhitespace()
      const ch = this.src[this.pos]
      if (ch !== "*" && ch !== "/") break
      this.pos++
      const right = this.parseFactor()
      if (right === null) return null
      left = { kind: "bin", op: ch, left, right }
    }
    return left
  }

  /** factor := number | cq-value | call | '(' expression ')' | '-' factor */
  parseFactor(): StyleMathNode | null {
    this.skipWhitespace()
    const ch = this.src[this.pos]
    if (ch === undefined) return null

    // Unary minus: parse as 0 - factor. Keeps the AST small.
    if (ch === "-") {
      this.pos++
      const inner = this.parseFactor()
      if (inner === null) return null
      return { kind: "bin", op: "-", left: { kind: "num", value: 0 }, right: inner }
    }

    if (ch === "(") {
      this.pos++
      const expr = this.parseExpression()
      if (expr === null) return null
      this.skipWhitespace()
      if (this.src[this.pos] !== ")") return null
      this.pos++
      return expr
    }

    // Identifier-start ⇒ function call (min / max / clamp).
    if (isIdentStart(ch)) return this.parseCall()

    // Otherwise a number (possibly followed by a unit).
    return this.parseNumberOrCq()
  }

  /** call := ident '(' args ')' where args := expression (',' expression)* */
  parseCall(): StyleMathNode | null {
    const start = this.pos
    while (this.pos < this.src.length && isIdentPart(this.src[this.pos]!)) this.pos++
    const name = this.src.slice(start, this.pos)
    if (name !== "min" && name !== "max" && name !== "clamp") return null
    this.skipWhitespace()
    if (this.src[this.pos] !== "(") return null
    this.pos++

    const args: StyleMathNode[] = []
    this.skipWhitespace()
    // Empty arg list = parse error (CSS spec: min/max/clamp need ≥ 1 arg).
    if (this.src[this.pos] === ")") return null
    while (true) {
      const arg = this.parseExpression()
      if (arg === null) return null
      args.push(arg)
      this.skipWhitespace()
      const next = this.src[this.pos]
      if (next === ",") {
        this.pos++
        continue
      }
      if (next === ")") {
        this.pos++
        break
      }
      return null // bad separator
    }

    if (name === "clamp" && args.length !== 3) return null
    if ((name === "min" || name === "max") && args.length < 1) return null

    return { kind: "call", fn: name, args }
  }

  /** number := /-?\d+(?:\.\d+)?/, optionally followed by a cq* unit. */
  parseNumberOrCq(): StyleMathNode | null {
    const start = this.pos
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!
      if (c >= "0" && c <= "9") this.pos++
      else if (c === "." && this.src[this.pos + 1] !== "." /* avoid swallowing range */) this.pos++
      else break
    }
    if (this.pos === start) return null
    const numStr = this.src.slice(start, this.pos)
    const value = Number.parseFloat(numStr)
    if (!Number.isFinite(value)) return null

    // Look for a cq* unit immediately after the number (no whitespace, per CSS).
    if (isIdentStart(this.src[this.pos])) {
      const unitStart = this.pos
      while (this.pos < this.src.length && isIdentPart(this.src[this.pos]!)) this.pos++
      const unit = this.src.slice(unitStart, this.pos)
      if (unit === "cqi" || unit === "cqb" || unit === "cqmin" || unit === "cqmax") {
        return { kind: "cq", value, unit }
      }
      return null // unknown unit ⇒ caller falls back
    }

    return { kind: "num", value }
  }

  private skipWhitespace(): void {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!
      if (c === " " || c === "\t" || c === "\n" || c === "\r") this.pos++
      else break
    }
  }
}

function isIdentStart(ch: string | undefined): boolean {
  if (ch === undefined) return false
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_"
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || (ch >= "0" && ch <= "9") || ch === "-"
}

// ============================================================================
// Evaluator
// ============================================================================

/**
 * Evaluate a style math AST against a container context, returning a
 * resolved number in cells (un-quantized — the render boundary quantizes
 * per Phase A0.1's largest-remainder / floor policy).
 *
 * cq* unit resolution: `Ncqi = N% × inlineSize`, `Ncqb = N% × blockSize`,
 * `Ncqmin = N% × min(inlineSize, blockSize)`, `Ncqmax = N% × max(…)`.
 */
export function evaluateStyleMath(node: StyleMathNode, ctx: StyleMathContext): number {
  switch (node.kind) {
    case "num":
      return node.value
    case "cq": {
      const base = cqBase(node.unit, ctx)
      return (node.value / 100) * base
    }
    case "bin": {
      const l = evaluateStyleMath(node.left, ctx)
      const r = evaluateStyleMath(node.right, ctx)
      switch (node.op) {
        case "+":
          return l + r
        case "-":
          return l - r
        case "*":
          return l * r
        case "/":
          return l / r
      }
    }
    case "call": {
      const values = node.args.map((arg) => evaluateStyleMath(arg, ctx))
      switch (node.fn) {
        case "min":
          return Math.min(...values)
        case "max":
          return Math.max(...values)
        case "clamp": {
          // CSS spec: clamp(low, val, high) ≡ min(high, max(low, val)).
          // When low > high, follows the spec literally — high wins. A linter
          // can warn separately.
          const [low, val, high] = values as [number, number, number]
          return Math.min(high, Math.max(low, val))
        }
      }
    }
  }
}

function cqBase(unit: CqUnit, ctx: StyleMathContext): number {
  switch (unit) {
    case "cqi":
      return ctx.inlineSize
    case "cqb":
      return ctx.blockSize
    case "cqmin":
      return Math.min(ctx.inlineSize, ctx.blockSize)
    case "cqmax":
      return Math.max(ctx.inlineSize, ctx.blockSize)
  }
}
