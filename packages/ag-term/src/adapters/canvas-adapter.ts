/**
 * Canvas Render Adapter
 *
 * Two modes:
 * - **monospace** (default): Layout in cell units (cols x rows), convert to pixels at draw time.
 * - **proportional** (monospace: false): Layout in pixel units, draw at pixel coordinates directly.
 *   Uses canvas measureText() for real font metrics. Enables proportional fonts (Inter, SF Pro, etc.)
 */

import type {
  BorderChars,
  RenderAdapter,
  RenderBuffer,
  RenderStyle,
  TextMeasureResult,
  TextMeasureStyle,
  TextMeasurer,
} from "../render-adapter"
import type { Measurer } from "../unicode"
import { wrapTextWithMeasurer, stripAnsi } from "../unicode"

// ============================================================================
// Configuration
// ============================================================================

export interface CanvasAdapterConfig {
  /** Font size in pixels (default: 14) */
  fontSize?: number
  /** Font family (default: 'monospace') */
  fontFamily?: string
  /** Line height multiplier (default: 1.2) */
  lineHeight?: number
  /** Background color (default: '#1e1e1e') */
  backgroundColor?: string
  /** Default foreground color (default: '#d4d4d4') */
  foregroundColor?: string
  /** Monospace mode (default: true). When false, uses proportional font measurement. */
  monospace?: boolean
  /** Device pixel ratio for sharp rendering on HiDPI displays (default: 1) */
  dpr?: number
}

const DEFAULT_CONFIG: Required<CanvasAdapterConfig> = {
  fontSize: 14,
  fontFamily: "monospace",
  lineHeight: 1.2,
  backgroundColor: "#1e1e1e",
  foregroundColor: "#d4d4d4",
  monospace: true,
  dpr: 1,
}

// ============================================================================
// Border Characters (same as terminal for consistency)
// ============================================================================

const BORDER_CHARS: Record<string, BorderChars> = {
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
  },
  round: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
  bold: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
  },
}

// ============================================================================
// Canvas Measurer
// ============================================================================

/** Create a scratch canvas 2D context for text measurement. */
function createMeasureContext(
  fontSize: number,
  fontFamily: string,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  // Prefer document.createElement("canvas") over OffscreenCanvas for measurement —
  // OffscreenCanvas may not have access to web fonts loaded via <link> or @font-face.
  // A regular canvas element shares the document's font loading state.
  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : null
  if (!canvas) throw new Error("Canvas not available for text measurement")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not get 2d context for measurement")
  ;(ctx as CanvasRenderingContext2D).font = `${fontSize}px ${fontFamily}`
  return ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
}

function createCanvasMeasurer(config: Required<CanvasAdapterConfig>): TextMeasurer {
  if (config.monospace) {
    return {
      measureText(text: string, _style?: TextMeasureStyle): TextMeasureResult {
        return { width: text.length, height: 1 }
      },
      getLineHeight(_style?: TextMeasureStyle): number {
        return 1
      },
    }
  }

  const lineHeightPx = Math.ceil(config.fontSize * config.lineHeight)
  const ctx = createMeasureContext(config.fontSize, config.fontFamily)

  return {
    measureText(text: string, _style?: TextMeasureStyle): TextMeasureResult {
      return { width: ctx.measureText(text).width, height: lineHeightPx }
    },
    getLineHeight(_style?: TextMeasureStyle): number {
      return lineHeightPx
    },
  }
}

// ============================================================================
// Proportional (Pixel) Measurer
// ============================================================================

/** Font config for pixel measurement — only what's needed. */
export interface CanvasPixelMeasurerConfig {
  fontSize: number
  fontFamily: string
  lineHeight: number
}

/**
 * Create a pipeline Measurer that uses canvas font metrics for pixel-accurate widths.
 * All measurements return pixel values. Wrapping reuses silvery's wrapTextWithMeasurer.
 */
