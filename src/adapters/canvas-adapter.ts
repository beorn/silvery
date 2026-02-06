/**
 * Canvas Render Adapter
 *
 * Implements the RenderAdapter interface for HTML5 Canvas output.
 * Uses pixels as units, Canvas 2D API for rendering.
 */

import type {
  BorderChars,
  RenderAdapter,
  RenderBuffer,
  RenderStyle,
  TextMeasureResult,
  TextMeasureStyle,
  TextMeasurer,
} from "../render-adapter.js"

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

function createCanvasMeasurer(
  config: Required<CanvasAdapterConfig>,
): TextMeasurer {
  // Use OffscreenCanvas for measurement if available
  let measureContext:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null

  function getContext():
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D {
    if (!measureContext) {
      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(1, 1)
        measureContext = canvas.getContext("2d")!
      } else if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas")
        measureContext = canvas.getContext("2d")!
      } else {
        throw new Error("Canvas not available in this environment")
      }
    }
    return measureContext
  }

  function getFontString(style?: TextMeasureStyle): string {
    const size = style?.fontSize ?? config.fontSize
    const family = style?.fontFamily ?? config.fontFamily
    const weight = style?.bold ? "bold" : "normal"
    const fontStyle = style?.italic ? "italic" : "normal"
    return `${fontStyle} ${weight} ${size}px ${family}`
  }

  return {
    measureText(text: string, style?: TextMeasureStyle): TextMeasureResult {
      const ctx = getContext()
      ctx.font = getFontString(style)
      const metrics = ctx.measureText(text)

      // Use actual bounding box if available, otherwise estimate
      const height =
        metrics.actualBoundingBoxAscent !== undefined &&
        metrics.actualBoundingBoxDescent !== undefined
          ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
          : (style?.fontSize ?? config.fontSize) * config.lineHeight

      return {
        width: metrics.width,
        height,
      }
    },

    getLineHeight(style?: TextMeasureStyle): number {
      const fontSize = style?.fontSize ?? config.fontSize
      return fontSize * config.lineHeight
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

  constructor(
    width: number,
    height: number,
    config: Required<CanvasAdapterConfig>,
  ) {
    this.width = width
    this.height = height
    this.config = config

    // Use OffscreenCanvas for double buffering
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(width, height)
    } else if (typeof document !== "undefined") {
      this.canvas = document.createElement("canvas")
      this.canvas.width = width
      this.canvas.height = height
    } else {
      throw new Error("Canvas not available")
    }

    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get 2d context")
    this.ctx = ctx as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D

    // Initialize with background
    this.ctx.fillStyle = config.backgroundColor
    this.ctx.fillRect(0, 0, width, height)
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    style: RenderStyle,
  ): void {
    if (style.bg) {
      this.ctx.fillStyle = resolveColor(style.bg, this.config.backgroundColor)
      this.ctx.fillRect(x, y, width, height)
    }
  }

  drawText(x: number, y: number, text: string, style: RenderStyle): void {
    const attrs = style.attrs ?? {}

    // Build font string
    const weight = attrs.bold ? "bold" : "normal"
    const fontStyle = attrs.italic ? "italic" : "normal"
    this.ctx.font = `${fontStyle} ${weight} ${this.config.fontSize}px ${this.config.fontFamily}`

    // Set colors
    this.ctx.fillStyle = resolveColor(style.fg, this.config.foregroundColor)
    this.ctx.textBaseline = "top"

    // Draw text
    this.ctx.fillText(text, x, y)

    // Handle underline
    if (attrs.underline) {
      this.drawUnderline(x, y, text, style)
    }

    // Handle strikethrough
    if (attrs.strikethrough) {
      const metrics = this.ctx.measureText(text)
      const textWidth = metrics.width
      const strikeY = y + this.config.fontSize * 0.5

      this.ctx.strokeStyle = resolveColor(style.fg, this.config.foregroundColor)
      this.ctx.lineWidth = 1
      this.ctx.beginPath()
      this.ctx.moveTo(x, strikeY)
      this.ctx.lineTo(x + textWidth, strikeY)
      this.ctx.stroke()
    }
  }

  private drawUnderline(
    x: number,
    y: number,
    text: string,
    style: RenderStyle,
  ): void {
    const attrs = style.attrs ?? {}
    const metrics = this.ctx.measureText(text)
    const textWidth = metrics.width
    const underlineY = y + this.config.fontSize * 0.9

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
        this.ctx.moveTo(x, underlineY - 1)
        this.ctx.lineTo(x + textWidth, underlineY - 1)
        this.ctx.moveTo(x, underlineY + 1)
        this.ctx.lineTo(x + textWidth, underlineY + 1)
        this.ctx.stroke()
        break

      case "curly":
        // Wavy line using bezier curves
        this.ctx.beginPath()
        this.ctx.moveTo(x, underlineY)
        const waveLength = 4
        const amplitude = 2
        for (let wx = 0; wx < textWidth; wx += waveLength * 2) {
          this.ctx.quadraticCurveTo(
            x + wx + waveLength / 2,
            underlineY - amplitude,
            x + wx + waveLength,
            underlineY,
          )
          this.ctx.quadraticCurveTo(
            x + wx + (waveLength * 3) / 2,
            underlineY + amplitude,
            x + wx + waveLength * 2,
            underlineY,
          )
        }
        this.ctx.stroke()
        break

      case "dotted":
        this.ctx.setLineDash([2, 2])
        this.ctx.beginPath()
        this.ctx.moveTo(x, underlineY)
        this.ctx.lineTo(x + textWidth, underlineY)
        this.ctx.stroke()
        this.ctx.setLineDash([])
        break

      case "dashed":
        this.ctx.setLineDash([4, 2])
        this.ctx.beginPath()
        this.ctx.moveTo(x, underlineY)
        this.ctx.lineTo(x + textWidth, underlineY)
        this.ctx.stroke()
        this.ctx.setLineDash([])
        break

      default: // 'single'
        this.ctx.beginPath()
        this.ctx.moveTo(x, underlineY)
        this.ctx.lineTo(x + textWidth, underlineY)
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

export function createCanvasAdapter(
  config: CanvasAdapterConfig = {},
): RenderAdapter {
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
