/**
 * Terminal Canvas
 *
 * Click-drag to draw pixel art on a terminal canvas using half-block characters.
 * Each terminal cell holds 2 vertical pixels using Unicode half-block technique.
 *
 * Features:
 * - Half-block pixel art (2x vertical resolution)
 * - Full RGB color picker with HSL gradient
 * - Hue bar + saturation bar for intuitive color selection
 * - Pen and eraser tools
 * - Keyboard shortcuts for color/tool selection
 *
 * Run: bun vendor/silvery/examples/kitty/terminal-canvas.tsx
 */

import { createTerm, enableMouse, disableMouse, parseMouseSequence, isMouseSequence } from "../../src/index.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Char Draw",
  description: "Click-drag to draw with half-block pixel art, RGB color picker",
  features: ["parseMouseSequence()", "enableMouse()", "half-block rendering", "drag tracking", "HSL color picker"],
}

// Half-block characters for 2x vertical resolution
const UPPER_HALF = "\u2580" // ▀ — top filled, bottom empty
const LOWER_HALF = "\u2584" // ▄ — top empty, bottom filled
const FULL_BLOCK = "\u2588" // █ — both filled

type RGB = [number, number, number]

// Preset colors accessible via 1-9/0
const PRESETS: { name: string; color: RGB }[] = [
  { name: "white", color: [255, 255, 255] },
  { name: "red", color: [255, 0, 0] },
  { name: "orange", color: [255, 165, 0] },
  { name: "yellow", color: [255, 255, 0] },
  { name: "green", color: [0, 255, 0] },
  { name: "cyan", color: [0, 255, 255] },
  { name: "blue", color: [0, 100, 255] },
  { name: "magenta", color: [255, 0, 255] },
  { name: "pink", color: [255, 128, 200] },
  { name: "black", color: [0, 0, 0] },
]

// --- HSL <-> RGB conversion ---

function hslToRgb(h: number, s: number, l: number): RGB {
  // h: 0-360, s: 0-1, l: 0-1
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r1: number, g1: number, b1: number
  if (h < 60) {
    ;[r1, g1, b1] = [c, x, 0]
  } else if (h < 120) {
    ;[r1, g1, b1] = [x, c, 0]
  } else if (h < 180) {
    ;[r1, g1, b1] = [0, c, x]
  } else if (h < 240) {
    ;[r1, g1, b1] = [0, x, c]
  } else if (h < 300) {
    ;[r1, g1, b1] = [x, 0, c]
  } else {
    ;[r1, g1, b1] = [c, 0, x]
  }

  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60
  } else {
    h = ((r - g) / d + 4) * 60
  }
  return [h, s, l]
}

type Tool = "pen" | "eraser"

interface CanvasState {
  /** 2D array of pixel colors as RGB tuples (null = empty). Width x Height where height = rows*2 */
  pixels: (RGB | null)[][]
  /** Canvas width in terminal columns */
  width: number
  /** Canvas height in pixel rows (2x terminal rows) */
  height: number
  /** Currently selected color as RGB */
  currentColor: RGB
  /** Current HSL values for picker state */
  hue: number
  saturation: number
  lightness: number
  /** Current tool */
  tool: Tool
  /** Mouse position for status bar */
  mouseX: number
  mouseY: number
  /** Whether mouse is currently pressed */
  isDrawing: boolean
}

// Reserve 4 rows: 1 header, 1 hue bar, 1 saturation bar, 1 status
const RESERVED_ROWS = 4

function createCanvas(cols: number, rows: number): CanvasState {
  const canvasRows = rows - RESERVED_ROWS
  const width = cols
  const height = canvasRows * 2

  const pixels: (RGB | null)[][] = []
  for (let y = 0; y < height; y++) {
    pixels.push(new Array(width).fill(null))
  }

  return {
    pixels,
    width,
    height,
    currentColor: [255, 255, 255],
    hue: 0,
    saturation: 1.0,
    lightness: 0.5,
    tool: "pen",
    mouseX: 0,
    mouseY: 0,
    isDrawing: false,
  }
}