export function createCanvasPixelMeasurer(config: CanvasPixelMeasurerConfig): Measurer {
  const ctx = createMeasureContext(config.fontSize, config.fontFamily)
  const lineHeightPx = Math.ceil(config.fontSize * config.lineHeight)

  // Simple cache with full eviction at capacity (5000 entries, mostly single graphemes)
  const cache = new Map<string, number>()

  function pixelWidth(text: string): number {
    if (text.length === 0) return 0
    const cached = cache.get(text)
    if (cached !== undefined) return cached
    if (cache.size >= 5000) cache.clear()
    const w = ctx.measureText(text).width
    cache.set(text, w)
    return w
  }

  // Use Intl.Segmenter for proper grapheme iteration (emoji, CJK, combining marks)
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

  function sliceGraphemes(text: string, maxWidth: number, fromEnd: boolean): string {
    const stripped = stripAnsi(text)
    if (pixelWidth(stripped) <= maxWidth) return text
    const graphemes = [...segmenter.segment(stripped)].map((s) => s.segment)
    let width = 0
    if (fromEnd) {
      for (let i = graphemes.length - 1; i >= 0; i--) {
        const gw = pixelWidth(graphemes[i]!)
        if (width + gw > maxWidth) return graphemes.slice(i + 1).join("")
        width += gw
      }
      return stripped
    }
    for (let i = 0; i < graphemes.length; i++) {
      const gw = pixelWidth(graphemes[i]!)
      if (width + gw > maxWidth) return graphemes.slice(0, i).join("")
      width += gw
    }
    return stripped
  }

  const measurer: Measurer = {
    textEmojiWide: false,
    textSizingEnabled: false,
    lineHeight: lineHeightPx,
    displayWidth(text: string): number {
      return pixelWidth(stripAnsi(text))
    },
    displayWidthAnsi(text: string): number {
      return pixelWidth(stripAnsi(text))
    },
    graphemeWidth(grapheme: string): number {
      return pixelWidth(grapheme)
    },
    wrapText(text: string, width: number, trim?: boolean, hard?: boolean): string[] {
      return wrapTextWithMeasurer(text, width, measurer, trim ?? false, hard ?? false)
    },
    sliceByWidth(text: string, maxWidth: number): string {
      return sliceGraphemes(text, maxWidth, false)
    },
    sliceByWidthFromEnd(text: string, maxWidth: number): string {
      return sliceGraphemes(text, maxWidth, true)
    },
  }

  return measurer
}

// ============================================================================
// Color Conversion
// ============================================================================

// ANSI 256-color palette (standard 16 colors)
const ANSI_COLORS: Record<string, string> = {
  black: "#000000",
  red: "#cd0000",
  green: "#00cd00",
  yellow: "#cdcd00",
  blue: "#0000ee",
  magenta: "#cd00cd",
  cyan: "#00cdcd",
  white: "#e5e5e5",
  gray: "#7f7f7f",
  grey: "#7f7f7f",
  brightBlack: "#7f7f7f",
  brightRed: "#ff0000",
  brightGreen: "#00ff00",
  brightYellow: "#ffff00",
  brightBlue: "#5c5cff",
  brightMagenta: "#ff00ff",
  brightCyan: "#00ffff",
  brightWhite: "#ffffff",
}

function resolveColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback

  // Already a CSS color (hex, rgb, etc.)
  if (color.startsWith("#") || color.startsWith("rgb")) {
    return color
  }

  // Named ANSI color
  const named = ANSI_COLORS[color.toLowerCase()]
  if (named) return named

  // Pass through (might be a CSS color name like 'cyan')
  return color
}

// ============================================================================
// Canvas Render Buffer
// ============================================================================

export class CanvasRenderBuffer implements RenderBuffer {
  readonly width: number
  readonly height: number
  readonly canvas: OffscreenCanvas | HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  private config: Required<CanvasAdapterConfig>

  // Cell-to-pixel conversion factors
  private readonly charWidth: number
  private readonly cellHeight: number

