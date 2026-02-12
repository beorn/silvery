/**
 * DOM Render Adapter
 *
 * Implements the RenderAdapter interface for browser DOM output.
 * Uses a line-based approach: one <div> per row, <span> elements for styled text runs.
 *
 * Advantages over Canvas:
 * - Native text selection and copying
 * - Screen reader accessibility
 * - Browser font rendering (subpixel antialiasing, ligatures)
 * - CSS integration (theming, hover states)
 * - DevTools inspection
 *
 * Architecture follows xterm.js DOM renderer approach.
 * @see https://github.com/xtermjs/xterm.js/issues/3271
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

export interface DOMAdapterConfig {
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
  /** CSS class prefix (default: 'inkx') */
  classPrefix?: string
}

const DEFAULT_CONFIG: Required<DOMAdapterConfig> = {
  fontSize: 14,
  fontFamily: "monospace",
  lineHeight: 1.2,
  backgroundColor: "#1e1e1e",
  foregroundColor: "#d4d4d4",
  classPrefix: "inkx",
}

// ============================================================================
// Border Characters (same as terminal/canvas for consistency)
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
// Color Conversion
// ============================================================================

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
  brightblack: "#7f7f7f",
  brightred: "#ff0000",
  brightgreen: "#00ff00",
  brightyellow: "#ffff00",
  brightblue: "#5c5cff",
  brightmagenta: "#ff00ff",
  brightcyan: "#00ffff",
  brightwhite: "#ffffff",
}

function resolveColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback
  if (color.startsWith("#") || color.startsWith("rgb")) return color
  const named = ANSI_COLORS[color.toLowerCase()]
  return named ?? color
}

// ============================================================================
// DOM Measurer
// ============================================================================

function createDOMMeasurer(config: Required<DOMAdapterConfig>): TextMeasurer {
  // Use a hidden span for measurement
  let measureElement: HTMLSpanElement | null = null

  function getMeasureElement(): HTMLSpanElement {
    if (!measureElement && typeof document !== "undefined") {
      measureElement = document.createElement("span")
      measureElement.style.cssText = `
				position: absolute;
				visibility: hidden;
				white-space: pre;
				font-family: ${config.fontFamily};
				font-size: ${config.fontSize}px;
			`
      document.body.appendChild(measureElement)
    }
    return measureElement!
  }

  return {
    measureText(text: string, style?: TextMeasureStyle): TextMeasureResult {
      if (typeof document === "undefined") {
        // Fallback for non-browser: estimate based on character count
        const charWidth = config.fontSize * 0.6
        return {
          width: text.length * charWidth,
          height: config.fontSize * config.lineHeight,
        }
      }

      const el = getMeasureElement()
      const weight = style?.bold ? "bold" : "normal"
      const fontStyle = style?.italic ? "italic" : "normal"
      el.style.fontWeight = weight
      el.style.fontStyle = fontStyle
      el.textContent = text

      return {
        width: el.offsetWidth,
        height: el.offsetHeight || config.fontSize * config.lineHeight,
      }
    },

    getLineHeight(style?: TextMeasureStyle): number {
      const fontSize = style?.fontSize ?? config.fontSize
      return fontSize * config.lineHeight
    },
  }
}

// ============================================================================
// Styled Text Run
// ============================================================================

interface TextRun {
  text: string
  style: RenderStyle
  x: number
}

// ============================================================================
// DOM Render Buffer
// ============================================================================

export class DOMRenderBuffer implements RenderBuffer {
  readonly width: number
  readonly height: number

  private config: Required<DOMAdapterConfig>
  private lines: Map<number, TextRun[]>
  private backgrounds: Map<string, { x: number; y: number; w: number; h: number; color: string }>

  // Container element (set when flushing)
  private container: HTMLElement | null = null

  constructor(width: number, height: number, config: Required<DOMAdapterConfig>) {
    this.width = width
    this.height = height
    this.config = config
    this.lines = new Map()
    this.backgrounds = new Map()
  }

  /**
   * Set the container element for rendering.
   */
  setContainer(container: HTMLElement): void {
    this.container = container
  }

  /**
   * Get the container element.
   */
  getContainer(): HTMLElement | null {
    return this.container
  }

  fillRect(x: number, y: number, width: number, height: number, style: RenderStyle): void {
    if (style.bg) {
      const key = `${x},${y},${width},${height}`
      this.backgrounds.set(key, {
        x,
        y,
        w: width,
        h: height,
        color: resolveColor(style.bg, this.config.backgroundColor),
      })
    }
  }

  drawText(x: number, y: number, text: string, style: RenderStyle): void {
    if (!this.lines.has(y)) {
      this.lines.set(y, [])
    }
    this.lines.get(y)!.push({ text, style, x })
  }

  drawChar(x: number, y: number, char: string, style: RenderStyle): void {
    this.drawText(x, y, char, style)
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height
  }

