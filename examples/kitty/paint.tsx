/**
 * Paint — Draw Over Images
 *
 * The flagship demo combining Kitty graphics protocol image display with
 * half-block pixel art drawing. Load a PNG, view it via Kitty graphics,
 * and paint over it with a transparent overlay layer.
 *
 * Features:
 * - Load PNG files or generate a test pattern
 * - Kitty graphics protocol for base image display
 * - Transparent half-block drawing overlay on top
 * - Pencil (click-drag) and eraser tools
 * - HSL color picker with hue bar + saturation/lightness bar
 * - View mode (image only) and draw mode (image + overlay)
 * - Zoom with +/-, fit with f
 * - Brush size via scroll wheel
 * - Clear overlay, toggle modes via keyboard
 *
 * Run: bun vendor/silvery/examples/kitty/paint.tsx [image.png]
 */

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { basename, resolve, dirname, extname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createTerm,
  enableMouse,
  disableMouse,
  parseMouseSequence,
  isMouseSequence,
} from "../../src/index.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Photo Paint",
  description: "Draw over images — Kitty graphics + half-block pixel art overlay",
  features: [
    "Kitty graphics",
    "half-block overlay",
    "parseMouseSequence()",
    "enableMouse()",
    "HSL color picker",
    "brush size",
    "zoom/pan",
  ],
}

// ---------------------------------------------------------------------------
// Half-block characters for 2x vertical resolution
// ---------------------------------------------------------------------------

const UPPER_HALF = "\u2580" // ▀ — top filled, bottom empty
const LOWER_HALF = "\u2584" // ▄ — top empty, bottom filled
const FULL_BLOCK = "\u2588" // █ — both filled

type RGB = [number, number, number]

// ---------------------------------------------------------------------------
// HSL <-> RGB conversion
// ---------------------------------------------------------------------------

function hslToRgb(h: number, s: number, l: number): RGB {
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

// ---------------------------------------------------------------------------
// HSV to RGB (for test pattern)
// ---------------------------------------------------------------------------

function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// ---------------------------------------------------------------------------
// Kitty graphics helpers
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 4096

/** Build Kitty graphics escape sequences for a PNG image. */
function kittyDisplayPng(pngData: Buffer, cols: number, rows: number, id: number = 1): string {
  const b64 = pngData.toString("base64")
  const chunks: string[] = []

  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    const chunk = b64.slice(i, i + CHUNK_SIZE)
    const isLast = i + CHUNK_SIZE >= b64.length
    const more = isLast ? 0 : 1

    if (i === 0) {
      chunks.push(`\x1b_Ga=T,f=100,t=d,i=${id},c=${cols},r=${rows},m=${more};${chunk}\x1b\\`)
    } else {
      chunks.push(`\x1b_Gm=${more};${chunk}\x1b\\`)
    }
  }

  return chunks.join("")
}

/** Build Kitty graphics escape sequences for raw RGBA pixel data. */
function kittyDisplayRgba(
  rgbaData: Buffer,
  srcWidth: number,
  srcHeight: number,
  cols: number,
  rows: number,
  id: number = 1,
): string {
  const b64 = rgbaData.toString("base64")
  const chunks: string[] = []

  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    const chunk = b64.slice(i, i + CHUNK_SIZE)
    const isLast = i + CHUNK_SIZE >= b64.length
    const more = isLast ? 0 : 1

    if (i === 0) {
      chunks.push(
        `\x1b_Ga=T,f=32,t=d,i=${id},s=${srcWidth},v=${srcHeight},c=${cols},r=${rows},m=${more};${chunk}\x1b\\`,
      )
    } else {
      chunks.push(`\x1b_Gm=${more};${chunk}\x1b\\`)
    }
  }

  return chunks.join("")
}

/** Delete all Kitty graphics images from the terminal. */
function kittyDeleteAll(): string {
  return "\x1b_Ga=d;\x1b\\"
}

// ---------------------------------------------------------------------------
// Test pattern generator
// ---------------------------------------------------------------------------