  constructor(width: number, height: number, config: Required<CanvasAdapterConfig>) {
    this.width = width
    this.height = height
    this.config = config

    const dpr = config.dpr

    let cssWidth: number
    let cssHeight: number

    if (config.monospace) {
      // Monospace: layout in cell units, convert to pixels at draw time
      this.charWidth = config.fontSize * 0.6
      this.cellHeight = config.fontSize * config.lineHeight
      cssWidth = width * this.charWidth
      cssHeight = height * this.cellHeight
    } else {
      // Proportional: layout already in pixels, no conversion needed
      this.charWidth = 1
      this.cellHeight = 1
      cssWidth = width
      cssHeight = height
    }

    // Create canvas at native resolution (CSS pixels * DPR) for sharp HiDPI rendering.
    // The context transform scales all drawing by DPR, so coordinates stay in CSS pixels.
    const nativeWidth = Math.ceil(cssWidth * dpr)
    const nativeHeight = Math.ceil(cssHeight * dpr)

    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(nativeWidth, nativeHeight)
    } else if (typeof document !== "undefined") {
      this.canvas = document.createElement("canvas")
      this.canvas.width = nativeWidth
      this.canvas.height = nativeHeight
    } else {
      throw new Error("Canvas not available")
    }

    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get 2d context")
    this.ctx = ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

    // Scale context so all drawing uses CSS pixel coordinates
    if (dpr !== 1) {
      ;(this.ctx as CanvasRenderingContext2D).setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // Initialize with background
    this.ctx.fillStyle = config.backgroundColor
    this.ctx.fillRect(0, 0, cssWidth, cssHeight)
  }

  fillRect(x: number, y: number, width: number, height: number, style: RenderStyle): void {
    if (style.bg) {
      // Convert cell coordinates to pixel coordinates
      const px = x * this.charWidth
      const py = y * this.cellHeight
      const pw = width * this.charWidth
      const ph = height * this.cellHeight
      this.ctx.fillStyle = resolveColor(style.bg, this.config.backgroundColor)
      this.ctx.fillRect(px, py, pw, ph)
    }
  }

  drawText(x: number, y: number, text: string, style: RenderStyle): void {
    // Convert cell coordinates to pixel coordinates
    const px = x * this.charWidth

    const attrs = style.attrs ?? {}

    // Build font string
    const weight = attrs.bold ? "bold" : "normal"
    const fontStyle = attrs.italic ? "italic" : "normal"
    this.ctx.font = `${fontStyle} ${weight} ${this.config.fontSize}px ${this.config.fontFamily}`

    const py = y * this.cellHeight

    // Set colors
    this.ctx.fillStyle = resolveColor(style.fg, this.config.foregroundColor)
    this.ctx.textBaseline = "top"

    // Draw text
    this.ctx.fillText(text, px, py)

    // Handle underline
    if (attrs.underline) {
      this.drawUnderline(px, py, text, style)
    }

    // Handle strikethrough
    if (attrs.strikethrough) {
      const metrics = this.ctx.measureText(text)
      const textWidth = metrics.width
      const strikeY = py + this.config.fontSize * 0.5

      this.ctx.strokeStyle = resolveColor(style.fg, this.config.foregroundColor)
      this.ctx.lineWidth = 1
      this.ctx.beginPath()
      this.ctx.moveTo(px, strikeY)
      this.ctx.lineTo(px + textWidth, strikeY)
      this.ctx.stroke()
    }
  }