  /**
   * Render the buffer to the container element.
   */
  render(): void {
    if (!this.container) {
      throw new Error("DOMRenderBuffer: No container set. Call setContainer() first.")
    }

    const container = this.container
    const lineHeight = this.config.fontSize * this.config.lineHeight

    // Clear previous content
    container.innerHTML = ""

    // Set container styles
    container.style.cssText = `
			position: relative;
			font-family: ${this.config.fontFamily};
			font-size: ${this.config.fontSize}px;
			line-height: ${this.config.lineHeight};
			background-color: ${this.config.backgroundColor};
			color: ${this.config.foregroundColor};
			white-space: pre;
			overflow: hidden;
			width: ${this.width}px;
			height: ${this.height}px;
		`

    // Render background rectangles
    for (const bg of this.backgrounds.values()) {
      const bgDiv = document.createElement("div")
      bgDiv.className = `${this.config.classPrefix}-bg`
      bgDiv.style.cssText = `
				position: absolute;
				left: ${bg.x}px;
				top: ${bg.y}px;
				width: ${bg.w}px;
				height: ${bg.h}px;
				background-color: ${bg.color};
			`
      container.appendChild(bgDiv)
    }

    // Render text lines
    const sortedLines = Array.from(this.lines.entries()).sort((a, b) => a[0] - b[0])

    for (const [y, runs] of sortedLines) {
      const lineDiv = document.createElement("div")
      lineDiv.className = `${this.config.classPrefix}-line`
      lineDiv.style.cssText = `
				position: absolute;
				left: 0;
				top: ${y}px;
				height: ${lineHeight}px;
				white-space: pre;
			`

      // Sort runs by x position
      const sortedRuns = runs.sort((a, b) => a.x - b.x)

      for (const run of sortedRuns) {
        const span = document.createElement("span")
        span.className = `${this.config.classPrefix}-text`
        span.textContent = run.text

        // Apply styles
        const styles: string[] = [`position: absolute`, `left: ${run.x}px`]

        if (run.style.fg) {
          styles.push(`color: ${resolveColor(run.style.fg, this.config.foregroundColor)}`)
        }
        if (run.style.bg) {
          styles.push(`background-color: ${resolveColor(run.style.bg, this.config.backgroundColor)}`)
        }

        const attrs = run.style.attrs
        if (attrs) {
          if (attrs.bold) styles.push("font-weight: bold")
          if (attrs.dim) styles.push("opacity: 0.5")
          if (attrs.italic) styles.push("font-style: italic")

          // Underline handling
          if (attrs.underline || attrs.underlineStyle) {
            const underlineStyle = attrs.underlineStyle ?? "single"
            const underlineColor = attrs.underlineColor
              ? resolveColor(attrs.underlineColor, this.config.foregroundColor)
              : "currentColor"

            switch (underlineStyle) {
              case "double":
                styles.push(`text-decoration: underline double ${underlineColor}`)
                break
              case "curly":
                styles.push(`text-decoration: underline wavy ${underlineColor}`)
                break
              case "dotted":
                styles.push(`text-decoration: underline dotted ${underlineColor}`)
                break
              case "dashed":
                styles.push(`text-decoration: underline dashed ${underlineColor}`)
                break
              default:
                styles.push(`text-decoration: underline solid ${underlineColor}`)
            }
          }

          if (attrs.strikethrough) {
            const existing = styles.find((s) => s.startsWith("text-decoration:"))
            if (existing) {
              const idx = styles.indexOf(existing)
              styles[idx] = existing.replace("underline", "underline line-through")
            } else {
              styles.push("text-decoration: line-through")
            }
          }

          if (attrs.inverse) {
            // Swap foreground/background
            const fg = run.style.fg
              ? resolveColor(run.style.fg, this.config.foregroundColor)
              : this.config.foregroundColor
            const bg = run.style.bg
              ? resolveColor(run.style.bg, this.config.backgroundColor)
              : this.config.backgroundColor
            styles.push(`color: ${bg}`, `background-color: ${fg}`)
          }
        }

        span.style.cssText = styles.join("; ")
        lineDiv.appendChild(span)
      }

      container.appendChild(lineDiv)
    }
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.lines.clear()
    this.backgrounds.clear()
  }
}

// ============================================================================
// DOM Adapter Factory
// ============================================================================

export function createDOMAdapter(config: DOMAdapterConfig = {}): RenderAdapter {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const measurer = createDOMMeasurer(cfg)

  return {
    name: "dom",
    measurer,

    createBuffer(width: number, height: number): RenderBuffer {
      return new DOMRenderBuffer(width, height, cfg)
    },

    flush(buffer: RenderBuffer, _prevBuffer: RenderBuffer | null): void {
      // DOM buffer renders directly when render() is called
      const domBuffer = buffer as DOMRenderBuffer
      if (domBuffer.getContainer()) {
        domBuffer.render()
      }
    },

    getBorderChars(style: string): BorderChars {
      return BORDER_CHARS[style] ?? BORDER_CHARS.single!
    },
  }
}

// ============================================================================
// Inject Global Styles (Optional)
// ============================================================================

let stylesInjected = false

/**
 * Inject global CSS styles for inkx DOM rendering.
 * Call once at application startup if you want default styling.
 */
export function injectDOMStyles(classPrefix = "inkx"): void {
  if (stylesInjected || typeof document === "undefined") return

  const style = document.createElement("style")
  style.textContent = `
		.${classPrefix}-container {
			font-family: monospace;
			white-space: pre;
			overflow: hidden;
		}
		.${classPrefix}-line {
			white-space: pre;
		}
		.${classPrefix}-text {
			white-space: pre;
		}
		/* Selection styling */
		.${classPrefix}-text::selection {
			background-color: rgba(100, 150, 255, 0.3);
		}
	`
  document.head.appendChild(style)
  stylesInjected = true
}