function setPixel(state: CanvasState, termX: number, termY: number): void {
  // termY is relative to terminal row; row 0 is the header
  // Canvas starts at row 1
  const canvasTermRow = termY - 1
  if (canvasTermRow < 0) return

  const pixelY0 = canvasTermRow * 2
  const pixelY1 = pixelY0 + 1

  const x = termX
  if (x < 0 || x >= state.width) return

  const value: RGB | null = state.tool === "pen" ? [...state.currentColor] : null

  if (pixelY0 >= 0 && pixelY0 < state.height) {
    state.pixels[pixelY0]![x] = value
  }
  if (pixelY1 >= 0 && pixelY1 < state.height) {
    state.pixels[pixelY1]![x] = value
  }
}

function renderFrame(state: CanvasState, term: ReturnType<typeof createTerm>): string {
  const lines: string[] = []

  // Header
  lines.push(
    term.dim.yellow("▸ silvery") +
      " " +
      term.bold("Terminal Canvas") +
      " " +
      term.dim("— click-drag to draw") +
      "  " +
      term.dim("1-9/0 preset  [/] hue  -/= sat  b bright  e eraser  c clear  q quit"),
  )

  // Canvas: convert pixel pairs to half-block characters
  const canvasRows = Math.floor(state.height / 2)
  for (let row = 0; row < canvasRows; row++) {
    let line = ""
    for (let col = 0; col < state.width; col++) {
      const topPixel = state.pixels[row * 2]![col]
      const bottomPixel = state.pixels[row * 2 + 1]![col]

      if (topPixel === null && bottomPixel === null) {
        line += " "
      } else if (topPixel !== null && bottomPixel === null) {
        const [r, g, b] = topPixel
        line += term.rgb(r, g, b)(UPPER_HALF)
      } else if (topPixel === null && bottomPixel !== null) {
        const [r, g, b] = bottomPixel
        line += term.rgb(r, g, b)(LOWER_HALF)
      } else if (
        topPixel !== null &&
        topPixel[0] === bottomPixel?.[0] &&
        topPixel[1] === bottomPixel[1] &&
        topPixel[2] === bottomPixel[2]
      ) {
        const [r, g, b] = topPixel
        line += term.rgb(r, g, b)(FULL_BLOCK)
      } else {
        const [tr, tg, tb] = topPixel!
        const [br, bg, bb] = bottomPixel!
        line += term.rgb(tr, tg, tb).bgRgb(br, bg, bb)(UPPER_HALF)
      }
    }
    lines.push(line)
  }

  // --- Hue gradient bar ---
  // Each column maps to a hue value; full saturation, 0.5 lightness
  let hueLine = ""
  for (let col = 0; col < state.width; col++) {
    const hue = (col / state.width) * 360
    const [r, g, b] = hslToRgb(hue, 1.0, 0.5)
    // Mark the selected hue column
    const isSelected = Math.abs(hue - state.hue) < 360 / state.width / 2 + 0.5
    if (isSelected) {
      hueLine += term.bgRgb(r, g, b).black("▼")
    } else {
      hueLine += term.bgRgb(r, g, b)(" ")
    }
  }
  lines.push(hueLine)

  // --- Saturation/brightness bar ---
  // Left half: saturation gradient at current hue. Right half: lightness gradient.
  const halfWidth = Math.floor(state.width / 2)
  let satLine = ""
  for (let col = 0; col < halfWidth; col++) {
    const sat = col / (halfWidth - 1)
    const [r, g, b] = hslToRgb(state.hue, sat, state.lightness)
    const isSelected = Math.abs(sat - state.saturation) < 1 / (halfWidth - 1) / 2 + 0.01
    if (isSelected) {
      satLine += term.bgRgb(r, g, b)(r + g + b > 384 ? term.black("◆") : term.white("◆"))
    } else {
      satLine += term.bgRgb(r, g, b)(" ")
    }
  }
  // Separator
  satLine += term.dim("│")
  // Lightness gradient
  for (let col = 0; col < state.width - halfWidth - 1; col++) {
    const lit = col / (state.width - halfWidth - 2)
    const [r, g, b] = hslToRgb(state.hue, state.saturation, lit)
    const isSelected = Math.abs(lit - state.lightness) < 1 / (state.width - halfWidth - 2) / 2 + 0.01
    if (isSelected) {
      satLine += term.bgRgb(r, g, b)(r + g + b > 384 ? term.black("◆") : term.white("◆"))
    } else {
      satLine += term.bgRgb(r, g, b)(" ")
    }
  }
  lines.push(satLine)

  // --- Status bar with color preview ---
  const [cr, cg, cb] = state.currentColor
  const colorSwatch = term.bgRgb(cr, cg, cb)("    ") // 4-char swatch
  const toolLabel = state.tool === "pen" ? "Pen" : "Eraser"
  const pos = `(${state.mouseX}, ${state.mouseY})`
  const rgbLabel = `rgb(${cr}, ${cg}, ${cb})`
  const hexLabel = `#${cr.toString(16).padStart(2, "0")}${cg.toString(16).padStart(2, "0")}${cb.toString(16).padStart(2, "0")}`

  lines.push(
    ` ${colorSwatch} ${term.bold(rgbLabel)} ${term.dim(hexLabel)}` +
      `  ${term.dim("Tool:")} ${term.bold(toolLabel)}` +
      `  ${term.dim("HSL:")} ${Math.round(state.hue)}° ${Math.round(state.saturation * 100)}% ${Math.round(state.lightness * 100)}%` +
      `  ${term.dim("Pos:")} ${pos}`,
  )

  return lines.join("\n")
}

