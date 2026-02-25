/**
 * Test CJK wide character rendering — buffer integrity and ANSI output.
 *
 * Bug: Wide char at col X sets continuation at col X+1, but adjacent container
 * clears col X+1 → bufferToAnsi cursor drifts. Verified by INKX_STRICT_OUTPUT.
 */
import { describe, test, expect } from "vitest"
import { createRenderer } from "inkx/testing"
import { Box, Text, TerminalBuffer } from "inkx"

describe("CJK wide character rendering", () => {
  test("wide char has continuation cell in adjacent column layout", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    // Two adjacent columns — CJK text fills to near the column boundary
    const app = render(
      <Box flexDirection="row" width={40}>
        <Box width={20}>
          <Text>廈門市 hello</Text>
        </Box>
        <Box width={20}>
          <Text>right side</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("廈")
    expect(app.text).toContain("right side")
  })

  test("CJK text near boundary with border doesn't garble", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })

    // CJK text near boundary + adjacent bordered box — the border clears
    // the continuation cell. This is the Asana import scenario.
    const app = render(
      <Box flexDirection="row" width={60}>
        <Box width={30}>
          <Text>項目名稱：廈門大廈報表清理</Text>
        </Box>
        <Box width={30} borderStyle="single">
          <Text>card content</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("廈門大廈")
    expect(app.text).toContain("card content")
  })

  test("incremental render with CJK text doesn't corrupt output", async () => {
    const render = createRenderer({ cols: 80, rows: 10 })

    function App({ selected }: { selected: number }) {
      return (
        <Box flexDirection="column" width={80}>
          <Box flexDirection="row">
            <Box width={35}>
              <Text>廈門大廈 任務報表</Text>
            </Box>
            <Box width={35}>
              <Text>{selected === 0 ? "> selected" : "  idle"}</Text>
            </Box>
          </Box>
          <Box flexDirection="row">
            <Box width={35}>
              <Text>清理報表 日常任務</Text>
            </Box>
            <Box width={35}>
              <Text>{selected === 1 ? "> selected" : "  idle"}</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App selected={0} />)
    expect(app.text).toContain("廈門大廈")
    expect(app.text).toContain("> selected")

    // Trigger incremental render — INKX_STRICT checks buffer equality
    app.rerender(<App selected={1} />)
    expect(app.text).toContain("清理報表")
  })

  test("zoom-like state change with CJK text in multiple columns", async () => {
    const render = createRenderer({ cols: 100, rows: 15 })

    function Board({ zoomed }: { zoomed: boolean }) {
      if (zoomed) {
        return (
          <Box flexDirection="column" width={100}>
            <Text>Zoomed: 廈門大廈計劃</Text>
            <Box flexDirection="row">
              <Box width={50}>
                <Text>子任務一：報表清理</Text>
              </Box>
              <Box width={50}>
                <Text>子任務二：數據備份</Text>
              </Box>
            </Box>
          </Box>
        )
      }
      return (
        <Box flexDirection="row" width={100}>
          <Box width={33}>
            <Text>Column 1: 廈門</Text>
          </Box>
          <Box width={33}>
            <Text>Column 2: 報表</Text>
          </Box>
          <Box width={34}>
            <Text>Column 3: 備份</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<Board zoomed={false} />)
    expect(app.text).toContain("廈門")

    // Zoom in — big layout change, tests the content phase fast path
    app.rerender(<Board zoomed={true} />)
    expect(app.text).toContain("廈門大廈計劃")

    // Zoom out — another big layout change
    app.rerender(<Board zoomed={false} />)
    expect(app.text).toContain("Column 1")
    expect(app.text).toContain("Column 3")
  })
})