/** Generate a colorful test pattern as RGBA pixel data. */
function generateTestPattern(width: number, height: number): Buffer {
  const buf = Buffer.alloc(width * height * 4)
  const checkerSize = 16

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4

      if (y < height / 2) {
        // Top half: rainbow gradient
        const hue = (x / width) * 360
        const brightness = 0.3 + 0.7 * (1 - y / (height / 2))
        const [r, g, b] = hsvToRgb(hue, 1.0, brightness)
        buf[offset] = r
        buf[offset + 1] = g
        buf[offset + 2] = b
        buf[offset + 3] = 255
      } else {
        // Bottom half: checkerboard with color tint
        const cy = y - Math.floor(height / 2)
        const isLight = (Math.floor(x / checkerSize) + Math.floor(cy / checkerSize)) % 2 === 0
        const hue = (x / width) * 360
        const [hr, hg, hb] = hsvToRgb(hue, 0.4, 1.0)

        if (isLight) {
          buf[offset] = Math.min(255, hr + 40)
          buf[offset + 1] = Math.min(255, hg + 40)
          buf[offset + 2] = Math.min(255, hb + 40)
        } else {
          buf[offset] = Math.max(0, hr - 80)
          buf[offset + 1] = Math.max(0, hg - 80)
          buf[offset + 2] = Math.max(0, hb - 80)
        }
        buf[offset + 3] = 255
      }
    }
  }

  return buf
}

// ---------------------------------------------------------------------------
// PNG dimension reader
// ---------------------------------------------------------------------------

function readPngDimensions(data: Buffer): { width: number; height: number } {
  if (data.length < 24) return { width: 0, height: 0 }

  const sig = data.slice(0, 8)
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!sig.equals(pngSig)) return { width: 0, height: 0 }

  const chunkType = data.slice(12, 16).toString("ascii")
  if (chunkType !== "IHDR") return { width: 0, height: 0 }

  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  return { width, height }
}

// ---------------------------------------------------------------------------
// Preset colors
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

type Mode = "view" | "draw"
type Tool = "pen" | "eraser"

interface PhotoCanvasState {
  // -- Image --
  filename: string
  imgWidth: number
  imgHeight: number
  isPng: boolean
  imageData: Buffer

  // -- Viewport --
  zoom: number
  panX: number
  panY: number
  termCols: number
  /** Terminal rows available for the image area (excluding header + UI bars) */
  imageRows: number

  // -- Mode --
  mode: Mode

  // -- Drawing overlay --
  /** 2D array of overlay pixel colors (null = transparent). Dimensions: overlayHeight x overlayWidth */
  overlay: (RGB | null)[][]
  overlayWidth: number
  /** Pixel rows (2x terminal rows for the image area) */
  overlayHeight: number

  // -- Color / Tool --
  currentColor: RGB
  hue: number
  saturation: number
  lightness: number
  tool: Tool
  brushSize: number

  // -- Mouse --
  mouseX: number
  mouseY: number
  isDrawing: boolean
}

// Reserve rows: 1 header, 1 hue bar, 1 saturation bar, 1 status
const RESERVED_ROWS = 4
const ZOOM_STEP = 0.25
const MIN_BRUSH = 1
const MAX_BRUSH = 8