async function main() {
  const crashCleanup = () => {
    const stdout = process.stdout
    stdout.write("\x1b[?1003l\x1b[?1006l") // Disable mouse
    stdout.write("\x1b[?25h") // Show cursor
    stdout.write("\x1b[?1049l") // Exit alternate screen
    stdout.write("\x1b[0m") // Reset colors
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false)
      } catch {}
    }
  }
  process.on("uncaughtException", (err) => {
    crashCleanup()
    throw err
  })

  using term = createTerm()
  const cols = term.cols ?? 80
  const rows = term.rows ?? 24

  const state = createCanvas(cols, rows)

  const { stdin, stdout } = process

  // Enable raw mode and mouse tracking
  if (stdin.isTTY) {
    stdin.setRawMode(true)
  }
  stdin.resume()
  stdout.write(enableMouse())

  // Enter alternate screen, hide cursor
  stdout.write("\x1b[?1049h")
  stdout.write("\x1b[?25l")

  // Clear screen and render initial frame
  stdout.write("\x1b[2J\x1b[H")
  stdout.write(renderFrame(state, term))

  const redraw = () => {
    stdout.write("\x1b[H")
    stdout.write(renderFrame(state, term))
  }

  /** Update currentColor from current HSL state */
  const syncColor = () => {
    state.currentColor = hslToRgb(state.hue, state.saturation, state.lightness)
  }

  /** Compute terminal row indices for the UI bars */
  const canvasTermRows = () => Math.floor(state.height / 2)

  const onData = (data: Buffer) => {
    const raw = data.toString()

    // Check for mouse events
    if (isMouseSequence(raw)) {
      const parsed = parseMouseSequence(raw)
      if (!parsed) return

      state.mouseX = parsed.x
      state.mouseY = parsed.y

      const hueBarRow = 1 + canvasTermRows() // row after header + canvas
      const satBarRow = hueBarRow + 1
      const halfWidth = Math.floor(state.width / 2)

      if (parsed.action === "down" && parsed.button === 0) {
        if (parsed.y === hueBarRow) {
          // Click on hue bar
          state.hue = (parsed.x / state.width) * 360
          syncColor()
          state.tool = "pen"
          redraw()
        } else if (parsed.y === satBarRow) {
          if (parsed.x < halfWidth) {
            // Click on saturation section
            state.saturation = Math.max(0, Math.min(1, parsed.x / (halfWidth - 1)))
            syncColor()
            state.tool = "pen"
          } else if (parsed.x > halfWidth) {
            // Click on lightness section
            const litCol = parsed.x - halfWidth - 1
            const litWidth = state.width - halfWidth - 2
            state.lightness = Math.max(0, Math.min(1, litCol / litWidth))
            syncColor()
            state.tool = "pen"
          }
          redraw()
        } else if (parsed.y > 0 && parsed.y < hueBarRow) {
          // Click on canvas
          state.isDrawing = true
          setPixel(state, parsed.x, parsed.y)
          redraw()
        } else {
          redraw()
        }
      } else if (parsed.action === "move" && state.isDrawing) {
        if (parsed.y > 0 && parsed.y < hueBarRow) {
          setPixel(state, parsed.x, parsed.y)
        }
        redraw()
      } else if (parsed.action === "up") {
        state.isDrawing = false
        redraw()
      } else {
        redraw()
      }
      return
    }

    // Keyboard input
    for (const ch of raw) {
      if (ch === "q" || ch === "\x1b") {
        cleanup()
        return
      }

      if (ch === "e") {
        state.tool = state.tool === "eraser" ? "pen" : "eraser"
        redraw()
      } else if (ch === "c") {
        for (let y = 0; y < state.height; y++) {
          state.pixels[y]!.fill(null)
        }
        redraw()
      } else if (ch >= "1" && ch <= "9") {
        const preset = PRESETS[Number(ch) - 1]
        if (preset) {
          state.currentColor = [...preset.color]
          const [h, s, l] = rgbToHsl(...preset.color)
          state.hue = h
          state.saturation = s
          state.lightness = l
          state.tool = "pen"
          redraw()
        }
      } else if (ch === "0") {
        const preset = PRESETS[9]
        if (preset) {
          state.currentColor = [...preset.color]
          const [h, s, l] = rgbToHsl(...preset.color)
          state.hue = h
          state.saturation = s
          state.lightness = l
          state.tool = "pen"
          redraw()
        }
      } else if (ch === "[") {
        // Cycle hue left
        state.hue = (state.hue - 5 + 360) % 360
        syncColor()
        state.tool = "pen"
        redraw()
      } else if (ch === "]") {
        // Cycle hue right
        state.hue = (state.hue + 5) % 360
        syncColor()
        state.tool = "pen"
        redraw()
      } else if (ch === "-") {
        // Decrease saturation
        state.saturation = Math.max(0, state.saturation - 0.05)
        syncColor()
        state.tool = "pen"
        redraw()
      } else if (ch === "=") {
        // Increase saturation
        state.saturation = Math.min(1, state.saturation + 0.05)
        syncColor()
        state.tool = "pen"
        redraw()
      } else if (ch === "b") {
        // Cycle brightness: 0.5 -> 0.75 -> 1.0 -> 0.25 -> 0.5
        if (state.lightness < 0.3) {
          state.lightness = 0.5
        } else if (state.lightness < 0.55) {
          state.lightness = 0.75
        } else if (state.lightness < 0.8) {
          state.lightness = 1.0
        } else {
          state.lightness = 0.25
        }
        syncColor()
        state.tool = "pen"
        redraw()
      }
    }
  }

  const cleanup = () => {
    stdout.write(disableMouse())
    stdout.write("\x1b[?25h") // Show cursor
    stdout.write("\x1b[?1049l") // Exit alternate screen
    if (stdin.isTTY) {
      stdin.setRawMode(false)
    }
    stdin.off("data", onData)
    stdin.pause()
    process.exit(0)
  }

  stdin.on("data", onData)

  // Handle terminal resize
  stdout.on("resize", () => {
    const newCols = stdout.columns ?? cols
    const newRows = stdout.rows ?? rows
    const newState = createCanvas(newCols, newRows)
    // Copy existing pixels that still fit
    for (let y = 0; y < Math.min(state.height, newState.height); y++) {
      for (let x = 0; x < Math.min(state.width, newState.width); x++) {
        newState.pixels[y]![x] = state.pixels[y]![x]!
      }
    }
    state.pixels = newState.pixels
    state.width = newState.width
    state.height = newState.height
    stdout.write("\x1b[2J\x1b[H")
    redraw()
  })
}

if (import.meta.main) {
  main().catch((err) => {
    // Restore terminal on crash
    const stdout = process.stdout
    stdout.write("\x1b[?1003l\x1b[?1006l") // Disable mouse
    stdout.write("\x1b[?25h") // Show cursor
    stdout.write("\x1b[?1049l") // Exit alternate screen
    stdout.write("\x1b[0m") // Reset colors
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false)
      } catch {}
    }
    console.error(err)
    process.exit(1)
  })
}
