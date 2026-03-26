#!/usr/bin/env bun
/**
 * silvery-chat-demo.ts
 * ANSI AI chat hero mockup for Silvery (135 x 60)
 */

const WIDTH = 135
const HEIGHT = 60
const INNER_WIDTH = WIDTH - 2

const HEADER_ROWS = 3
const CHAT_ROWS = 46
const INPUT_ROWS = 7

const CHAT_MAIN_WIDTH = 130
const CARD_MARGIN = "  "
const CARD_WIDTH = 126
const CARD_INNER = CARD_WIDTH - 2

const MINI_INDENT = "  "
const MINI_WIDTH = 120
const MINI_INNER = MINI_WIDTH - 2

type Tone = "cyan" | "green" | "gray" | "yellow" | "magenta"

const RESET = "\x1b[0m"
const ANSI_RE = /\x1b\[[0-9;]*m/g

const paint = (text: string, ...codes: Array<string | number>) => `\x1b[${codes.join(";")}m${text}${RESET}`

const A = {
  bold: (s: string) => paint(s, 1),
  dim: (s: string) => paint(s, 2),
  italic: (s: string) => paint(s, 3),
  underline: (s: string) => paint(s, 4),
  inverse: (s: string) => paint(s, 7),

  cyan: (s: string) => paint(s, 36),
  green: (s: string) => paint(s, 32),
  yellow: (s: string) => paint(s, 33),
  red: (s: string) => paint(s, 31),
  blue: (s: string) => paint(s, 94),
  magenta: (s: string) => paint(s, 35),

  boldCyan: (s: string) => paint(s, 1, 36),
  boldGreen: (s: string) => paint(s, 1, 32),
  boldYellow: (s: string) => paint(s, 1, 33),

  cyanBg: (s: string) => paint(s, 1, 46, 30),
  greenBg: (s: string) => paint(s, 1, 42, 30),
  grayBg: (s: string) => paint(s, 1, 97, 100),

  dark: (s: string) => paint(s, 38, 5, 240),
  orange: (s: string) => paint(s, 38, 5, 208),
  purple: (s: string) => paint(s, 38, 5, 141),
}

function isFullwidthCodePoint(codePoint: number): boolean {
  if (Number.isNaN(codePoint)) return false
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  )
}