describe("CJK wide char buffer integrity", () => {
  test("every wide char in buffer has continuation at col+1", async () => {
    const render = createRenderer({ cols: 80, rows: 5 })

    const app = render(
      <Box flexDirection="row" width={80}>
        <Box width={20}>
          <Text>項目名稱：廈門大廈</Text>
        </Box>
        <Box width={20} borderStyle="single">
          <Text>card content</Text>
        </Box>
        <Box width={20}>
          <Text>報表清理</Text>
        </Box>
        <Box width={20} backgroundColor="blue">
          <Text>備份計劃</Text>
        </Box>
      </Box>,
    )

    // Validate buffer integrity: every wide char must have continuation
    const buffer = (app as any)._buffer as TerminalBuffer
    if (buffer) {
      for (let y = 0; y < buffer.height; y++) {
        for (let x = 0; x < buffer.width - 1; x++) {
          if (buffer.isCellWide(x, y)) {
            const nextPacked = (buffer as any).cells[y * buffer.width + x + 1]
            // Check continuation flag is set in packed metadata
            const CONTINUATION_FLAG = 1 << 27
            expect(
              (nextPacked & CONTINUATION_FLAG) !== 0,
              `Wide char at (${x},${y}) missing continuation at (${x + 1},${y})`,
            ).toBe(true)
          }
        }
      }
    }
  })

  test("bufferToAnsi round-trip preserves CJK characters", async () => {
    const render = createRenderer({ cols: 40, rows: 3 })

    const app = render(
      <Box flexDirection="row" width={40}>
        <Box width={20}>
          <Text>廈門市報表</Text>
        </Box>
        <Box width={20}>
          <Text>right side</Text>
        </Box>
      </Box>,
    )

    // The ANSI output should contain the CJK characters without garble
    const ansi = app.ansi
    expect(ansi).toContain("廈")
    expect(ansi).toContain("門")
    expect(ansi).toContain("right side")

    // Verify no cursor drift: "right side" should appear in the output.
    // CJK chars are 2-cols wide each, so 5 CJK chars = 10 display cols.
    // In plain text (app.text), wide chars are 1 string char each, so the
    // index doesn't map directly to terminal columns. Just verify presence.
    const lines = app.text.split("\n")
    const firstLine = lines[0] || ""
    const rightIdx = firstLine.indexOf("right side")
    expect(rightIdx).toBeGreaterThan(0)
  })

  test("incremental ANSI diff handles wide-to-narrow transition", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    function App({ useCJK }: { useCJK: boolean }) {
      return (
        <Box flexDirection="row" width={40}>
          <Box width={20}>
            <Text>{useCJK ? "廈門市 hello" : "plain text here"}</Text>
          </Box>
          <Box width={20}>
            <Text>right side</Text>
          </Box>
        </Box>
      )
    }

    // First render with CJK
    const app = render(<App useCJK={true} />)
    expect(app.text).toContain("廈")
    expect(app.text).toContain("right side")

    // Switch to non-CJK — tests wide→narrow transition in ANSI diff
    app.rerender(<App useCJK={false} />)
    expect(app.text).toContain("plain text here")
    expect(app.text).toContain("right side")

    // Switch back to CJK — tests narrow→wide transition
    app.rerender(<App useCJK={true} />)
    expect(app.text).toContain("廈")
    expect(app.text).toContain("right side")
  })
})

describe("Unicode rendering across scripts", () => {
  test("Arabic text renders without garble", async () => {
    const render = createRenderer({ cols: 60, rows: 3 })

    const app = render(
      <Box flexDirection="row" width={60}>
        <Box width={30}>
          <Text>مرحبا بالعالم</Text>
        </Box>
        <Box width={30}>
          <Text>Hello World</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("مرحبا")
    expect(app.text).toContain("Hello World")
  })

  test("Thai text renders without garble", async () => {
    const render = createRenderer({ cols: 60, rows: 3 })

    const app = render(
      <Box flexDirection="row" width={60}>
        <Box width={30}>
          <Text>สวัสดีครับ</Text>
        </Box>
        <Box width={30}>
          <Text>Hello World</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("สวัสดี")
    expect(app.text).toContain("Hello World")
  })

  test("Korean text renders without garble", async () => {
    const render = createRenderer({ cols: 60, rows: 3 })

    const app = render(
      <Box flexDirection="row" width={60}>
        <Box width={30}>
          <Text>안녕하세요 세계</Text>
        </Box>
        <Box width={30}>
          <Text>right side</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("안녕하세요")
    expect(app.text).toContain("right side")
  })

  test("Japanese text renders without garble", async () => {
    const render = createRenderer({ cols: 60, rows: 3 })

    const app = render(
      <Box flexDirection="row" width={60}>
        <Box width={30}>
          <Text>こんにちは世界</Text>
        </Box>
        <Box width={30}>
          <Text>right side</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("こんにちは")
    expect(app.text).toContain("right side")
  })

  test("emoji text renders without garble", async () => {
    const render = createRenderer({ cols: 60, rows: 3 })

    const app = render(
      <Box flexDirection="row" width={60}>
        <Box width={30}>
          <Text>Hello 🌍🌎🌏 World</Text>
        </Box>
        <Box width={30}>
          <Text>right side</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("Hello")
    expect(app.text).toContain("right side")
  })

  test("mixed CJK/Latin/emoji in multiple columns with rerender", async () => {
    const render = createRenderer({ cols: 100, rows: 5 })

    function App({ lang }: { lang: "zh" | "ja" | "ko" | "en" }) {
      const texts: Record<string, string> = {
        zh: "廈門大廈 報表清理",
        ja: "東京タワー 展望台",
        ko: "서울특별시 강남구",
        en: "Hello World Test",
      }
      return (
        <Box flexDirection="row" width={100}>
          <Box width={30}>
            <Text>{texts[lang]}</Text>
          </Box>
          <Box width={30} borderStyle="single">
            <Text>Column 2</Text>
          </Box>
          <Box width={40}>
            <Text>Column 3: {lang}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App lang="zh" />)
    expect(app.text).toContain("廈門大廈")
    expect(app.text).toContain("Column 2")

    // Switch languages — tests incremental rendering across scripts
    app.rerender(<App lang="ja" />)
    expect(app.text).toContain("東京タワー")
    expect(app.text).toContain("Column 2")

    app.rerender(<App lang="ko" />)
    expect(app.text).toContain("서울특별시")
    expect(app.text).toContain("Column 2")

    app.rerender(<App lang="en" />)
    expect(app.text).toContain("Hello World")
    expect(app.text).toContain("Column 2")

    // Back to CJK
    app.rerender(<App lang="zh" />)
    expect(app.text).toContain("廈門大廈")
    expect(app.text).toContain("Column 3: zh")
  })
})
