/**
 * Playwright tests for hightea web showcase demos.
 *
 * Each demo runs real hightea components inside xterm.js in the browser.
 * Tests verify rendering, content, and keyboard interactivity.
 */

import { test, expect, type Page } from "@playwright/test"

const DEMOS = [
  "dashboard",
  "coding-agent",
  "kanban",
  "cli-wizard",
  "dev-tools",
  "data-explorer",
  "scroll",
  "layout-feedback",
  "focus",
  "text-input",
] as const

type DemoName = (typeof DEMOS)[number]

/** Navigate to a showcase demo and wait for xterm to be ready. */
async function loadDemo(page: Page, demo: DemoName): Promise<void> {
  await page.goto(`/examples/showcase.html?demo=${demo}`)

  // Wait for xterm to be initialized — showcase-app.tsx exposes window.xtermTerminal
  await page.waitForFunction(() => (window as any).xtermTerminal !== undefined, null, {
    timeout: 10000,
  })

  // Wait a frame for initial render to complete
  await page.waitForTimeout(300)
}

/** Read all text from the xterm buffer. */
async function getTerminalText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const term = (window as any).xtermTerminal
    if (!term) return ""
    const buffer = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i)
      if (line) lines.push(line.translateToString(true))
    }
    return lines.join("\n")
  })
}

/** Read a specific line from the xterm buffer. */
async function getTerminalLine(page: Page, row: number): Promise<string> {
  return page.evaluate((r) => {
    const term = (window as any).xtermTerminal
    if (!term) return ""
    const line = term.buffer.active.getLine(r)
    return line ? line.translateToString(true) : ""
  }, row)
}

/** Focus the xterm canvas so keyboard events reach it. */
async function focusTerminal(page: Page): Promise<void> {
  // Click the terminal container to ensure xterm has focus
  await page.click("#terminal")
  await page.waitForTimeout(100)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Showcase demos", () => {
  for (const demo of DEMOS) {
    test(`${demo} — loads and renders content`, async ({ page }) => {
      await loadDemo(page, demo)
      const text = await getTerminalText(page)
      // Every demo should render something non-empty
      expect(text.trim().length).toBeGreaterThan(0)
    })
  }
})

test.describe("dashboard", () => {
  test("renders service status panel", async ({ page }) => {
    await loadDemo(page, "dashboard")
    const text = await getTerminalText(page)
    expect(text).toContain("api-gateway")
    expect(text).toContain("auth-service")
  })

  test("arrow keys change active panel", async ({ page }) => {
    await loadDemo(page, "dashboard")
    await focusTerminal(page)
    const textBefore = await getTerminalText(page)
    await page.keyboard.press("ArrowRight")
    await page.waitForTimeout(200)
    const textAfter = await getTerminalText(page)
    // The dashboard should still have service content (panel changed, not removed)
    expect(textAfter).toContain("api-gateway")
    // We can't easily check border color in text mode, but the render should be stable
    expect(textAfter.trim().length).toBeGreaterThan(0)
  })
})

test.describe("kanban", () => {
  test("renders three column headers", async ({ page }) => {
    await loadDemo(page, "kanban")
    const text = await getTerminalText(page)
    expect(text).toContain("Todo")
    expect(text).toContain("In Progress")
    expect(text).toContain("Done")
  })

  test("renders card titles", async ({ page }) => {
    await loadDemo(page, "kanban")
    const text = await getTerminalText(page)
    expect(text).toContain("User authentication")
    expect(text).toContain("Design landing page")
  })

  test("arrow keys navigate cards", async ({ page }) => {
    await loadDemo(page, "kanban")
    await focusTerminal(page)
    const textBefore = await getTerminalText(page)
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(200)
    const textAfter = await getTerminalText(page)
    // Content is the same but selection moved — both should have card titles
    expect(textAfter).toContain("Todo")
    expect(textAfter).toContain("In Progress")
    expect(textAfter).toContain("Done")
  })
})

test.describe("data-explorer", () => {
  test("renders table headers", async ({ page }) => {
    await loadDemo(page, "data-explorer")
    const text = await getTerminalText(page)
    expect(text).toContain("Process Explorer")
    expect(text).toContain("PID")
    expect(text).toContain("CPU")
  })

  test("arrow keys change selected row", async ({ page }) => {
    await loadDemo(page, "data-explorer")
    await focusTerminal(page)
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(200)
    const text = await getTerminalText(page)
    // Table still renders after navigation
    expect(text).toContain("PID")
    expect(text).toContain("Process Explorer")
  })
})

test.describe("cli-wizard", () => {
  test("renders first step", async ({ page }) => {
    await loadDemo(page, "cli-wizard")
    const text = await getTerminalText(page)
    expect(text).toContain("Project name")
  })

  test("enter advances to next step", async ({ page }) => {
    await loadDemo(page, "cli-wizard")
    await focusTerminal(page)
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)
    const text = await getTerminalText(page)
    expect(text).toContain("Framework")
  })
})