function charWidth(ch: string): number {
  if (!ch) return 0
  if (/\p{Mark}/u.test(ch)) return 0
  const cp = ch.codePointAt(0) ?? 0
  if (cp === 0 || cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0
  return isFullwidthCodePoint(cp) ? 2 : 1
}

function stringWidth(input: string): number {
  let width = 0
  const clean = input.replace(ANSI_RE, "")
  for (const ch of clean) width += charWidth(ch)
  return width
}

function sliceAnsi(input: string, maxWidth: number): string {
  let out = ""
  let width = 0

  for (let i = 0; i < input.length; ) {
    if (input[i] === "\x1b") {
      const match = input.slice(i).match(/^\x1b\[[0-9;]*m/)
      if (match) {
        out += match[0]
        i += match[0].length
        continue
      }
    }

    const cp = input.codePointAt(i)
    if (cp == null) break

    const ch = String.fromCodePoint(cp)
    const w = charWidth(ch)
    if (width + w > maxWidth) break

    out += ch
    width += w
    i += ch.length
  }

  return out + RESET
}

function fit(input: string, width: number): string {
  const clipped = stringWidth(input) > width ? sliceAnsi(input, width) : input
  const pad = Math.max(0, width - stringWidth(clipped))
  return clipped + " ".repeat(pad)
}

function between(left: string, right: string, width: number): string {
  const total = stringWidth(left) + stringWidth(right)
  if (total <= width) {
    return left + " ".repeat(width - total) + right
  }

  const leftBudget = Math.max(0, width - stringWidth(right) - 1)
  return fit(left, leftBudget) + " " + fit(right, width - leftBudget - 1)
}

function badge(text: string, tone: Tone = "gray"): string {
  switch (tone) {
    case "cyan":
      return paint(` ${text} `, 1, 46, 30)
    case "green":
      return paint(` ${text} `, 1, 42, 30)
    case "gray":
      return paint(` ${text} `, 1, 97, 100)
    case "yellow":
      return paint(` ${text} `, 1, 30, 43)
    case "magenta":
      return paint(` ${text} `, 1, 30, 45)
    default:
      return paint(` ${text} `, 1, 97, 100)
  }
}

function kbd(text: string): string {
  return paint(` ${text} `, 1, 97, 100)
}

function inlineCode(text: string): string {
  return paint(` ${text} `, 97, 100)
}

function progressBar(width: number, ratio: number, tone: "green" | "yellow" | "cyan" = "green"): string {
  const filled = Math.max(0, Math.min(width, Math.round(width * ratio)))
  const empty = width - filled
  const fill = tone === "yellow" ? A.yellow : tone === "cyan" ? A.cyan : A.green
  return fill("█".repeat(filled)) + A.dark("░".repeat(empty))
}

function sparkline(values: number[]): string {
  const ticks = "▁▂▃▄▅▆▇█"
  const max = Math.max(...values, 1)
  return values
    .map((value) => {
      const idx = Math.max(0, Math.min(ticks.length - 1, Math.round((value / max) * (ticks.length - 1))))
      return ticks[idx]
    })
    .join("")
}

function sectionRule(label: string, tone: "cyan" | "green" = "cyan"): string {
  const labelStyled = tone === "green" ? A.boldGreen(` ${label} `) : A.boldCyan(` ${label} `)
  const prefix = A.dark("──")
  const remaining = Math.max(0, INNER_WIDTH - stringWidth(prefix) - stringWidth(` ${label} `))
  return prefix + labelStyled + A.dark("─".repeat(remaining))
}

function centerLine(label: string, width: number): string {
  const plain = ` ${label} `
  const remaining = Math.max(0, width - stringWidth(plain))
  const left = Math.floor(remaining / 2)
  const right = remaining - left
  return A.dark("─".repeat(left)) + A.dim(plain) + A.dark("─".repeat(right))
}

function topBorder(): string {
  return A.boldCyan(`╭${"─".repeat(INNER_WIDTH)}╮`)
}

function bottomBorder(): string {
  return A.boldCyan(`╰${"─".repeat(INNER_WIDTH)}╯`)
}

function frameLine(content: string): string {
  return A.cyan("│") + fit(content, INNER_WIDTH) + A.cyan("│")
}

function chatGutter(index: number): string {
  const thumbStart = 8
  const thumbEnd = 19
  if (index >= thumbStart && index <= thumbEnd) {
    const glyph = index === thumbStart || index === thumbEnd ? "▓" : "█"
    return ` ${A.cyan(glyph)} `
  }
  return ` ${A.dark("│")} `
}

function chatRow(content: string, index: number): string {
  return fit(content, CHAT_MAIN_WIDTH) + chatGutter(index)
}

function messageCard(role: "USER" | "ASSISTANT", tone: "cyan" | "green", time: string, body: string[]): string[] {
  const accent = tone === "cyan" ? A.cyan : A.green
  const roleBadge = badge(role, tone)

  const left = `${A.dim("─ ")}${roleBadge} ${A.dim("─")}`
  const right = `${A.dark(time)} ${A.dim("─")}`
  const gap = Math.max(0, CARD_INNER - stringWidth(left) - stringWidth(right))

  const top = CARD_MARGIN + accent("╭") + left + A.dim("─".repeat(gap)) + right + A.dark("╮")

  const lines = body.map((line) => CARD_MARGIN + accent("│") + fit(line, CARD_INNER) + A.dark("│"))

  const bottom = CARD_MARGIN + accent("╰") + A.dark("─".repeat(CARD_INNER)) + A.dark("╯")

  return [top, ...lines, bottom]
}

function miniBox(header: string, body: string[], footer?: string): string[] {
  const lead = `${A.dark("─ ")}${header} `
  const top =
    MINI_INDENT + A.dark("╭") + lead + A.dark("─".repeat(Math.max(0, MINI_INNER - stringWidth(lead)))) + A.dark("╮")

  const lines = body.map((line) => MINI_INDENT + A.dark("│") + fit(line, MINI_INNER) + A.dark("│"))

  if (!footer) {
    return [top, ...lines, MINI_INDENT + A.dark(`╰${"─".repeat(MINI_INNER)}╯`)]
  }

  const footLead = `${A.dark("─ ")}${footer} `
  const bottom =
    MINI_INDENT +
    A.dark("╰") +
    footLead +
    A.dark("─".repeat(Math.max(0, MINI_INNER - stringWidth(footLead)))) +
    A.dark("╯")

  return [top, ...lines, bottom]
}

function codeLine(no: number, content: string): string {
  return ` ${A.dark(String(no).padStart(3, " "))} ${content}`
}

function buildHeader(): string[] {
  const row1Left = ` ${badge("silvery chat", "cyan")} ${A.bold("AI coding assistant")} ${A.green("●")} ${A.dim("live session")}`
  const row1Right = `${A.dark("model")} ${badge("claude-3.7-sonnet", "gray")} ${A.dark("tokens")} ${A.bold("18.4k / 200k")} ${A.dark("cost")} ${badge("$0.042", "green")}`

  const row2Left = ` ${A.dark("workspace")} ${A.underline("apps/web/src/dashboard")} ${badge("main", "gray")} ${A.green("✓ clean")}`
  const row2Right = `${A.dark("context")} ${progressBar(18, 0.092, "green")} ${A.green(" 9.2%")}   ${A.dark("latency")} ${A.magenta(sparkline([1, 2, 3, 5, 4, 5, 6, 5]))} ${A.dark(" 420 ms")}`

  const row3Left = ` ${kbd("Ctrl+Enter")} send   ${kbd("Ctrl+C")} cancel   ${kbd("/help")} commands   ${kbd("Tab")} complete   ${kbd("Ctrl+K")} model`
  const row3Right = `${badge("agent", "green")} ${badge("diff mode", "gray")} ${badge("streaming", "cyan")}`

  const rows = [
    between(row1Left, row1Right, INNER_WIDTH),
    between(row2Left, row2Right, INNER_WIDTH),
    between(row3Left, row3Right, INNER_WIDTH),
  ]

  if (rows.length !== HEADER_ROWS) {
    throw new Error(`Header row count mismatch: expected ${HEADER_ROWS}, got ${rows.length}`)
  }

  return rows
}

function buildChat(spinner: string, cursor: string): string[] {
  const kw = A.purple
  const ty = A.blue
  const fn = A.cyan
  const str = A.orange
  const cm = A.dark

  const codeBlock = miniBox(
    `${badge("tsx", "cyan")} ${A.dark("dashboard.tsx")}`,
    [
      codeLine(48, `${kw("const")} ${fn("useDashboardState")} = (widgets: ${ty("Widget")}[]) => {`),
      codeLine(
        49,
        `  ${kw("const")} [filter, setFilter] = ${fn("useState")}<${str(`"all"`)} | ${str(`"errors"`)}>(${str(`"all"`)})` +
          `;`,
      ),
      codeLine(
        50,
        `  ${kw("const")} visible = ${fn("useMemo")}(() => ${fn("applyFilter")}(widgets, filter), [widgets, filter]);`,
      ),
      codeLine(51, `  ${kw("const")} groups = ${fn("useMemo")}(() => ${fn("groupWidgets")}(visible), [visible]);`),
      codeLine(52, `  ${cm("// keep data + derivations outside the page component")}`),
      codeLine(53, `  ${kw("return")} { filter, setFilter, visible, groups };`),
      codeLine(54, `};`),
      codeLine(55, `${kw("export")} ${kw("function")} ${fn("DashboardPage")}({ widgets }: ${ty("Props")}) {`),
      codeLine(56, `  ${kw("return")} <${ty("WidgetGrid")} groups={${fn("useDashboardState")}(widgets).groups} />;`),
      codeLine(57, `}`),
    ],
    `${A.dim("extract state + selectors")}`,
  )

  const toolBlock = miniBox(
    `${badge("tool", "gray")} ${badge("bash", "magenta")} ${A.dark("bun test")}`,
    [
      ` ${A.cyan(spinner)} ${A.bold("Running:")} ${inlineCode("bun test")} ${A.dark("in apps/web")}`,
      ` ${A.green("✓")} dashboard renders widget sections`,
      ` ${A.green("✓")} extracts selectors into useDashboardState`,
      ` ${A.green("✓")} preserves URL filter sync + keyboard nav`,
      ` ${A.yellow("⚠")} snapshots updated for empty-state copy`,
    ],
    `${A.green("✓")} ${A.dim("completed in 2.31s · 4 suites · 31 assertions")}`,
  )

  const user1 = messageCard("USER", "cyan", "10:42", [
    ` Can you help me refactor the dashboard component? It's getting too complex.`,
  ])

  const assistant1 = messageCard("ASSISTANT", "green", "10:42", [
    ` Yes — the component is doing ${A.bold("state, data fetching, and render orchestration")} in one place.`,
    ` I'd split it into a ${paint("thin shell", 1, 3)}, ${inlineCode("useDashboardState")}, and a focused ${inlineCode("WidgetGrid")} view.`,
    ` ${paint("> Keep the page component boring; move behavior to places you can test in isolation.", 2, 3)}`,
    `  ${badge("📄 dashboard.tsx", "gray")} ${badge("tsx", "cyan")} ${badge("modified", "green")} ${A.dark("primary refactor target")}`,
    ...codeBlock,
    `  ${A.green("•")} Extract query + filter state into ${inlineCode("useDashboardState")}`,
    `  ${A.green("•")} Collapse derived metrics behind ${inlineCode("useMemo")} selectors`,
    `  ${A.green("•")} Push layout rendering into ${inlineCode("WidgetGrid")}`,
    `  ${A.green("•")} Leave ${inlineCode("DashboardPage")} as wiring + composition only`,
  ])

  const user2 = messageCard("USER", "cyan", "10:43", [` Run the tests to make sure nothing broke`])

  const assistant2 = messageCard("ASSISTANT", "green", "10:43", [
    ...toolBlock,
    ` ${A.bold("Summary:")} ${A.green("12 passed")} ${A.dark("·")} ${A.green("0 failed")} ${A.dark("·")} ${A.yellow("1 warning")}`,
  ])

  const streaming = messageCard("ASSISTANT", "green", "10:44 · streaming", [
    ` Started drafting a patch: move filter/grouping logic into ${inlineCode("useDashboardState")} and keep ${inlineCode("DashboardPage")} as a thin shell...`,
    ` ${A.green(cursor)} ${paint("Thinking...", 2, 3)} ${A.dark("preparing diff hunks and follow-up assertions")}`,
  ])

  const lines: string[] = [
    centerLine("Today · 10:42 AM", CHAT_MAIN_WIDTH),
    ...user1,
    "",
    ...assistant1,
    ...user2,
    "",
    ...assistant2,
    "",
    ...streaming,
  ]

  if (lines.length !== CHAT_ROWS) {
    throw new Error(`Chat row count mismatch: expected ${CHAT_ROWS}, got ${lines.length}`)
  }

  return lines.map((line, i) => chatRow(line, i))
}

function buildInput(cursor: string): string[] {
  const placeholder = "Ask Silvery to edit, explain, or run a command"
  const fieldWidth = 118

  const rows = [
    ` ${badge("compose", "gray")} ${badge("agent mode", "green")} ${badge("@dashboard.tsx", "cyan")} ${badge("@widget-grid.tsx", "gray")} ${A.dark("semantic index ready · 94 files · 2.1k tokens selected")}`,
    ` ${A.boldCyan("›")} ${paint(placeholder.padEnd(fieldWidth, " "), 4, 2, 3)}${A.green(cursor)}`,
    ` ${A.dark("cwd")} ~/src/app/dashboard   ${A.dark("selection")} 2 attached files · 2.1k tokens   ${A.dark("mode")} safe apply`,
    ` ${A.dark("Use")} ${kbd("@file")} ${A.dark("to attach files,")} ${kbd("!")} ${A.dark("for shell,")} ${kbd("/help")} ${A.dark("for commands")}`,
    ` ${A.green("✓")} ${A.dim("ready")} ${A.dark("·")} ${A.dim("no active tools")} ${A.dark("·")} ${A.dim("context window healthy")}`,
    ` ${kbd("Ctrl+Enter")} send   ${kbd("Ctrl+C")} cancel   ${kbd("Ctrl+L")} clear   ${kbd("Tab")} complete`,
    ` ${kbd("/help")} commands   ${kbd("/model")} switch model   ${kbd("/cost")} usage   ${kbd("/theme")} preview`,
  ]

  if (rows.length !== INPUT_ROWS) {
    throw new Error(`Input row count mismatch: expected ${INPUT_ROWS}, got ${rows.length}`)
  }

  return rows
}

function renderFrame(spinner: string, cursor: string): string {
  const lines = [
    topBorder(),
    ...buildHeader().map(frameLine),
    frameLine(sectionRule("conversation", "cyan")),
    ...buildChat(spinner, cursor).map(frameLine),
    frameLine(sectionRule("composer", "green")),
    ...buildInput(cursor).map(frameLine),
    bottomBorder(),
  ]

  if (lines.length !== HEIGHT) {
    throw new Error(`Frame height mismatch: expected ${HEIGHT}, got ${lines.length}`)
  }

  lines.forEach((line, i) => {
    const width = stringWidth(line)
    if (width !== WIDTH) {
      throw new Error(`Row ${i + 1} width mismatch: expected ${WIDTH}, got ${width}`)
    }
  })

  return lines.join("\n")
}

const animated = Bun.argv.includes("--animate") && !!process.stdout.isTTY

if (!animated) {
  process.stdout.write(renderFrame("⠙", "█") + "\n")
} else {
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  let tick = 0
  let cleaned = false
  let timer: ReturnType<typeof setInterval> | null = null

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (timer) clearInterval(timer)
    process.stdout.write("\x1b[0m\x1b[?25h\x1b[?1049l")
  }

  process.on("SIGINT", () => {
    cleanup()
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    cleanup()
    process.exit(0)
  })

  process.on("exit", cleanup)

  process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l")

  const draw = () => {
    const spinner = spinnerFrames[tick % spinnerFrames.length]
    const cursor = tick % 2 === 0 ? "█" : "░"
    process.stdout.write("\x1b[H" + renderFrame(spinner, cursor))
    tick += 1
  }

  draw()
  timer = setInterval(draw, 90)
}