function createState(
  cols: number,
  rows: number,
  imageData: Buffer,
  filename: string,
  imgWidth: number,
  imgHeight: number,
  isPng: boolean,
): PhotoCanvasState {
  const imageRows = rows - RESERVED_ROWS
  const overlayWidth = cols
  const overlayHeight = imageRows * 2

  const overlay: (RGB | null)[][] = []
  for (let y = 0; y < overlayHeight; y++) {
    overlay.push(new Array(overlayWidth).fill(null))
  }

  return {
    filename,
    imgWidth,
    imgHeight,
    isPng,
    imageData,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    termCols: cols,
    imageRows,
    mode: "draw",
    overlay,
    overlayWidth,
    overlayHeight,
    currentColor: [255, 0, 0],
    hue: 0,
    saturation: 1.0,
    lightness: 0.5,
    tool: "pen",
    brushSize: 1,
    mouseX: 0,
    mouseY: 0,
    isDrawing: false,
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Paint onto the overlay at the given terminal position with the current brush. */
function paintOverlay(state: PhotoCanvasState, termX: number, termY: number): void {
  // termY is relative to full terminal; row 0 = header, image starts at row 1
  const canvasTermRow = termY - 1
  if (canvasTermRow < 0 || canvasTermRow >= state.imageRows) return

  const centerPixelY = canvasTermRow * 2
  const centerX = termX
  const radius = state.brushSize - 1
  const value: RGB | null = state.tool === "pen" ? [...state.currentColor] : null

  // Paint a circle of pixels around the center
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Circular brush: skip corners
      if (dx * dx + dy * dy > (radius + 0.5) * (radius + 0.5)) continue

      const px = centerX + dx
      // Each terminal cell covers 2 pixel rows; paint both sub-pixels
      for (let subY = 0; subY <= 1; subY++) {
        const py = centerPixelY + subY + dy * 2
        if (px >= 0 && px < state.overlayWidth && py >= 0 && py < state.overlayHeight) {
          state.overlay[py]![px] = value
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Zoom / pan helpers
// ---------------------------------------------------------------------------

function displayCols(state: PhotoCanvasState): number {
  return Math.max(1, Math.round(state.termCols * state.zoom))
}

function displayRows(state: PhotoCanvasState): number {
  return Math.max(1, Math.round(state.imageRows * state.zoom))
}

function clampPan(state: PhotoCanvasState): void {
  const dCols = displayCols(state)
  const dRows = displayRows(state)
  const maxPanX = Math.max(0, dCols - state.termCols)
  const maxPanY = Math.max(0, dRows - state.imageRows)
  state.panX = Math.max(0, Math.min(state.panX, maxPanX))
  state.panY = Math.max(0, Math.min(state.panY, maxPanY))
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderHeader(state: PhotoCanvasState, term: ReturnType<typeof createTerm>): string {
  const modeTag = state.mode === "draw" ? term.bold.green(" DRAW ") : term.bold.blue(" VIEW ")

  const toolTag =
    state.tool === "pen"
      ? term.rgb(...state.currentColor)(`[Pen ${state.brushSize}px]`)
      : term.dim("[Eraser]")

  const zoomPct = Math.round(state.zoom * 100)

  return (
    term.dim.yellow("▸ silvery") +
    " " +
    term.bold("Photo Canvas") +
    " " +
    modeTag +
    " " +
    toolTag +
    "  " +
    term.dim("File:") +
    " " +
    term.bold(state.filename) +
    "  " +
    term.dim(`${state.imgWidth}x${state.imgHeight}`) +
    "  " +
    term.dim("Zoom:") +
    " " +
    `${zoomPct}%` +
    "  " +
    term.dim("d draw  v view  e eraser  c clear  +/- zoom  scroll brush  q quit")
  )
}

/** Render the Kitty graphics image (placed at row 2, below the header). */
function renderImage(state: PhotoCanvasState): string {
  const dCols = displayCols(state)
  const dRows = displayRows(state)
  const startRow = 2 // row 1 is header (1-indexed)
  const parts: string[] = []

  // Position cursor
  parts.push(`\x1b[${startRow};1H`)

  // Clear the image area
  for (let r = 0; r < state.imageRows; r++) {
    parts.push(`\x1b[${startRow + r};1H\x1b[2K`)
  }
  parts.push(`\x1b[${startRow};1H`)

  // Delete previous images and draw new one
  parts.push(kittyDeleteAll())

  if (state.isPng) {
    parts.push(kittyDisplayPng(state.imageData, dCols, dRows))
  } else {
    parts.push(kittyDisplayRgba(state.imageData, state.imgWidth, state.imgHeight, dCols, dRows))
  }

  return parts.join("")
}

/** Render the half-block overlay on top of the image (in draw mode). */
function renderOverlay(state: PhotoCanvasState, term: ReturnType<typeof createTerm>): string {
  if (state.mode === "view") return ""

  const parts: string[] = []
  const startRow = 2 // 1-indexed, row below header

  for (let row = 0; row < state.imageRows; row++) {
    let hasPixels = false
    // Check if this row has any overlay pixels
    for (let col = 0; col < state.overlayWidth; col++) {
      if (state.overlay[row * 2]?.[col] !== null || state.overlay[row * 2 + 1]?.[col] !== null) {
        hasPixels = true
        break
      }
    }
    if (!hasPixels) continue

    // Position cursor at the start of this terminal row
    parts.push(`\x1b[${startRow + row};1H`)

    let line = ""
    for (let col = 0; col < state.overlayWidth; col++) {
      const topPixel = state.overlay[row * 2]?.[col] ?? null
      const bottomPixel = state.overlay[row * 2 + 1]?.[col] ?? null

      if (topPixel === null && bottomPixel === null) {
        // Transparent — skip this cell (move cursor right)
        if (line.length > 0) {
          parts.push(line)
          line = ""
        }
        parts.push("\x1b[C") // cursor forward 1
      } else if (topPixel !== null && bottomPixel === null) {
        line += term.rgb(topPixel[0], topPixel[1], topPixel[2])(UPPER_HALF)
      } else if (topPixel === null && bottomPixel !== null) {
        line += term.rgb(bottomPixel[0], bottomPixel[1], bottomPixel[2])(LOWER_HALF)
      } else if (
        topPixel !== null &&
        topPixel[0] === bottomPixel?.[0] &&
        topPixel[1] === bottomPixel[1] &&
        topPixel[2] === bottomPixel[2]
      ) {
        line += term.rgb(topPixel[0], topPixel[1], topPixel[2])(FULL_BLOCK)
      } else {
        // Both pixels different colors: upper half with fg=top, bg=bottom
        line += term
          .rgb(topPixel![0], topPixel![1], topPixel![2])
          .bgRgb(
            bottomPixel![0],
            bottomPixel![1],
            bottomPixel![2],
          )(UPPER_HALF)
      }
    }
    if (line.length > 0) {
      parts.push(line)
    }
  }

  return parts.join("")
}

/** Render the hue gradient bar. */
function renderHueBar(state: PhotoCanvasState, term: ReturnType<typeof createTerm>): string {
  let line = ""
  for (let col = 0; col < state.termCols; col++) {
    const hue = (col / state.termCols) * 360
    const [r, g, b] = hslToRgb(hue, 1.0, 0.5)
    const isSelected = Math.abs(hue - state.hue) < 360 / state.termCols / 2 + 0.5
    if (isSelected) {
      line += term.bgRgb(r, g, b).black("\u25bc") // ▼
    } else {
      line += term.bgRgb(r, g, b)(" ")
    }
  }
  return line
}

/** Render the saturation + lightness bar. */
function renderSatLightBar(state: PhotoCanvasState, term: ReturnType<typeof createTerm>): string {
  const halfWidth = Math.floor(state.termCols / 2)
  let line = ""

  // Saturation gradient (left half)
  for (let col = 0; col < halfWidth; col++) {
    const sat = col / (halfWidth - 1)
    const [r, g, b] = hslToRgb(state.hue, sat, state.lightness)
    const isSelected = Math.abs(sat - state.saturation) < 1 / (halfWidth - 1) / 2 + 0.01
    if (isSelected) {
      line += term.bgRgb(r, g, b)(r + g + b > 384 ? term.black("\u25c6") : term.white("\u25c6")) // ◆
    } else {
      line += term.bgRgb(r, g, b)(" ")
    }
  }

  // Separator
  line += term.dim("\u2502") // │

  // Lightness gradient (right half)
  const rightWidth = state.termCols - halfWidth - 1
  for (let col = 0; col < rightWidth; col++) {
    const lit = col / (rightWidth - 1 || 1)
    const [r, g, b] = hslToRgb(state.hue, state.saturation, lit)
    const isSelected = Math.abs(lit - state.lightness) < 1 / (rightWidth - 1 || 1) / 2 + 0.01
    if (isSelected) {
      line += term.bgRgb(r, g, b)(r + g + b > 384 ? term.black("\u25c6") : term.white("\u25c6"))
    } else {
      line += term.bgRgb(r, g, b)(" ")
    }
  }

  return line
}

/** Render the status bar at the bottom. */
function renderStatusBar(state: PhotoCanvasState, term: ReturnType<typeof createTerm>): string {
  const [cr, cg, cb] = state.currentColor
  const colorSwatch = term.bgRgb(cr, cg, cb)("    ")
  const toolLabel = state.tool === "pen" ? `Pen (${state.brushSize}px)` : "Eraser"
  const pos = `(${state.mouseX}, ${state.mouseY})`
  const rgbLabel = `rgb(${cr}, ${cg}, ${cb})`
  const hexLabel = `#${cr.toString(16).padStart(2, "0")}${cg.toString(16).padStart(2, "0")}${cb.toString(16).padStart(2, "0")}`
  const overlayCount = countOverlayPixels(state)

  return (
    ` ${colorSwatch} ${term.bold(rgbLabel)} ${term.dim(hexLabel)}` +
    `  ${term.dim("Tool:")} ${term.bold(toolLabel)}` +
    `  ${term.dim("HSL:")} ${Math.round(state.hue)}\u00b0 ${Math.round(state.saturation * 100)}% ${Math.round(state.lightness * 100)}%` +
    `  ${term.dim("Pos:")} ${pos}` +
    `  ${term.dim("Overlay:")} ${overlayCount}px` +
    (overlayCount > 0 ? `  ${term.dim("[save possible]")}` : "")
  )
}

function countOverlayPixels(state: PhotoCanvasState): number {
  let count = 0
  for (let y = 0; y < state.overlayHeight; y++) {
    for (let x = 0; x < state.overlayWidth; x++) {
      if (state.overlay[y]![x] !== null) count++
    }
  }
  return count
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

  const { stdin, stdout } = process

  // Load image or generate test pattern
  let filePath = process.argv[2]
  let imageData: Buffer
  let filename: string
  let imgWidth: number
  let imgHeight: number
  let isPng: boolean

  // Auto-load first sample image if no path given
  if (!filePath) {
    const samplesDir = resolve(dirname(fileURLToPath(import.meta.url)), "samples")
    if (existsSync(samplesDir)) {
      const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"])
      const samples = readdirSync(samplesDir)
        .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
        .sort()
      if (samples.length > 0) {
        filePath = resolve(samplesDir, samples[0]!)
      }
    }
  }

  if (filePath && existsSync(filePath)) {
    imageData = Buffer.from(readFileSync(filePath))
    const dims = readPngDimensions(imageData)
    filename = basename(filePath)
    imgWidth = dims.width
    imgHeight = dims.height
    isPng = true
  } else {
    const patternW = 320
    const patternH = 240
    imageData = generateTestPattern(patternW, patternH)
    filename = filePath ? `${filePath} (not found, showing test pattern)` : "test pattern"
    imgWidth = patternW
    imgHeight = patternH
    isPng = false
  }

  const state = createState(cols, rows, imageData, filename, imgWidth, imgHeight, isPng)

  // Enter alternate screen, hide cursor, enable raw mode + mouse
  stdout.write("\x1b[?1049h")
  stdout.write("\x1b[?25l")
  stdout.write("\x1b[2J\x1b[H")

  if (stdin.isTTY) {
    stdin.setRawMode(true)
  }
  stdin.resume()
  stdout.write(enableMouse())

  /** Full redraw: header + image + overlay + UI bars */
  const redraw = () => {
    // Header (row 1)
    stdout.write("\x1b[1;1H\x1b[2K")
    stdout.write(renderHeader(state, term))

    // Image via Kitty graphics
    stdout.write(renderImage(state))

    // Overlay (only in draw mode, rendered on top of image)
    stdout.write(renderOverlay(state, term))

    // Hue bar
    const hueRow = 1 + state.imageRows + 1 // 1-indexed
    stdout.write(`\x1b[${hueRow};1H\x1b[2K`)
    stdout.write(renderHueBar(state, term))

    // Saturation/lightness bar
    stdout.write(`\x1b[${hueRow + 1};1H\x1b[2K`)
    stdout.write(renderSatLightBar(state, term))

    // Status bar
    stdout.write(`\x1b[${hueRow + 2};1H\x1b[2K`)
    stdout.write(renderStatusBar(state, term))
  }

  redraw()

  /** Update currentColor from current HSL state */
  const syncColor = () => {
    state.currentColor = hslToRgb(state.hue, state.saturation, state.lightness)
  }

  const cleanup = () => {
    stdout.write(disableMouse())
    stdout.write(kittyDeleteAll())
    stdout.write("\x1b[?25h")
    stdout.write("\x1b[?1049l")
    if (stdin.isTTY) {
      stdin.setRawMode(false)
    }
    stdin.off("data", onData)
    stdin.pause()
    process.exit(0)
  }

  const hueBarRow = 1 + state.imageRows // 0-indexed terminal row
  const satBarRow = hueBarRow + 1

  const onData = (data: Buffer) => {
    const raw = data.toString()

    // --- Mouse events ---
    if (isMouseSequence(raw)) {
      const parsed = parseMouseSequence(raw)
      if (!parsed) return

      state.mouseX = parsed.x
      state.mouseY = parsed.y

      const halfWidth = Math.floor(state.termCols / 2)

      // Scroll wheel: change brush size
      if (parsed.action === "wheel") {
        state.brushSize = Math.max(
          MIN_BRUSH,
          Math.min(MAX_BRUSH, state.brushSize + (parsed.delta ?? 0)),
        )
        redraw()
        return
      }

      if (parsed.action === "down" && parsed.button === 0) {
        if (parsed.y === hueBarRow) {
          // Click on hue bar
          state.hue = (parsed.x / state.termCols) * 360
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
            const litWidth = state.termCols - halfWidth - 2
            state.lightness = Math.max(0, Math.min(1, litCol / litWidth))
            syncColor()
            state.tool = "pen"
          }
          redraw()
        } else if (state.mode === "draw" && parsed.y > 0 && parsed.y < hueBarRow) {
          // Click on canvas area (draw mode only)
          state.isDrawing = true
          paintOverlay(state, parsed.x, parsed.y)
          redraw()
        } else {
          redraw()
        }
      } else if (parsed.action === "move" && state.isDrawing) {
        if (state.mode === "draw" && parsed.y > 0 && parsed.y < hueBarRow) {
          paintOverlay(state, parsed.x, parsed.y)
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

    // --- Arrow keys (pan) ---
    if (raw === "\x1b[A" || raw === "\x1bOA") {
      state.panY = Math.max(0, state.panY - 2)
      redraw()
      return
    } else if (raw === "\x1b[B" || raw === "\x1bOB") {
      state.panY += 2
      clampPan(state)
      redraw()
      return
    } else if (raw === "\x1b[D" || raw === "\x1bOD") {
      state.panX = Math.max(0, state.panX - 2)
      redraw()
      return
    } else if (raw === "\x1b[C" || raw === "\x1bOC") {
      state.panX += 2
      clampPan(state)
      redraw()
      return
    }

    // --- Single-character keyboard input ---
    for (const ch of raw) {
      switch (ch) {
        case "q":
        case "\x1b":
          cleanup()
          return

        case "d":
          state.mode = "draw"
          redraw()
          break

        case "v":
          state.mode = "view"
          redraw()
          break

        case "e":
          state.tool = state.tool === "eraser" ? "pen" : "eraser"
          redraw()
          break

        case "c":
          // Clear overlay
          for (let y = 0; y < state.overlayHeight; y++) {
            state.overlay[y]!.fill(null)
          }
          redraw()
          break

        case "+":
          state.zoom = Math.min(10.0, state.zoom + ZOOM_STEP)
          clampPan(state)
          redraw()
          break

        case "-":
        case "_":
          state.zoom = Math.max(ZOOM_STEP, state.zoom - ZOOM_STEP)
          clampPan(state)
          redraw()
          break

        case "f":
          state.zoom = 1.0
          state.panX = 0
          state.panY = 0
          redraw()
          break

        // Preset colors 1-9, 0
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
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
          break
        }
        case "0": {
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
          break
        }

        case "[":
          state.hue = (state.hue - 5 + 360) % 360
          syncColor()
          state.tool = "pen"
          redraw()
          break

        case "]":
          state.hue = (state.hue + 5) % 360
          syncColor()
          state.tool = "pen"
          redraw()
          break

        case "b":
          // Cycle brightness
          if (state.lightness < 0.3) state.lightness = 0.5
          else if (state.lightness < 0.55) state.lightness = 0.75
          else if (state.lightness < 0.8) state.lightness = 1.0
          else state.lightness = 0.25
          syncColor()
          state.tool = "pen"
          redraw()
          break

        default:
          break
      }
    }
  }

  stdin.on("data", onData)

  // Handle terminal resize
  stdout.on("resize", () => {
    const newCols = stdout.columns ?? cols
    const newRows = stdout.rows ?? rows
    state.termCols = newCols
    state.imageRows = newRows - RESERVED_ROWS

    // Resize overlay, preserving existing pixels
    const newOverlayWidth = newCols
    const newOverlayHeight = state.imageRows * 2
    const newOverlay: (RGB | null)[][] = []
    for (let y = 0; y < newOverlayHeight; y++) {
      const row: (RGB | null)[] = new Array(newOverlayWidth).fill(null)
      for (let x = 0; x < Math.min(state.overlayWidth, newOverlayWidth); x++) {
        if (y < state.overlayHeight) {
          row[x] = state.overlay[y]![x]!
        }
      }
      newOverlay.push(row)
    }
    state.overlay = newOverlay
    state.overlayWidth = newOverlayWidth
    state.overlayHeight = newOverlayHeight

    clampPan(state)
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
