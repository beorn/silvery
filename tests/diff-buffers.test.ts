/**
 * Tests for diffBuffers: buffer diffing for the output phase.
 *
 * Edge cases cover dimension changes (grow/shrink), wide char transitions,
 * true-color equality, dirty row bounding, and row pre-checks.
 * Property tests verify the core invariant: applying diff changes to prev
 * produces a buffer matching next.
 */
import { describe, test, expect } from "vitest"
import {
  TerminalBuffer,
  type Cell,
  type CellAttrs,
  type Color,
  attrsEquals,
} from "@silvery/ag-term/buffer"
import { diffBuffers } from "@silvery/ag-term/pipeline/diff-buffers"

// ============================================================================
// Helpers
// ============================================================================

/** Collect changes from a DiffResult into a simple array for assertions. */
function collectChanges(result: ReturnType<typeof diffBuffers>) {
  const changes: Array<{ x: number; y: number; char: string; fg: Color; bg: Color }> = []
  for (let i = 0; i < result.count; i++) {
    const c = result.pool[i]!
    changes.push({ x: c.x, y: c.y, char: c.cell.char, fg: c.cell.fg, bg: c.cell.bg })
  }
  return changes
}

/** Apply diff changes to a buffer (mutates it). Used for property tests. */
function applyChanges(buf: TerminalBuffer, result: ReturnType<typeof diffBuffers>) {
  for (let i = 0; i < result.count; i++) {
    const c = result.pool[i]!
    if (buf.inBounds(c.x, c.y)) {
      buf.setCell(c.x, c.y, c.cell)
    }
  }
}

/** Compare two buffers cell-by-cell. Returns true if identical. */
function buffersEqual(a: TerminalBuffer, b: TerminalBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (!a.cellEquals(x, y, b)) return false
    }
  }
  return true
}

/** Get a mismatch description between two buffers for diagnostics. */
function describeMismatch(a: TerminalBuffer, b: TerminalBuffer): string {
  const mismatches: string[] = []
  const w = Math.max(a.width, b.width)
  const h = Math.max(a.height, b.height)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const aInBounds = a.inBounds(x, y)
      const bInBounds = b.inBounds(x, y)
      if (!aInBounds || !bInBounds) {
        mismatches.push(
          `(${x},${y}): ${aInBounds ? "in A" : "not in A"}, ${bInBounds ? "in B" : "not in B"}`,
        )
        continue
      }
      if (!a.cellEquals(x, y, b)) {
        const cellA = a.getCell(x, y)
        const cellB = b.getCell(x, y)
        mismatches.push(
          `(${x},${y}): A=${JSON.stringify({ char: cellA.char, fg: cellA.fg, bg: cellA.bg })} ` +
            `B=${JSON.stringify({ char: cellB.char, fg: cellB.fg, bg: cellB.bg })}`,
        )
      }
      if (mismatches.length > 10) return mismatches.join("\n") + "\n..."
    }
  }
  return mismatches.join("\n")
}

// ============================================================================
// Edge case tests
// ============================================================================

