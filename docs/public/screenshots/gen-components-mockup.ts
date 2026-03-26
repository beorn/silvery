#!/usr/bin/env bun

const R = "\x1b[0m"
const B = "\x1b[1m"
const D = "\x1b[2m"
const C = "\x1b[36m"
const G = "\x1b[32m"
const Y = "\x1b[33m"
const E = "\x1b[31m"
const IFO = "\x1b[94m"
const BC = "\x1b[1;36m"
const U = "\x1b[4m"
const INV = "\x1b[7m"
const PBTN = "\x1b[46;30m"
const SBTN = "\x1b[100m"

const FRAME_W = 135
const FRAME_H = 40
const PANEL_W = 66
const TOP_H = 18
const BOTTOM_H = 19

const ansiRE = /\x1b\[[0-9;]*m/g

const stripAnsi = (s: string): string => s.replace(ansiRE, "")
const visibleWidth = (s: string): number => stripAnsi(s).length

const pad = (s: string, width: number): string => {
  const len = visibleWidth(s)
  if (len > width) {
    throw new Error(`Line too wide (${len}/${width}): ${stripAnsi(s)}`)
  }
  return `${s}${R}${" ".repeat(width - len)}`
}

const padPlain = (s: string, width: number): string => {
  if (s.length > width) {
    throw new Error(`Plain text too wide (${s.length}/${width}): ${s}`)
  }
  return s + " ".repeat(width - s.length)
}

const title = (text: string, meta = ""): string => (meta ? ` ${BC}${text}${R} ${D}· ${meta}${R}` : ` ${BC}${text}${R}`)

const section = (text: string): string => {
  const head = ` ${text} `
  return `${D}${head}${"─".repeat(PANEL_W - head.length)}${R}`
}

const primaryButton = (label: string): string => `${PBTN}[ ${label} ]${R}`
const secondaryButton = (label: string): string => `${SBTN}[ ${label} ]${R}`
const disabledButton = (label: string): string => `${D}[ ${label} ]${R}`
const kbd = (label: string): string => `${SBTN} ${label} ${R}`
const badge = (icon: string, label: string, color: string): string => `${color}${icon} ${label}${R}`
const swatch = (color: string, label: string): string => `${color}██${R} ${label}`

const progressLine = (label: string, pct: number, color: string, status: string): string => {
  const barW = 22
  const fill = Math.round((pct / 100) * barW)
  return ` ${label.padEnd(17)} ${color}${"█".repeat(fill)}${R}${D}${"░".repeat(barW - fill)}${R} ${B}${String(pct).padStart(3)}%${R} ${D}${status}${R}`
}

const indeterminateLine = (label: string, status: string): string => {
  const sweep = "░░░█████░░░░█████░░░░░"
  return ` ${label.padEnd(17)} ${IFO}${sweep}${R} ${B} --${R} ${D}${status}${R}`
}

const miniMeter = (label: string, pct: number, color: string): string => {
  const barW = 10
  const fill = Math.round((pct / 100) * barW)
  return `${label} ${color}${"█".repeat(fill)}${R}${D}${"░".repeat(barW - fill)}${R} ${String(pct).padStart(2)}%`
}

const boxTop = (label: string, totalWidth: number): string => {
  const tag = `─ ${label} `
  return `╭${tag}${"─".repeat(totalWidth - 2 - tag.length)}╮`
}

const boxLine = (text: string, totalWidth: number): string => `│${pad(text, totalWidth - 2)}│`

const boxBottom = (totalWidth: number): string => `╰${"─".repeat(totalWidth - 2)}╯`

const codeLine = (text: string, width = 54): string => `  ${SBTN}${padPlain(text, width)}${R}`

const notesW = 56
const modalW = 52
const modalIndent = "       "
const modalActions = `       ${secondaryButton("Cancel")}    ${primaryButton("Publish")}`

const topLeft: string[] = [
  title("Progress & Status", "bars, motion, compact badges"),
  section("ProgressBar"),
  progressLine("Build pipeline", 100, G, "complete"),
  progressLine("Dependency graph", 73, C, "indexing"),
  progressLine("Snapshot export", 35, Y, "packing"),
  indeterminateLine("Streaming logs", "tailing"),
  ` ${D}Filled track uses █, empty track uses ░, labels stay scannable.${R}`,
  section("Spinner"),
  ` ${C}⠋${R}  Resolving theme tokens`,
  ` ${C}⠙${R}  Streaming component docs`,
  ` ${C}⠹${R}  Waiting for terminal resize`,
  section("Badge"),
  ` ${badge("●", "Active", G)}   ${badge("○", "Inactive", D)}`,
  ` ${badge("✓", "Passed", G)}   ${badge("✗", "Failed", E)}`,
  ` ${D}Inline mix:${R} ${badge("●", "Live", G)}  ${badge("✓", "Stable", G)}  ${badge("○", "Idle", D)}  ${badge("✗", "Alert", E)}`,
  ` ${miniMeter("CPU", 78, Y)}   ${miniMeter("RAM", 61, C)}`,
  ` Services: ${badge("●", "API", G)}  ${badge("●", "Cache", G)}  ${badge("●", "Queue", Y)}  ${badge("●", "Worker", E)}`,
  ` ${D}Snapshot-friendly output · no alt screen · safe to cat.${R}`,
]

const topRight: string[] = [
  title("Input Controls", "focused, disabled, selected"),
  section("TextInput"),
  ` ${C}›${R} Name     ${U}silvery-ui${R}${C}█${R}`,
  ` ${D}›${R} Search   ${U}${D}filter components...${R}`,
  ` ${D}› Token    ${U}read-only preview${R}${D}  (disabled)${R}`,
  section("TextArea"),
  ` ${boxTop("Notes", notesW)}`,
  ` ${boxLine("Ship a polished terminal component catalog with focus,", notesW)}`,
  ` ${boxLine("disabled, and success states rendered in raw ANSI.", notesW)}`,
  ` ${boxBottom(notesW)}`,
  section("Toggle"),
  ` Notifications [x] On      Offline cache [ ] Off`,
  ` Focus ring    [x] On      ${D}Telemetry [x] On (disabled)${R}`,
  section("SelectList"),
  ` ${C}▸${R} ${INV}Oceanic Silver${R}  default theme`,
  ` ${D}  Frosted Graphite${R}`,
  ` ${D}  Plain ANSI${R}`,
  ` ${D}Buttons${R}  ${primaryButton("Primary")}  ${secondaryButton("Secondary")}  ${disabledButton("Disabled")}`,
]

const bottomLeft: string[] = [
  title("Typography & Tokens", "hierarchy, palette, borders"),
  ` ${D}H1${R}  ${BC}Silvery Terminal Components${R}`,
  ` ${D}H2${R}  ${B}Clean hierarchy, compact rhythm${R}`,
  ` ${D}Muted${R}  ${D}Secondary notes fade back without disappearing.${R}`,
  ` ${D}Styles${R} ${B}Strong${R} · ${U}Em${R} · ${SBTN}\`backtick\`${R} · ${D}Muted${R}`,
  ` Body copy keeps labels readable beside color-rich controls.`,
  section("Design tokens"),
  ` ${swatch(C, "$primary")}   ${swatch(G, "$success")}   ${swatch(Y, "$warning")}`,
  ` ${swatch(E, "$error")}     ${swatch(IFO, "$info")}      ${D}██${R} $muted`,
  ` Use cyan for structure; green/yellow/red signal success or risk.`,
  section("Border styles"),
  ` ╭──────╮  ┌──────┐  ┏━━━━━━┓  ╔══════╗`,
  ` │round │  │single│  ┃ bold ┃  ║double║`,
  ` ╰──────╯  └──────┘  ┗━━━━━━┛  ╚══════╝`,
  ` round ╭╮╰╯   single ┌┐└┘   bold ┃   double ║`,
  ` Cards prefer round corners; double lines add formality.`,
  ` Rhythm: 2-space insets · 1-space gutters · 66-col panel width`,
  ` Pair ${B}Strong${R} labels with ${D}Muted${R} metadata for fast scanning.`,
  ` ${D}Typography + tokens set tone before interaction begins.${R}`,
]

const bottomRight: string[] = [
  title("Dialog & Layout", "overlay, shortcuts, code"),
  section("Kbd"),
  ` ${kbd("Ctrl+S")} save   ${kbd("⌘K")} menu   ${kbd("Esc")} close   ${kbd("?")} help`,
  section("Blockquote"),
  ` ${C}│${R} “Design for scan speed first; embellish second.”`,
  ` ${C}│${R} ${D}— Silvery TUI guidelines${R}`,
  section("CodeBlock"),
  codeLine(`const gallery = renderGallery({ w: 135, h: 40 });`),
  codeLine(`await Bun.write("components.ansi", gallery);`),
  codeLine(`console.log(gallery);`),
  section("ModalDialog"),
  `${modalIndent}${boxTop("Publish Catalog", modalW)}`,
  `${modalIndent}${boxLine("Export the current gallery snapshot to", modalW)}`,
  `${modalIndent}${boxLine("components.ansi for docs, demos, and QA.", modalW)}`,
  `${modalIndent}${boxLine("Enter confirms · Esc cancels · Tab switches", modalW)}`,
  `${modalIndent}${boxLine(modalActions, modalW)}`,
  `${modalIndent}${boxBottom(modalW)}`,
  ` ${D}Overlay content is boxed, centered, and action-forward.${R}`,
  ` Grid 2×2 · fixed 135×40 canvas · stdout snapshot.`,
]

const expectHeight = (name: string, panel: string[], height: number): void => {
  if (panel.length !== height) {
    throw new Error(`${name} has ${panel.length} rows; expected ${height}`)
  }
}

expectHeight("topLeft", topLeft, TOP_H)
expectHeight("topRight", topRight, TOP_H)
expectHeight("bottomLeft", bottomLeft, BOTTOM_H)
expectHeight("bottomRight", bottomRight, BOTTOM_H)

const topBorder = `${C}╭${"─".repeat(PANEL_W)}┬${"─".repeat(PANEL_W)}╮${R}`
const midBorder = `${C}├${"─".repeat(PANEL_W)}┼${"─".repeat(PANEL_W)}┤${R}`
const bottomBorder = `${C}╰${"─".repeat(PANEL_W)}┴${"─".repeat(PANEL_W)}╯${R}`

const row = (left: string, right: string): string =>
  `${C}│${R}${pad(left, PANEL_W)}${C}│${R}${pad(right, PANEL_W)}${C}│${R}`

const lines: string[] = [
  topBorder,
  ...topLeft.map((line, i) => row(line, topRight[i])),
  midBorder,
  ...bottomLeft.map((line, i) => row(line, bottomRight[i])),
  bottomBorder,
]

if (lines.length !== FRAME_H) {
  throw new Error(`Canvas has ${lines.length} rows; expected ${FRAME_H}`)
}

for (let i = 0; i < lines.length; i++) {
  const w = visibleWidth(lines[i])
  if (w !== FRAME_W) {
    throw new Error(`Row ${i + 1} has width ${w}; expected ${FRAME_W}`)
  }
}

console.log(`${lines.join("\n")}`)