  /**
   * Draw underline decorations at pixel coordinates.
   * Note: px, py are already in pixel coordinates.
   */
  private drawUnderline(px: number, py: number, text: string, style: RenderStyle): void {
    const attrs = style.attrs ?? {}
    const metrics = this.ctx.measureText(text)
    const textWidth = metrics.width
    const underlineY = py + this.config.fontSize * 0.9

    const underlineColor = resolveColor(attrs.underlineColor ?? style.fg, this.config.foregroundColor)

    this.ctx.strokeStyle = underlineColor
    this.ctx.lineWidth = 1

    const underlineStyle = attrs.underlineStyle ?? "single"

    switch (underlineStyle) {
      case "double":
        // Two parallel lines
        this.ctx.beginPath()
        this.ctx.moveTo(px, underlineY - 1)
        this.ctx.lineTo(px + textWidth, underlineY - 1)
        this.ctx.moveTo(px, underlineY + 1)
        this.ctx.lineTo(px + textWidth, underlineY + 1)
        this.ctx.stroke()
        break

      case "curly":
        // Wavy line using bezier curves
        this.ctx.beginPath()
        this.ctx.moveTo(px, underlineY)
        const waveLength = 4
        const amplitude = 2
        for (let wx = 0; wx < textWidth; wx += waveLength * 2) {
          this.ctx.quadraticCurveTo(px + wx + waveLength / 2, underlineY - amplitude, px + wx + waveLength, underlineY)
          this.ctx.quadraticCurveTo(
            px + wx + (waveLength * 3) / 2,
            underlineY + amplitude,
            px + wx + waveLength * 2,
            underlineY,
          )
        }
        this.ctx.stroke()
        break

      case "dotted":
        this.ctx.setLineDash([2, 2])
        this.ctx.beginPath()
        this.ctx.moveTo(px, underlineY)
        this.ctx.lineTo(px + textWidth, underlineY)
        this.ctx.stroke()
        this.ctx.setLineDash([])
        break

      case "dashed":
        this.ctx.setLineDash([4, 2])
        this.ctx.beginPath()
        this.ctx.moveTo(px, underlineY)
        this.ctx.lineTo(px + textWidth, underlineY)
        this.ctx.stroke()
        this.ctx.setLineDash([])
        break

      default: // 'single'
        this.ctx.beginPath()
        this.ctx.moveTo(px, underlineY)
        this.ctx.lineTo(px + textWidth, underlineY)
        this.ctx.stroke()
    }
  }

  drawChar(x: number, y: number, char: string, style: RenderStyle): void {
    // For canvas, drawChar is essentially drawText for single chars
    this.drawText(x, y, char, style)
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height
  }

  fillRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: string | undefined,
    stroke: string | undefined,
    lineWidth = 1,
  ): void {
    const px = x * this.charWidth
    const py = y * this.cellHeight
    const pw = width * this.charWidth
    const ph = height * this.cellHeight
    const r = Math.min(radius, pw / 2, ph / 2)

    this.ctx.beginPath()
    this.ctx.moveTo(px + r, py)
    this.ctx.lineTo(px + pw - r, py)
    this.ctx.quadraticCurveTo(px + pw, py, px + pw, py + r)
    this.ctx.lineTo(px + pw, py + ph - r)
    this.ctx.quadraticCurveTo(px + pw, py + ph, px + pw - r, py + ph)
    this.ctx.lineTo(px + r, py + ph)
    this.ctx.quadraticCurveTo(px, py + ph, px, py + ph - r)
    this.ctx.lineTo(px, py + r)
    this.ctx.quadraticCurveTo(px, py, px + r, py)
    this.ctx.closePath()

    if (fill) {
      this.ctx.fillStyle = fill
      this.ctx.fill()
    }
    if (stroke) {
      this.ctx.strokeStyle = stroke
      this.ctx.lineWidth = lineWidth
      this.ctx.stroke()
    }
  }
}

// ============================================================================
// Canvas Adapter Factory
// ============================================================================

export function createCanvasAdapter(config: CanvasAdapterConfig = {}): RenderAdapter {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const measurer = createCanvasMeasurer(cfg)

  return {
    name: "canvas",
    measurer,

    createBuffer(width: number, height: number): RenderBuffer {
      return new CanvasRenderBuffer(width, height, cfg)
    },

    flush(_buffer: RenderBuffer, _prevBuffer: RenderBuffer | null): void {
      // Canvas draws directly to the buffer during render.
      // The caller (renderToCanvas) copies the buffer to the visible canvas.
    },

    getBorderChars(style: string): BorderChars {
      return BORDER_CHARS[style] ?? BORDER_CHARS.single!
    },
  }
}