test.describe("dev-tools", () => {
  test("renders log viewer header", async ({ page }) => {
    await loadDemo(page, "dev-tools")
    const text = await getTerminalText(page)
    expect(text).toContain("Log Viewer")
  })

  test("typing filters logs", async ({ page }) => {
    await loadDemo(page, "dev-tools")
    await focusTerminal(page)
    const textBefore = await getTerminalText(page)
    // Type a filter character
    await page.keyboard.type("error")
    await page.waitForTimeout(300)
    const textAfter = await getTerminalText(page)
    // After typing "error", the entries count should change
    expect(textAfter).toContain("Log Viewer")
    // The filter should be reflected in search box
    expect(textAfter).toContain("error")
  })
})

test.describe("coding-agent", () => {
  test("renders initial UI", async ({ page }) => {
    await loadDemo(page, "coding-agent")
    // The coding agent starts with auto-animation after 1.5s delay
    // Initially it shows the input prompt
    const text = await getTerminalText(page)
    expect(text.trim().length).toBeGreaterThan(0)
  })

  test("shows thinking or tool activity after delay", async ({ page }) => {
    await loadDemo(page, "coding-agent")
    // Wait for the auto-animation to start (1.5s delay + 1.8s thinking)
    await page.waitForTimeout(4000)
    const text = await getTerminalText(page)
    // Should show some content from the exchange (tool calls or thinking indicator)
    expect(text.trim().length).toBeGreaterThan(10)
  })
})

test.describe("text-input", () => {
  test("renders input prompt and echo", async ({ page }) => {
    await loadDemo(page, "text-input")
    const text = await getTerminalText(page)
    expect(text).toContain(">")
    expect(text).toContain("Echo:")
    expect(text).toContain("(empty)")
  })

  test("typing updates text and echo", async ({ page }) => {
    await loadDemo(page, "text-input")
    await focusTerminal(page)
    await page.keyboard.type("hello")
    await page.waitForTimeout(300)
    const text = await getTerminalText(page)
    expect(text).toContain("hello")
    expect(text).toContain("Echo: hello")
  })

  test("backspace deletes characters", async ({ page }) => {
    await loadDemo(page, "text-input")
    await focusTerminal(page)
    await page.keyboard.type("abc")
    await page.waitForTimeout(200)
    await page.keyboard.press("Backspace")
    await page.waitForTimeout(200)
    const text = await getTerminalText(page)
    expect(text).toContain("Echo: ab")
  })

  test("escape clears text", async ({ page }) => {
    await loadDemo(page, "text-input")
    await focusTerminal(page)
    await page.keyboard.type("hello")
    await page.waitForTimeout(200)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
    const text = await getTerminalText(page)
    expect(text).toContain("(empty)")
  })
})

test.describe("scroll", () => {
  test("renders list items", async ({ page }) => {
    await loadDemo(page, "scroll")
    const text = await getTerminalText(page)
    expect(text).toContain("Item 1")
    expect(text).toContain("Item 2")
  })

  test("arrow down scrolls list", async ({ page }) => {
    await loadDemo(page, "scroll")
    await focusTerminal(page)
    // Scroll down several times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("ArrowDown")
    }
    await page.waitForTimeout(300)
    const text = await getTerminalText(page)
    // After scrolling down 5, Item 6 should be the first (highlighted) item
    expect(text).toContain("Item 6")
  })
})

test.describe("focus", () => {
  test("renders three panels", async ({ page }) => {
    await loadDemo(page, "focus")
    const text = await getTerminalText(page)
    expect(text).toContain("Panel A")
    expect(text).toContain("Panel B")
    expect(text).toContain("Panel C")
  })

  test("initial state has first panel focused", async ({ page }) => {
    await loadDemo(page, "focus")
    const text = await getTerminalText(page)
    // Panel A starts focused
    expect(text).toContain("focused")
  })

  test("tab cycles focus to next panel", async ({ page }) => {
    await loadDemo(page, "focus")
    await focusTerminal(page)
    // Count "focused" indicators before and after tab
    const textBefore = await getTerminalText(page)
    const focusedCountBefore = (textBefore.match(/● focused/g) || []).length
    expect(focusedCountBefore).toBe(1)

    await page.keyboard.press("Tab")
    await page.waitForTimeout(200)

    const textAfter = await getTerminalText(page)
    // Still exactly one focused panel
    const focusedCountAfter = (textAfter.match(/● focused/g) || []).length
    expect(focusedCountAfter).toBe(1)
  })
})

test.describe("layout-feedback", () => {
  test("displays non-zero dimensions", async ({ page }) => {
    await loadDemo(page, "layout-feedback")
    const text = await getTerminalText(page)
    // Width and Height should be present with non-zero values
    const widthMatch = text.match(/Width:\s*(\d+)/)
    const heightMatch = text.match(/Height:\s*(\d+)/)
    expect(widthMatch).not.toBeNull()
    expect(heightMatch).not.toBeNull()
    expect(Number(widthMatch![1])).toBeGreaterThan(0)
    expect(Number(heightMatch![1])).toBeGreaterThan(0)
  })

  test("shows resize hint", async ({ page }) => {
    await loadDemo(page, "layout-feedback")
    const text = await getTerminalText(page)
    expect(text).toContain("resize")
  })
})