describe("diffBuffers", () => {
  test("identical buffers return count=0", () => {
    const prev = new TerminalBuffer(10, 5)
    prev.setCell(3, 2, { char: "A", fg: 1 })
    const next = new TerminalBuffer(10, 5)
    next.setCell(3, 2, { char: "A", fg: 1 })
    // Reset dirty rows on next to simulate "no changes marked"
    next.resetDirtyRows()
    // Mark all dirty to force scan (simulates real pipeline where dirty rows are set)
    // Actually, for identical buffers with dirty rows, the row pre-check should skip them
    next.markAllRowsDirty()
    // Clone prev content into next to ensure they're truly identical
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 10; x++) {
        const cell = prev.getCell(x, y)
        next.setCell(x, y, cell)
      }
    }
    next.markAllRowsDirty()

    const result = diffBuffers(prev, next)
    expect(result.count).toBe(0)
  })

  test("all cells changed — completely different buffers", () => {
    const prev = new TerminalBuffer(3, 2)
    const next = new TerminalBuffer(3, 2)
    // Fill next with different content
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 3; x++) {
        next.setCell(x, y, { char: "X", fg: 2 })
      }
    }

    const result = diffBuffers(prev, next)
    expect(result.count).toBe(6) // 3x2 = 6 cells
  })

  test("true-color changes — both cells have TC flag, different RGB", () => {
    const prev = new TerminalBuffer(5, 1)
    const next = new TerminalBuffer(5, 1)

    // Both have true-color fg, but different RGB values
    prev.setCell(2, 0, { char: "A", fg: { r: 255, g: 0, b: 0 } })
    next.setCell(2, 0, { char: "A", fg: { r: 0, g: 255, b: 0 } })

    // Both have true-color bg, but different RGB values
    prev.setCell(3, 0, { char: "B", bg: { r: 100, g: 100, b: 100 } })
    next.setCell(3, 0, { char: "B", bg: { r: 200, g: 200, b: 200 } })

    const result = diffBuffers(prev, next)
    const changes = collectChanges(result)

    // Should detect both cells as changed
    const changedPositions = changes.map((c) => `${c.x},${c.y}`)
    expect(changedPositions).toContain("2,0")
    expect(changedPositions).toContain("3,0")
  })

  test("wide->narrow transition emits change at x AND x+1", () => {
    const prev = new TerminalBuffer(10, 1)
    const next = new TerminalBuffer(10, 1)

    // Prev has a wide char at x=2 (occupies x=2 and x=3)
    prev.setCell(2, 0, { char: "\u6f22", wide: true }) // CJK char
    prev.setCell(3, 0, { char: " ", continuation: true })

    // Next has a narrow char at x=2 (no wide char)
    next.setCell(2, 0, { char: "a" })
    next.setCell(3, 0, { char: "b" })

    const result = diffBuffers(prev, next)
    const changes = collectChanges(result)

    // Should include both x=2 (the changed cell) AND x=3 (the continuation transition)
    const changedPositions = changes.map((c) => `${c.x},${c.y}`)
    expect(changedPositions).toContain("2,0")
    expect(changedPositions).toContain("3,0")
  })

  test("narrow->wide transition — normal behavior", () => {
    const prev = new TerminalBuffer(10, 1)
    const next = new TerminalBuffer(10, 1)

    // Prev has narrow chars at x=2, x=3
    prev.setCell(2, 0, { char: "a" })
    prev.setCell(3, 0, { char: "b" })

    // Next has a wide char at x=2
    next.setCell(2, 0, { char: "\u6f22", wide: true })
    next.setCell(3, 0, { char: " ", continuation: true })

    const result = diffBuffers(prev, next)
    const changes = collectChanges(result)

    // Both x=2 and x=3 should be detected as changed (cell content differs)
    const changedPositions = changes.map((c) => `${c.x},${c.y}`)
    expect(changedPositions).toContain("2,0")
    expect(changedPositions).toContain("3,0")
  })

  test("wide->shifted-wide must not double-emit the new wide at x+1 (regression)", () => {
    // Regression: incremental render duplicated the new wide char when the
    // previous frame had a wide char at column N and the next frame has a
    // wide char shifted to column N+1.
    //
    // Prev row (cols 33..36): a 🛒_  — wide 🛒 at 34, continuation at 35
    // Next row (cols 33..36): a e 🇯🇵 — narrow e at 34, wide 🇯🇵 at 35, continuation at 36
    //
    // Old behavior (broken): at x=34 the wide->narrow detection also pushed a
    // change at x+1=35 reading next[35]. The normal scan at x=35 ALSO pushed
    // a change there. changesToAnsi then emitted the new wide char twice.
    const prev = new TerminalBuffer(40, 1)
    const next = new TerminalBuffer(40, 1)

    prev.setCell(33, 0, { char: "a" })
    prev.setCell(34, 0, { char: "\u{1F6D2}", wide: true })
    prev.setCell(35, 0, { char: "", continuation: true })

    next.setCell(33, 0, { char: "a" })
    next.setCell(34, 0, { char: "e" })
    next.setCell(35, 0, { char: "\u{1F1EF}\u{1F1F5}", wide: true })
    next.setCell(36, 0, { char: "", continuation: true })

    const result = diffBuffers(prev, next)

    // Each (x,y) position must appear at most once in the change pool.
    const counts = new Map<string, number>()
    for (let i = 0; i < result.count; i++) {
      const c = result.pool[i]!
      const key = `${c.x},${c.y}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const [pos, count] of counts) {
      expect.soft(count, `position ${pos} emitted ${count} times`).toBe(1)
    }

    // (35,0) — the new wide char — must be present exactly once.
    expect(counts.get("35,0")).toBe(1)
    // (34,0) — narrow 'e' replacing prev wide head — must be present.
    expect(counts.get("34,0")).toBe(1)
    // (36,0) — new wide's continuation, was a regular space before — must be present.
    expect(counts.get("36,0")).toBe(1)
  })

  test("width growth — new right strip", () => {
    const prev = new TerminalBuffer(3, 2)
    const next = new TerminalBuffer(5, 2) // 2 columns wider

    // Fill next with content including the new right strip
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 5; x++) {
        next.setCell(x, y, { char: "X" })
      }
    }

    const result = diffBuffers(prev, next)
    const changes = collectChanges(result)

    // Changes in the overlap area (0..3, 0..2) where content changed
    // Plus all cells in the growth strip (x=3..4, y=0..1) = 2*2 = 4
    const growthChanges = changes.filter((c) => c.x >= 3)
    expect(growthChanges.length).toBe(4) // 2 cols * 2 rows
  })

  test("height growth — new bottom strip", () => {
    const prev = new TerminalBuffer(3, 2)
    const next = new TerminalBuffer(3, 4) // 2 rows taller

    // Next has content in growth area
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 3; x++) {
        next.setCell(x, y, { char: "Y" })
      }
    }

    const result = diffBuffers(prev, next)
    const changes = collectChanges(result)

    // Growth strip cells (y=2..3, x=0..2) = 2*3 = 6
    const growthChanges = changes.filter((c) => c.y >= 2)
    expect(growthChanges.length).toBe(6) // 3 cols * 2 rows
  })

  test("width+height growth — no double-counting corners", () => {
    const prev = new TerminalBuffer(3, 2)
    const next = new TerminalBuffer(5, 4) // grows both ways

    const result = diffBuffers(prev, next)

    // Width growth: x=3..4 for ALL y=0..3 => 2*4 = 8
    // Height growth: y=2..3 for x=0..2 only (prev.width) => 3*2 = 6
    // Total growth = 8 + 6 = 14 (corner cells only counted once via width growth)
    // Plus any changes in the overlap area (all empty, so 0 in overlap)
    const changes = collectChanges(result)
    const widthGrowth = changes.filter((c) => c.x >= 3)
    const heightGrowth = changes.filter((c) => c.y >= 2 && c.x < 3)
    expect(widthGrowth.length).toBe(8) // 2 * 4
    expect(heightGrowth.length).toBe(6) // 3 * 2
    // No double-counting: corner cells (x>=3, y>=2) only appear in widthGrowth
    expect(result.count).toBe(14)
  })

  test("width shrink — empty cells in old area", () => {
    const prev = new TerminalBuffer(5, 2)
    const next = new TerminalBuffer(3, 2) // 2 columns narrower

    // Fill prev with content
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 5; x++) {
        prev.setCell(x, y, { char: "A" })
      }
    }

    const result = diffBuffers(prev, next)
    const changes = collectChanges(result)

    // Shrink cells (x=3..4, y=0..1) should be empty changes
    const shrinkChanges = changes.filter((c) => c.x >= 3)
    expect(shrinkChanges.length).toBe(4) // 2 cols * 2 rows
    for (const c of shrinkChanges) {
      expect(c.char).toBe(" ")
      expect(c.fg).toBeNull()
      expect(c.bg).toBeNull()
    }
  })

  test("height shrink — empty cells in old area", () => {
    const prev = new TerminalBuffer(3, 4)
    const next = new TerminalBuffer(3, 2) // 2 rows shorter

    // Fill prev with content
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 3; x++) {
        prev.setCell(x, y, { char: "B" })
      }
    }

    const result = diffBuffers(prev, next)
    const changes = collectChanges(result)

    // Shrink rows (y=2..3, x=0..2) should be empty
    const shrinkChanges = changes.filter((c) => c.y >= 2)
    expect(shrinkChanges.length).toBe(6) // 3 * 2
    for (const c of shrinkChanges) {
      expect(c.char).toBe(" ")
    }
  })

  test("width+height shrink — corner coverage", () => {
    const prev = new TerminalBuffer(5, 4)
    const next = new TerminalBuffer(3, 2) // shrinks both

    const result = diffBuffers(prev, next)
    const changes = collectChanges(result)

    // Width shrink: x=3..4 for y=0..1 (shared height = min(4,2) = 2) => 2*2 = 4
    // Height shrink: y=2..3 for x=0..4 (full prev.width) => 5*2 = 10
    // Total = 4 + 10 = 14
    const widthShrink = changes.filter((c) => c.x >= 3 && c.y < 2)
    const heightShrink = changes.filter((c) => c.y >= 2)
    expect(widthShrink.length).toBe(4)
    expect(heightShrink.length).toBe(10)
    expect(result.count).toBe(14)
  })

  test("dirty row bounding — rows outside dirty range not scanned", () => {
    const prev = new TerminalBuffer(5, 10)
    const next = new TerminalBuffer(5, 10)

    // Set all cells identical first
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 5; x++) {
        prev.setCell(x, y, { char: "." })
        next.setCell(x, y, { char: "." })
      }
    }

    // Reset dirty rows on next, then only dirty row 3
    next.resetDirtyRows()
    // Change one cell at row 3 and mark it dirty via setCell
    next.setCell(2, 3, { char: "X" })

    const result = diffBuffers(prev, next)
    expect(result.count).toBe(1)

    const changes = collectChanges(result)
    expect(changes[0]!.x).toBe(2)
    expect(changes[0]!.y).toBe(3)
    expect(changes[0]!.char).toBe("X")
  })

  test("row pre-check — metadata+chars+extras all match skips row", () => {
    const prev = new TerminalBuffer(5, 3)
    const next = new TerminalBuffer(5, 3)

    // Fill both identically
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 5; x++) {
        prev.setCell(x, y, { char: "Q", fg: 4 })
        next.setCell(x, y, { char: "Q", fg: 4 })
      }
    }

    // Mark all rows dirty (simulates fill() or scrollRegion())
    next.markAllRowsDirty()

    // Even though rows are dirty, the pre-check should skip them
    const result = diffBuffers(prev, next)
    expect(result.count).toBe(0)
  })

  test("pooled clear after hyperlink cell does not retain hyperlink", () => {
    // Prev buffer has hyperlinks in cells that will be in the shrink region
    const prev = new TerminalBuffer(8, 2)
    for (let x = 0; x < 8; x++) {
      prev.setCell(x, 0, { char: "L", fg: 4, hyperlink: `https://example.com/${x}` })
      prev.setCell(x, 1, { char: "M", fg: 5, hyperlink: "https://example.com/row1" })
    }

    // Next buffer is smaller — shrink region must emit empty cells
    const next = new TerminalBuffer(4, 1)
    for (let x = 0; x < 4; x++) {
      next.setCell(x, 0, { char: "N", fg: 6 })
    }

    const result = diffBuffers(prev, next)

    // Verify cleared cells in shrink region have no hyperlink
    for (let i = 0; i < result.count; i++) {
      const c = result.pool[i]!
      // Cells in the shrink region (outside next's bounds) should have no hyperlink
      const inShrinkRegion = c.x >= next.width || c.y >= next.height
      if (inShrinkRegion) {
        expect(c.cell.char).toBe(" ")
        expect(c.cell.fg).toBeNull()
        expect(c.cell.bg).toBeNull()
        expect(c.cell.hyperlink).toBeUndefined()
        expect(c.cell.underlineColor).toBeNull()
      }
    }
  })

  test("mixed changes — some rows changed, various cell types", () => {
    const prev = new TerminalBuffer(8, 5)
    const next = new TerminalBuffer(8, 5)

    // Fill both with base content
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 8; x++) {
        prev.setCell(x, y, { char: ".", fg: 7 })
        next.setCell(x, y, { char: ".", fg: 7 })
      }
    }

    // Row 0: unchanged
    // Row 1: one cell changed (fg color)
    next.setCell(3, 1, { char: ".", fg: 1 })
    // Row 2: char changed
    next.setCell(5, 2, { char: "Z", fg: 7 })
    // Row 3: bold attribute added
    next.setCell(0, 3, { char: ".", fg: 7, attrs: { bold: true } })
    // Row 4: unchanged

    const result = diffBuffers(prev, next)
    expect(result.count).toBe(3)

    const changes = collectChanges(result)
    const positions = changes.map((c) => `${c.x},${c.y}`)
    expect(positions).toContain("3,1")
    expect(positions).toContain("5,2")
    expect(positions).toContain("0,3")
  })
})

