/**
 * Animation primitives tests — AnimatedNumber, TextShimmer, TextReveal,
 * TimeToFirstDraw.
 *
 * createRenderer paints once at mount; we don't drive frames, so each
 * test asserts the initial-frame state. The animations themselves are
 * exercised by useAnimation's own tests.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { AnimatedNumber, TextReveal, TextShimmer, TimeToFirstDraw } from "silvery"

const render = createRenderer({ cols: 80, rows: 5 })

describe("AnimatedNumber", () => {
  test("renders the initial value at mount (no animation needed yet)", () => {
    const app = render(<AnimatedNumber key="an-1" value={42} />)
    expect(app.text).toContain("42")
  })

  test("custom format function applies", () => {
    const app = render(
      <AnimatedNumber key="an-2" value={1234} format={(n) => `$${Math.round(n).toLocaleString()}`} />,
    )
    expect(app.text).toContain("$1,234")
  })
})

describe("TextShimmer", () => {
  test("renders text content with active=true", () => {
    const app = render(<TextShimmer key="ts-1">Streaming...</TextShimmer>)
    expect(app.text).toContain("Streaming...")
  })

  test("renders text with active=false (no shimmer)", () => {
    const app = render(<TextShimmer key="ts-2" active={false}>Done</TextShimmer>)
    expect(app.text).toContain("Done")
  })
})

describe("TextReveal", () => {
  test("renders empty at t=0 (initial frame before animation has progressed)", () => {
    const app = render(<TextReveal key="tr-1" text="Read 3 files" duration={300} />)
    // First frame: progress=0 → 0 chars shown. Text content is mounted as
    // an empty Text node — assert the surrounding frame is intact.
    expect(app.text).not.toContain("Read 3 files")
    // Frame should still be valid (no errors crashing render)
    expect(app.width).toBe(80)
  })
})

describe("TimeToFirstDraw", () => {
  test("renders a time marker label with ms suffix", () => {
    const app = render(<TimeToFirstDraw key="ttfd-1" />)
    expect(app.text).toContain("ttfd:")
    expect(app.text).toMatch(/\d+ms/)
  })

  test("custom label appears", () => {
    const app = render(<TimeToFirstDraw key="ttfd-2" label="boot:" />)
    expect(app.text).toContain("boot:")
  })

  test("startedAt prop measures from arbitrary origin", () => {
    // Pretend we started 1000ms ago — elapsed should be ~1000.
    const app = render(<TimeToFirstDraw key="ttfd-3" startedAt={performance.now() - 1000} />)
    expect(app.text).toMatch(/9\d\dms|10\d\dms/) // 900-1099ms range
  })
})
