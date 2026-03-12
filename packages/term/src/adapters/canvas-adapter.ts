/**
 * Canvas Render Adapter
 *
 * Implements the RenderAdapter interface for HTML5 Canvas output.
 * The layout engine operates in cell units (columns x rows). This adapter
 * converts cell coordinates to pixel coordinates when drawing to the canvas,
 * using charWidth (fontSize * 0.6) and cellHeight (fontSize * lineHeight).
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
}

const DEFAULT_CONFIG: Required<CanvasAdapterConfig> = {
  fontSize: 14,
  fontFamily: "monospace",
  lineHeight: 1.2,
  backgroundColor: "#1e1e1e",
  foregroundColor: "#d4d4d4",
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

function createCanvasMeasurer(_config: Required<CanvasAdapterConfig>): TextMeasurer {
  // The layout engine operates in cell units (columns x rows), matching the
  // terminal convention. For monospace fonts, text width = character count
  // and line height = 1 row.
  return {
    measureText(text: string, _style?: TextMeasureStyle): TextMeasureResult {
      // For monospace fonts, width is simply the character count (one cell per char)
      return {
        width: text.length,
        height: 1,
      }
    },

    getLineHeight(_style?: TextMeasureStyle): number {
      return 1
    },
  }
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

    // Compute cell dimensions for coordinate conversion.
    // Width/height are in cell units (cols/rows); drawing converts to pixels.
    this.charWidth = config.fontSize * 0.6
    this.cellHeight = config.fontSize * config.lineHeight

    // Canvas pixel dimensions (convert cell units to pixels)
    const pixelWidth = width * this.charWidth
    const pixelHeight = height * this.cellHeight

    // Use OffscreenCanvas for double buffering
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(pixelWidth, pixelHeight)
    } else if (typeof document !== "undefined") {
      this.canvas = document.createElement("canvas")
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
    } else {
      throw new Error("Canvas not available")
    }

    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get 2d context")
    this.ctx = ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

    // Initialize with background
    this.ctx.fillStyle = config.backgroundColor
    this.ctx.fillRect(0, 0, pixelWidth, pixelHeight)
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
    const py = y * this.cellHeight

    const attrs = style.attrs ?? {}

    // Build font string
    const weight = attrs.bold ? "bold" : "normal"
    const fontStyle = attrs.italic ? "italic" : "normal"
    this.ctx.font = `${fontStyle} ${weight} ${this.config.fontSize}px ${this.config.fontFamily}`

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

    const underlineColor = resolveColor(
      attrs.underlineColor ?? style.fg,
      this.config.foregroundColor,
    )

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
          this.ctx.quadraticCurveTo(
            px + wx + waveLength / 2,
            underlineY - amplitude,
            px + wx + waveLength,
            underlineY,
          )
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