// ============================================================================
// Property tests
// ============================================================================

describe("diffBuffers property tests", () => {
  /** Seeded pseudo-random for deterministic tests. */
  function createRng(seed: number) {
    // Simple LCG
    let state = seed
    return {
      next(): number {
        state = (state * 1664525 + 1013904223) & 0x7fffffff
        return state / 0x7fffffff
      },
      nextInt(max: number): number {
        return Math.floor(this.next() * max)
      },
    }
  }

  /** Generate random attrs with all possible fields. */
  function randomAttrs(rng: ReturnType<typeof createRng>): CellAttrs {
    const attrs: CellAttrs = {}
    if (rng.next() > 0.5) attrs.bold = true
    if (rng.next() > 0.7) attrs.italic = true
    if (rng.next() > 0.8) attrs.dim = true
    if (rng.next() > 0.7) attrs.underline = true
    if (rng.next() > 0.8) {
      const styles = ["single", "double", "curly", "dotted", "dashed"] as const
      attrs.underlineStyle = styles[rng.nextInt(styles.length)]
    }
    if (rng.next() > 0.9) attrs.strikethrough = true
    if (rng.next() > 0.9) attrs.blink = true
    if (rng.next() > 0.9) attrs.inverse = true
    if (rng.next() > 0.95) attrs.hidden = true
    return attrs
  }

  /** Generate a random underlineColor (null or true-color). */
  function randomUnderlineColor(rng: ReturnType<typeof createRng>): Color {
    if (rng.next() > 0.7) {
      return { r: rng.nextInt(256), g: rng.nextInt(256), b: rng.nextInt(256) }
    }
    return null
  }

  /** Generate a random hyperlink URL or undefined. */
  function randomHyperlink(rng: ReturnType<typeof createRng>): string | undefined {
    if (rng.next() > 0.7) {
      return `https://example.com/${rng.nextInt(1000)}`
    }
    return undefined
  }

  /** Create a random buffer with varied cell content including attrs, underlineColor, hyperlink. */
  function randomBuffer(
    width: number,
    height: number,
    rng: ReturnType<typeof createRng>,
  ): TerminalBuffer {
    const buf = new TerminalBuffer(width, height)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 "
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const kind = rng.nextInt(12)
        if (kind < 2) {
          // Plain char
          buf.setCell(x, y, { char: chars[rng.nextInt(chars.length)]! })
        } else if (kind < 4) {
          // Char with 256-color fg
          buf.setCell(x, y, { char: chars[rng.nextInt(chars.length)]!, fg: rng.nextInt(256) })
        } else if (kind < 6) {
          // Char with true-color fg
          buf.setCell(x, y, {
            char: chars[rng.nextInt(chars.length)]!,
            fg: { r: rng.nextInt(256), g: rng.nextInt(256), b: rng.nextInt(256) },
          })
        } else if (kind < 7) {
          // Char with true-color bg
          buf.setCell(x, y, {
            char: chars[rng.nextInt(chars.length)]!,
            bg: { r: rng.nextInt(256), g: rng.nextInt(256), b: rng.nextInt(256) },
          })
        } else if (kind < 8 && x + 1 < width) {
          // Wide char (skip next cell for continuation)
          buf.setCell(x, y, { char: "\u6f22", wide: true, fg: rng.nextInt(256) })
          buf.setCell(x + 1, y, { char: " ", continuation: true })
          x++ // skip continuation cell
        } else if (kind < 9) {
          // Char with full attrs (bold, italic, underline, strikethrough, etc.)
          buf.setCell(x, y, {
            char: chars[rng.nextInt(chars.length)]!,
            fg: rng.nextInt(16),
            attrs: randomAttrs(rng),
          })
        } else if (kind < 10) {
          // Char with underlineColor
          buf.setCell(x, y, {
            char: chars[rng.nextInt(chars.length)]!,
            fg: rng.nextInt(256),
            underlineColor: randomUnderlineColor(rng),
            attrs: randomAttrs(rng),
          })
        } else if (kind < 11) {
          // Char with hyperlink
          buf.setCell(x, y, {
            char: chars[rng.nextInt(chars.length)]!,
            fg: rng.nextInt(256),
            hyperlink: randomHyperlink(rng),
            attrs: randomAttrs(rng),
          })
        } else {
          // Char with all extras: attrs + underlineColor + hyperlink
          buf.setCell(x, y, {
            char: chars[rng.nextInt(chars.length)]!,
            fg: rng.nextInt(256),
            bg:
              rng.next() > 0.5
                ? { r: rng.nextInt(256), g: rng.nextInt(256), b: rng.nextInt(256) }
                : null,
            underlineColor: randomUnderlineColor(rng),
            hyperlink: randomHyperlink(rng),
            attrs: randomAttrs(rng),
          })
        }
      }
    }
    return buf
  }

  /**
   * Core invariant: create prev and next, run diffBuffers, apply changes
   * to a clone of prev, verify it matches next.
   */
  function verifySoundness(
    seed: number,
    prevW: number,
    prevH: number,
    nextW: number,
    nextH: number,
  ) {
    const rng = createRng(seed)
    const prev = randomBuffer(prevW, prevH, rng)
    const next = randomBuffer(nextW, nextH, rng)

    // Mark all dirty on next to ensure full scan
    next.markAllRowsDirty()

    const result = diffBuffers(prev, next)

    // Create a "patched" buffer: start from prev dimensions expanded to max,
    // apply changes, then compare with next at its dimensions
    const patchW = Math.max(prevW, nextW)
    const patchH = Math.max(prevH, nextH)
    const patched = new TerminalBuffer(patchW, patchH)

    // Copy prev content into patched buffer
    for (let y = 0; y < prevH; y++) {
      for (let x = 0; x < prevW; x++) {
        patched.setCell(x, y, prev.getCell(x, y))
      }
    }

    // Apply diff changes
    applyChanges(patched, result)

    // Verify: patched matches next within next's bounds (all cell fields)
    for (let y = 0; y < nextH; y++) {
      for (let x = 0; x < nextW; x++) {
        const patchedCell = patched.getCell(x, y)
        const nextCell = next.getCell(x, y)
        if (
          patchedCell.char !== nextCell.char ||
          !colorEqual(patchedCell.fg, nextCell.fg) ||
          !colorEqual(patchedCell.bg, nextCell.bg) ||
          !colorEqual(patchedCell.underlineColor ?? null, nextCell.underlineColor ?? null) ||
          patchedCell.wide !== nextCell.wide ||
          patchedCell.continuation !== nextCell.continuation ||
          !attrsEquals(patchedCell.attrs, nextCell.attrs) ||
          (patchedCell.hyperlink ?? undefined) !== (nextCell.hyperlink ?? undefined)
        ) {
          throw new Error(
            `Soundness failure at (${x},${y}) with seed=${seed} ` +
              `prev=${prevW}x${prevH} next=${nextW}x${nextH}:\n` +
              `  patched: char=${JSON.stringify(patchedCell.char)} fg=${JSON.stringify(patchedCell.fg)} ` +
              `bg=${JSON.stringify(patchedCell.bg)} underlineColor=${JSON.stringify(patchedCell.underlineColor)} ` +
              `attrs=${JSON.stringify(patchedCell.attrs)} hyperlink=${JSON.stringify(patchedCell.hyperlink)}\n` +
              `  next:    char=${JSON.stringify(nextCell.char)} fg=${JSON.stringify(nextCell.fg)} ` +
              `bg=${JSON.stringify(nextCell.bg)} underlineColor=${JSON.stringify(nextCell.underlineColor)} ` +
              `attrs=${JSON.stringify(nextCell.attrs)} hyperlink=${JSON.stringify(nextCell.hyperlink)}`,
          )
        }
      }
    }

    // Verify: cells outside next's bounds (shrink region) are fully empty
    for (let y = nextH; y < prevH; y++) {
      for (let x = 0; x < prevW; x++) {
        const patchedCell = patched.getCell(x, y)
        if (
          patchedCell.char !== " " ||
          patchedCell.fg !== null ||
          patchedCell.bg !== null ||
          (patchedCell.underlineColor ?? null) !== null ||
          (patchedCell.hyperlink ?? undefined) !== undefined
        ) {
          throw new Error(
            `Shrink region not cleared at (${x},${y}) with seed=${seed}: ` +
              `char=${JSON.stringify(patchedCell.char)} fg=${JSON.stringify(patchedCell.fg)} ` +
              `hyperlink=${JSON.stringify(patchedCell.hyperlink)}`,
          )
        }
      }
    }
    if (prevW > nextW) {
      for (let y = 0; y < Math.min(prevH, nextH); y++) {
        for (let x = nextW; x < prevW; x++) {
          const patchedCell = patched.getCell(x, y)
          if (
            patchedCell.char !== " " ||
            patchedCell.fg !== null ||
            patchedCell.bg !== null ||
            (patchedCell.underlineColor ?? null) !== null ||
            (patchedCell.hyperlink ?? undefined) !== undefined
          ) {
            throw new Error(
              `Width shrink region not cleared at (${x},${y}) with seed=${seed}: ` +
                `char=${JSON.stringify(patchedCell.char)} ` +
                `hyperlink=${JSON.stringify(patchedCell.hyperlink)}`,
            )
          }
        }
      }
    }
  }

  function colorEqual(a: Color, b: Color): boolean {
    if (a === b) return true
    if (a === null || b === null) return false
    if (typeof a === "number" || typeof b === "number") return a === b
    return a.r === b.r && a.g === b.g && a.b === b.b
  }

  test("soundness: same dimensions (10 seeds)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = 5 + (seed % 16)
      const h = 5 + ((seed * 3) % 16)
      verifySoundness(seed, w, h, w, h)
    }
  })

  test("soundness: width growth (10 seeds)", () => {
    for (let seed = 100; seed < 110; seed++) {
      verifySoundness(seed, 5 + (seed % 5), 8, 10 + (seed % 5), 8)
    }
  })

  test("soundness: height growth (10 seeds)", () => {
    for (let seed = 200; seed < 210; seed++) {
      verifySoundness(seed, 8, 5 + (seed % 5), 8, 10 + (seed % 5))
    }
  })

  test("soundness: width+height growth (10 seeds)", () => {
    for (let seed = 300; seed < 310; seed++) {
      verifySoundness(seed, 5, 5, 10 + (seed % 5), 10 + (seed % 3))
    }
  })

  test("soundness: width shrink (10 seeds)", () => {
    for (let seed = 400; seed < 410; seed++) {
      verifySoundness(seed, 12 + (seed % 5), 8, 5 + (seed % 3), 8)
    }
  })

  test("soundness: height shrink (10 seeds)", () => {
    for (let seed = 500; seed < 510; seed++) {
      verifySoundness(seed, 8, 12 + (seed % 5), 8, 5 + (seed % 3))
    }
  })

  test("soundness: width+height shrink (10 seeds)", () => {
    for (let seed = 600; seed < 610; seed++) {
      verifySoundness(seed, 12, 12, 5 + (seed % 4), 5 + (seed % 3))
    }
  })

  test("soundness: mixed grow/shrink (10 seeds)", () => {
    for (let seed = 700; seed < 710; seed++) {
      // Width grows, height shrinks
      verifySoundness(seed, 5, 12, 12, 5)
    }
  })

  test("count bounds: changeCount <= width*height*1.5", () => {
    for (let seed = 800; seed < 820; seed++) {
      const rng = createRng(seed)
      const prevW = 5 + rng.nextInt(15)
      const prevH = 5 + rng.nextInt(15)
      const nextW = 5 + rng.nextInt(15)
      const nextH = 5 + rng.nextInt(15)

      const prev = randomBuffer(prevW, prevH, rng)
      const next = randomBuffer(nextW, nextH, rng)
      next.markAllRowsDirty()

      const result = diffBuffers(prev, next)
      const maxCells = Math.max(prevW, nextW) * Math.max(prevH, nextH)
      const maxAllowed = maxCells + (maxCells >> 1) // 1.5x

      expect(result.count).toBeLessThanOrEqual(maxAllowed)
    }
  })
})
