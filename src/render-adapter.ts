/**
 * Render Adapter Abstraction
 *
 * This module defines the interfaces that allow inkx to render to different
 * targets (terminal, canvas, etc.) while keeping the core layout and
 * reconciliation logic portable.
 */

// ============================================================================
// Text Measurement
// ============================================================================

export interface TextMeasureStyle {
  bold?: boolean
  italic?: boolean
  fontSize?: number
  fontFamily?: string
}

export interface TextMeasureResult {
  width: number
  height: number
}

export interface TextMeasurer {
  /**
   * Measure text dimensions.
   * Returns width in adapter units (cells for terminal, pixels for canvas).
   */
  measureText(text: string, style?: TextMeasureStyle): TextMeasureResult

  /**
   * Get the line height for the given style.
   */
  getLineHeight(style?: TextMeasureStyle): number
}

// ============================================================================
// Render Buffer
// ============================================================================

export interface RenderStyle {
  fg?: string
  bg?: string
  attrs?: {
    bold?: boolean
    dim?: boolean
    italic?: boolean
    underline?: boolean
    underlineStyle?: "single" | "double" | "curly" | "dotted" | "dashed"
    underlineColor?: string
    strikethrough?: boolean
    inverse?: boolean
  }
}

export interface RenderBuffer {
  readonly width: number
  readonly height: number

  /**
   * Fill a rectangle with a style.
   */
  fillRect(x: number, y: number, width: number, height: number, style: RenderStyle): void

  /**
   * Draw text at a position.
   */
  drawText(x: number, y: number, text: string, style: RenderStyle): void

  /**
   * Draw a single character at a position.
   */
  drawChar(x: number, y: number, char: string, style: RenderStyle): void

  /**
   * Check if coordinates are within bounds.
   */
  inBounds(x: number, y: number): boolean
}

// ============================================================================
// Border Characters
// ============================================================================

export interface BorderChars {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
  horizontal: string
  vertical: string
}

// ============================================================================
// Render Adapter
// ============================================================================

export interface RenderAdapter {
  /** Adapter name for debugging */
  name: string

  /** Text measurement for this adapter */
  measurer: TextMeasurer

  /**
   * Create a buffer for rendering.
   */
  createBuffer(width: number, height: number): RenderBuffer

  /**
   * Flush the buffer to the output (terminal, canvas, etc.).
   * For terminal: returns ANSI diff string.
   * For canvas: draws directly, returns void.
   */
  flush(buffer: RenderBuffer, prevBuffer: RenderBuffer | null): string | void

  /**
   * Get border characters for the given style.
   */
  getBorderChars(style: string): BorderChars
}

// ============================================================================
// Global Adapter Management
// ============================================================================

let currentAdapter: RenderAdapter | null = null

/**
 * Set the current render adapter.
 */
export function setRenderAdapter(adapter: RenderAdapter): void {
  currentAdapter = adapter
}

/**
 * Get the current render adapter.
 * Throws if no adapter is set.
 */
export function getRenderAdapter(): RenderAdapter {
  if (!currentAdapter) {
    throw new Error("No render adapter set. Call setRenderAdapter() first.")
  }
  return currentAdapter
}

/**
 * Check if a render adapter has been set.
 */
export function hasRenderAdapter(): boolean {
  return currentAdapter !== null
}

/**
 * Get the text measurer from the current adapter.
 */
export function getTextMeasurer(): TextMeasurer {
  return getRenderAdapter().measurer
}

/**
 * Ensure a render adapter is initialized.
 * If no adapter is set, lazily imports and sets the terminal adapter.
 */
export async function ensureRenderAdapterInitialized(): Promise<void> {
  if (hasRenderAdapter()) return

  // Lazy import to avoid circular dependencies
  const { terminalAdapter } = await import("./adapters/terminal-adapter.js")
  setRenderAdapter(terminalAdapter)
}
