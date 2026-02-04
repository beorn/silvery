/**
 * Canvas Entry Point
 *
 * Provides a browser-friendly API for rendering inkx components to HTML5 Canvas.
 * This module sets up the canvas adapter and provides render functions.
 *
 * @example
 * ```tsx
 * import { renderToCanvas, Box, Text, useContentRect } from 'inkx/canvas';
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
} from "../adapters/canvas-adapter.js"
import { createFlexxZeroEngine } from "../adapters/flexx-zero-adapter.js"
import { setLayoutEngine } from "../layout-engine.js"
import { executeRenderAdapter } from "../pipeline/index.js"
import { createContainer, getContainerRoot, reconciler } from "../reconciler.js"
import { setRenderAdapter } from "../render-adapter.js"
import type { RenderBuffer } from "../render-adapter.js"

// Re-export components and hooks for convenience
export { Box, type BoxProps } from "../components/Box.js"
export { Text, type TextProps } from "../components/Text.js"
export { useContentRect, useScreenRect } from "../hooks/useLayout.js"
export { useApp } from "../hooks/useApp.js"

// Re-export adapter utilities
export {
  createCanvasAdapter,
  CanvasRenderBuffer,
  type CanvasAdapterConfig,
} from "../adapters/canvas-adapter.js"

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
  /** Get the current buffer */
  getBuffer: () => RenderBuffer | null
  /** Force a re-render */
  refresh: () => void
}

// ============================================================================
// Initialization
// ============================================================================

let initialized = false

/**
 * Initialize the canvas rendering system.
 * Called automatically by renderToCanvas, but can be called manually.
 */
export function initCanvasRenderer(config: CanvasAdapterConfig = {}): void {
  if (initialized) return

  // Set up layout engine (Flexx is sync, no WASM needed)
  setLayoutEngine(createFlexxZeroEngine())

  // Set up canvas adapter
  setRenderAdapter(createCanvasAdapter(config))

  initialized = true
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
  // Initialize if needed
  initCanvasRenderer(options)

  const width = options.width ?? canvas.width
  const height = options.height ?? canvas.height

  // Ensure canvas dimensions match
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  // Create reconciler container
  const container = createContainer(() => {
    // Schedule re-render on state changes
    scheduleRender()
  })

  const root = getContainerRoot(container)

  // Create fiber root
  const fiberRoot = reconciler.createContainer(
    container,
    0, // LegacyRoot
    null,
    false,
    null,
    "",
    () => {},
    () => {},
    () => {},
    null,
  )

  let currentBuffer: RenderBuffer | null = null
  let currentElement: ReactElement = element
  let renderScheduled = false

  function scheduleRender(): void {
    if (renderScheduled) return
    renderScheduled = true

    // Use requestAnimationFrame for smooth rendering
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => {
        renderScheduled = false
        doRender()
      })
    } else {
      // Fallback for non-browser environments
      setTimeout(() => {
        renderScheduled = false
        doRender()
      }, 0)
    }
  }

  function doRender(): void {
    // Update React tree
    reconciler.updateContainerSync(currentElement, fiberRoot, null, null)
    reconciler.flushSyncWork()

    // Execute render pipeline
    const prevBuffer = currentBuffer
    const result = executeRenderAdapter(root, width, height, prevBuffer)
    currentBuffer = result.buffer

    // Draw to canvas
    if (currentBuffer instanceof CanvasRenderBuffer) {
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(currentBuffer.canvas, 0, 0)
      }
    }
  }

  // Initial render
  doRender()

  return {
    rerender(newElement: ReactElement): void {
      currentElement = newElement
      scheduleRender()
    },

    unmount(): void {
      reconciler.updateContainer(null, fiberRoot, null, () => {})
    },

    getBuffer(): RenderBuffer | null {
      return currentBuffer
    },

    refresh(): void {
      scheduleRender()
    },
  }
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
  // Initialize if needed
  initCanvasRenderer(options)

  // Create reconciler container
  const container = createContainer(() => {})
  const root = getContainerRoot(container)

  // Create fiber root and render
  const fiberRoot = reconciler.createContainer(
    container,
    0,
    null,
    false,
    null,
    "",
    () => {},
    () => {},
    () => {},
    null,
  )

  reconciler.updateContainerSync(element, fiberRoot, null, null)
  reconciler.flushSyncWork()

  // Execute render pipeline
  const { buffer } = executeRenderAdapter(root, width, height, null)

  // Clean up
  reconciler.updateContainer(null, fiberRoot, null, () => {})

  return buffer as CanvasRenderBuffer
}
