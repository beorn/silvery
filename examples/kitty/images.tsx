/**
 * Image Gallery (Kitty Graphics Protocol)
 *
 * Browse and display images in the terminal using the Kitty graphics protocol.
 * Pass one or more image paths, or a directory to browse all images within it.
 * With a single image, displays it directly. With multiple, shows a navigable gallery.
 * Without arguments, generates a colorful test pattern.
 *
 * Features:
 * - Kitty graphics protocol (inline image display)
 * - Multi-image gallery with navigation (n/p or arrows)
 * - PNG file display with base64 chunked transfer
 * - Built-in RGBA test pattern (rainbow + checkerboard)
 * - Pan with arrow keys, zoom with +/-, fit with f
 *
 * Run: bun vendor/beorn-inkx/examples/kitty/image-gallery.tsx [image.png ...]
 *      bun vendor/beorn-inkx/examples/kitty/image-gallery.tsx ~/Pictures/
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { basename, resolve, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createTerm } from "../../src/index.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Image Viewer",
  description: "Browse and display images using Kitty graphics protocol",
  features: ["Kitty graphics", "PNG display", "gallery navigation", "zoom/pan", "true color"],
}

// ---------------------------------------------------------------------------
// Kitty graphics helpers
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 4096

/** Image file extensions we recognize */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif"])

