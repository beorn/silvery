/**
 * Canvas Entry Point
 *
 * Provides a browser-friendly API for rendering silvery components to HTML5 Canvas.
 * This module sets up the canvas adapter and provides render functions.
 *
 * @example
 * ```tsx
 * import { renderToCanvas, Box, Text, useContentRect } from '@silvery/ui/canvas';
 *
 * function App() {
 *   const { width, height } = useContentRect();
 *   return (
 *     <Box flexDirection="column">
 *       <Text>Canvas size: {width}px × {height}px</Text>
 *     </Box>
 *   );
 * }
 *
 * const canvas = document.getElementById('canvas');
 * renderToCanvas(<App />, canvas);
 * ```
 */

import type { ReactElement } from "react"
import {
  type CanvasAdapterConfig,
  CanvasRenderBuffer,
  createCanvasAdapter,
} from "@silvery/term/adapters/canvas-adapter"
import { createBrowserRenderer, initBrowserRenderer, renderOnce } from "@silvery/term/browser-renderer"
import type { RenderBuffer } from "@silvery/term/render-adapter"

// Re-export components and hooks for convenience
export { Box, type BoxProps } from "@silvery/react/components/Box"
export { Text, type TextProps } from "@silvery/react/components/Text"
export { useContentRect, useScreenRect } from "@silvery/react/hooks/useLayout"
export { useApp } from "@silvery/react/hooks/useApp"

// Re-export adapter utilities
export {
  createCanvasAdapter,
  CanvasRenderBuffer,
  type CanvasAdapterConfig,
} from "@silvery/term/adapters/canvas-adapter"

// ============================================================================
// Types
// ============================================================================

export interface CanvasRenderOptions extends CanvasAdapterConfig {
  /** Width of the canvas (default: canvas.width) */
  width?: number
  /** Height of the canvas (default: canvas.height) */
  height?: number
}

export interface CanvasInstance {
  /** Re-render with a new element */
  rerender: (element: ReactElement) => void
  /** Unmount and clean up */
  unmount: () => void
  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void
  /** Get the current buffer */
  getBuffer: () => RenderBuffer | null
  /** Force a re-render */
  refresh: () => void
}

// ============================================================================
// Initialization
// ============================================================================

const canvasAdapterFactory = {
  createAdapter: (config: CanvasAdapterConfig) => createCanvasAdapter(config),
}

/**
 * Initialize the canvas rendering system.
 * Called automatically by renderToCanvas, but can be called manually.
 */
export function initCanvasRenderer(config: CanvasAdapterConfig = {}): void {
  initBrowserRenderer(canvasAdapterFactory, config)
}

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render a React element to an HTML5 Canvas.
 *
 * @param element - React element to render
 * @param canvas - Target canvas element
 * @param options - Render options (font size, colors, etc.)
 * @returns CanvasInstance for controlling the render
 *
 * @example
 * ```tsx
 * const canvas = document.getElementById('canvas');
 * const instance = renderToCanvas(<App />, canvas, { fontSize: 16 });
 *
 * // Later: update the component
 * instance.rerender(<App newProps />);
 *
 * // Clean up
 * instance.unmount();
 * ```
 */
export function renderToCanvas(
  element: ReactElement,
  canvas: HTMLCanvasElement,
  options: CanvasRenderOptions = {},
): CanvasInstance {
  initCanvasRenderer(options)

  const pixelWidth = options.width ?? canvas.width
  const pixelHeight = options.height ?? canvas.height

  // Ensure canvas dimensions match
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight

  // Convert pixel dimensions to cell dimensions for the layout engine.
  // The layout engine operates in cell units (columns x rows), not pixels.
  const fontSize = options.fontSize ?? 14
  const lineHeightMultiplier = options.lineHeight ?? 1.2
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * lineHeightMultiplier
  const cols = Math.floor(pixelWidth / charWidth)
  const rows = Math.floor(pixelHeight / lineHeight)

  return createBrowserRenderer<CanvasRenderBuffer>(element, cols, rows, (buffer) => {
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(buffer.canvas, 0, 0)
    }
  })
}

/**
 * Render a React element to a canvas and return the buffer.
 * One-shot render without ongoing updates.
 *
 * @param element - React element to render
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param options - Render options
 * @returns The rendered buffer
 */
export function renderCanvasOnce(
  element: ReactElement,
  width: number,
  height: number,
  options: CanvasAdapterConfig = {},
): CanvasRenderBuffer {
  initCanvasRenderer(options)

  // Convert pixel dimensions to cell dimensions for the layout engine
  const fontSize = options.fontSize ?? 14
  const lineHeightMultiplier = options.lineHeight ?? 1.2
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * lineHeightMultiplier
  const cols = Math.floor(width / charWidth)
  const rows = Math.floor(height / lineHeight)

  return renderOnce<CanvasRenderBuffer>(element, cols, rows)
}