/** Build Kitty graphics escape sequences for a PNG image. */
function kittyDisplayPng(pngData: Buffer, cols: number, rows: number): string {
  const b64 = pngData.toString("base64")
  const chunks: string[] = []

  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    const chunk = b64.slice(i, i + CHUNK_SIZE)
    const isLast = i + CHUNK_SIZE >= b64.length
    const more = isLast ? 0 : 1

    if (i === 0) {
      chunks.push(`\x1b_Ga=T,f=100,t=d,c=${cols},r=${rows},m=${more};${chunk}\x1b\\`)
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
): string {
  const b64 = rgbaData.toString("base64")
  const chunks: string[] = []

  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    const chunk = b64.slice(i, i + CHUNK_SIZE)
    const isLast = i + CHUNK_SIZE >= b64.length
    const more = isLast ? 0 : 1

    if (i === 0) {
      chunks.push(
        `\x1b_Ga=T,f=32,t=d,s=${srcWidth},v=${srcHeight},c=${cols},r=${rows},m=${more};${chunk}\x1b\\`,
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

/** HSV to RGB conversion (h: 0-360, s/v: 0-1) */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
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

/** Generate a colorful test pattern as RGBA pixel data. */
function generateTestPattern(width: number, height: number): Buffer {
  const buf = Buffer.alloc(width * height * 4)
  const checkerSize = 16

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4

      // Top half: rainbow gradient
      if (y < height / 2) {
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
        const isLight =
          (Math.floor(x / checkerSize) + Math.floor(cy / checkerSize)) % 2 === 0

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
// Image entry
// ---------------------------------------------------------------------------

interface ImageEntry {
  /** Display name */
  filename: string
  /** Full path (empty for test pattern) */
  path: string
  /** Source image width in pixels */
  imgWidth: number
  /** Source image height in pixels */
  imgHeight: number
  /** Whether the source is a PNG file (vs raw RGBA test pattern) */
  isPng: boolean
  /** The raw image data (PNG bytes or RGBA buffer) */
  data: Buffer
}

function loadImage(filePath: string): ImageEntry | null {
  if (!existsSync(filePath)) return null
  const data = Buffer.from(readFileSync(filePath))
  const { width, height } = readPngDimensions(data)
  return {
    filename: basename(filePath),
    path: filePath,
    imgWidth: width,
    imgHeight: height,
    isPng: true,
    data,
  }
}

function createTestPatternEntry(): ImageEntry {
  const patternW = 320
  const patternH = 240
  return {
    filename: "test pattern",
    path: "",
    imgWidth: patternW,
    imgHeight: patternH,
    isPng: false,
    data: generateTestPattern(patternW, patternH),
  }
}

/** Discover image files from CLI arguments (files and/or directories). */
function discoverImages(args: string[]): ImageEntry[] {
  const entries: ImageEntry[] = []
  const seen = new Set<string>()

  for (const arg of args) {
    if (!existsSync(arg)) continue

    const stat = statSync(arg)
    if (stat.isDirectory()) {
      // Scan directory for image files
      const files = readdirSync(arg)
        .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
        .sort()
      for (const file of files) {
        const fullPath = resolve(arg, file)
        if (seen.has(fullPath)) continue
        seen.add(fullPath)
        const entry = loadImage(fullPath)
        if (entry) entries.push(entry)
      }
    } else {
      const fullPath = resolve(arg)
      if (seen.has(fullPath)) continue
      seen.add(fullPath)
      const entry = loadImage(fullPath)
      if (entry) entries.push(entry)
    }
  }

  return entries
}

// ---------------------------------------------------------------------------
// Viewer state
// ---------------------------------------------------------------------------

interface ViewerState {
  /** All images in the gallery */
  images: ImageEntry[]
  /** Current image index */
  currentIndex: number
  /** Current zoom level (1.0 = fit to terminal) */
  zoom: number
  /** Pan offset in columns */
  panX: number
  /** Pan offset in rows */
  panY: number
  /** Terminal columns */
  termCols: number
  /** Terminal rows (minus status bar) */
  termRows: number
}

const ZOOM_STEP = 0.25
const PAN_STEP = 2

function currentImage(state: ViewerState): ImageEntry {
  return state.images[state.currentIndex]!
}

function displayCols(state: ViewerState): number {
  return Math.max(1, Math.round(state.termCols * state.zoom))
}

function displayRows(state: ViewerState): number {
  return Math.max(1, Math.round(state.termRows * state.zoom))
}

function clampPan(state: ViewerState): void {
  const dCols = displayCols(state)
  const dRows = displayRows(state)

  // Pan is how much the image extends beyond the viewport
  const maxPanX = Math.max(0, dCols - state.termCols)
  const maxPanY = Math.max(0, dRows - state.termRows)

  state.panX = Math.max(0, Math.min(state.panX, maxPanX))
  state.panY = Math.max(0, Math.min(state.panY, maxPanY))
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderStatusBar(state: ViewerState, term: ReturnType<typeof createTerm>): string {
  const img = currentImage(state)
  const zoomPct = Math.round(state.zoom * 100)
  const dCols = displayCols(state)
  const dRows = displayRows(state)

  const galleryInfo =
    state.images.length > 1
      ? `  ${term.dim("Image:")} ${term.bold(`${state.currentIndex + 1}/${state.images.length}`)}`
      : ""

  const navHelp =
    state.images.length > 1 ? "n/p navigate  " : ""

  return (
    term.dim.yellow("  inkx") +
    " " +
    term.bold("Image Gallery") +
    galleryInfo +
    "  " +
    term.dim("File:") +
    " " +
    term.bold(img.filename) +
    "  " +
    term.dim("Size:") +
    " " +
    `${img.imgWidth}x${img.imgHeight}` +
    "  " +
    term.dim("Display:") +
    " " +
    `${dCols}x${dRows}` +
    "  " +
    term.dim("Zoom:") +
    " " +
    term.bold(`${zoomPct}%`) +
    "  " +
    term.dim("Pan:") +
    " " +
    `${state.panX},${state.panY}` +
    "  " +
    term.dim(`${navHelp}arrows pan  +/- zoom  f fit  q quit`)
  )
}

function renderImage(state: ViewerState): string {
  const img = currentImage(state)
  const dCols = displayCols(state)
  const dRows = displayRows(state)

  const parts: string[] = []

  // Move cursor to image start position (row 1, accounting for pan)
  const startRow = 2 // row 1 is status bar (1-indexed)
  parts.push(`\x1b[${startRow};1H`)

  // Clear the image area
  for (let r = 0; r < state.termRows; r++) {
    parts.push(`\x1b[${startRow + r};1H\x1b[2K`)
  }
  parts.push(`\x1b[${startRow};1H`)

  // Delete previous images
  parts.push(kittyDeleteAll())

  // Display the image
  if (img.isPng) {
    parts.push(kittyDisplayPng(img.data, dCols, dRows))
  } else {
    parts.push(kittyDisplayRgba(img.data, img.imgWidth, img.imgHeight, dCols, dRows))
  }

  return parts.join("")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const crashCleanup = () => {
    const stdout = process.stdout
    stdout.write("\x1b[?1003l\x1b[?1006l") // Disable mouse
    stdout.write("\x1b[?25h")               // Show cursor
    stdout.write("\x1b[?1049l")             // Exit alternate screen
    stdout.write("\x1b[0m")                 // Reset colors
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try { process.stdin.setRawMode(false) } catch {}
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

  // Gather images from CLI arguments
  const args = process.argv.slice(2)
  let images: ImageEntry[]

  if (args.length === 0) {
    // No arguments: try samples/ directory first, fall back to test pattern
    const samplesDir = resolve(dirname(fileURLToPath(import.meta.url)), "samples")
    if (existsSync(samplesDir)) {
      images = discoverImages([samplesDir])
    }
    if (!images || images.length === 0) {
      images = [createTestPatternEntry()]
    }
  } else {
    images = discoverImages(args)
    if (images.length === 0) {
      // No valid images found — show test pattern with a note
      const entry = createTestPatternEntry()
      entry.filename = `${args.join(", ")} (not found, showing test pattern)`
      images = [entry]
    }
  }

  const state: ViewerState = {
    images,
    currentIndex: 0,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    termCols: cols,
    termRows: rows - 1, // reserve 1 row for status bar
  }

  // Enter alternate screen, hide cursor
  stdout.write("\x1b[?1049h")
  stdout.write("\x1b[?25l")
  stdout.write("\x1b[2J\x1b[H")

  // Enable raw mode
  if (stdin.isTTY) {
    stdin.setRawMode(true)
  }
  stdin.resume()

  const redraw = () => {
    // Status bar at row 1
    stdout.write("\x1b[1;1H\x1b[2K")
    stdout.write(renderStatusBar(state, term))
    // Image below
    stdout.write(renderImage(state))
  }

  /** Navigate to a different image, resetting zoom/pan */
  const goToImage = (index: number) => {
    if (index < 0 || index >= state.images.length) return
    state.currentIndex = index
    state.zoom = 1.0
    state.panX = 0
    state.panY = 0
    redraw()
  }

  redraw()

  const cleanup = () => {
    // Delete images
    stdout.write(kittyDeleteAll())
    // Show cursor, leave alternate screen
    stdout.write("\x1b[?25h")
    stdout.write("\x1b[?1049l")
    if (stdin.isTTY) {
      stdin.setRawMode(false)
    }
    stdin.off("data", onData)
    stdin.pause()
    process.exit(0)
  }

  const onData = (data: Buffer) => {
    const raw = data.toString()

    // Handle arrow keys (escape sequences) before single-character processing
    if (raw === "\x1b[A" || raw === "\x1bOA") {
      state.panY = Math.max(0, state.panY - PAN_STEP)
      redraw()
      return
    } else if (raw === "\x1b[B" || raw === "\x1bOB") {
      state.panY += PAN_STEP
      clampPan(state)
      redraw()
      return
    } else if (raw === "\x1b[D" || raw === "\x1bOD") {
      state.panX = Math.max(0, state.panX - PAN_STEP)
      redraw()
      return
    } else if (raw === "\x1b[C" || raw === "\x1bOC") {
      state.panX += PAN_STEP
      clampPan(state)
      redraw()
      return
    }

    // Single-character keyboard input
    for (const ch of raw) {
      switch (ch) {
        case "q":
        case "\x1b":
          cleanup()
          return

        // Gallery navigation
        case "n":
        case "l":
          goToImage((state.currentIndex + 1) % state.images.length)
          break
        case "p":
        case "h":
          goToImage((state.currentIndex - 1 + state.images.length) % state.images.length)
          break

        case "+":
        case "=":
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

        default:
          break
      }
    }
  }

  stdin.on("data", onData)

  // Handle terminal resize
  stdout.on("resize", () => {
    state.termCols = stdout.columns ?? cols
    state.termRows = (stdout.rows ?? rows) - 1
    clampPan(state)
    stdout.write("\x1b[2J\x1b[H")
    redraw()
  })
}

// ---------------------------------------------------------------------------
// PNG dimension reader
// ---------------------------------------------------------------------------

/** Read width and height from a PNG file's IHDR chunk. */
function readPngDimensions(data: Buffer): { width: number; height: number } {
  // PNG signature is 8 bytes, then first chunk is IHDR
  // IHDR starts at offset 8: 4 bytes length, 4 bytes "IHDR", then:
  //   4 bytes width (big-endian)
  //   4 bytes height (big-endian)
  if (data.length < 24) {
    return { width: 0, height: 0 }
  }

  // Verify PNG signature
  const sig = data.slice(0, 8)
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!sig.equals(pngSig)) {
    return { width: 0, height: 0 }
  }

  // IHDR chunk type at offset 12-15 should be "IHDR"
  const chunkType = data.slice(12, 16).toString("ascii")
  if (chunkType !== "IHDR") {
    return { width: 0, height: 0 }
  }

  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  return { width, height }
}

if (import.meta.main) {
  main().catch((err) => {
    // Restore terminal on crash
    const stdout = process.stdout
    stdout.write("\x1b[?1003l\x1b[?1006l") // Disable mouse
    stdout.write("\x1b[?25h")               // Show cursor
    stdout.write("\x1b[?1049l")             // Exit alternate screen
    stdout.write("\x1b[0m")                 // Reset colors
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try { process.stdin.setRawMode(false) } catch {}
    }
    console.error(err)
    process.exit(1)
  })
}
