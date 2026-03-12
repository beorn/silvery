/**
 * DOM Entry Point
 *
 * Provides a browser-friendly API for rendering silvery components to DOM elements.
 * This module sets up the DOM adapter and provides render functions.
 *
 * Advantages over Canvas:
 * - Native text selection and copying
 * - Screen reader accessibility
 * - Browser font rendering
 * - CSS integration
 *
 * @example
 * ```tsx
 * import { renderToDOM, Box, Text, useContentRect } from '@silvery/term/dom';
 *
 * function App() {
 *   const { width, height } = useContentRect();
 *   return (
 *     <Box flexDirection="column">
 *       <Text>Container size: {width}px × {height}px</Text>
 *     </Box>
 *   );
 * }
 *
 * const container = document.getElementById('app');
 * renderToDOM(<App />, container);
 * ```
 */

import type { ReactElement } from "react"
import {
  type DOMAdapterConfig,
  DOMRenderBuffer,
  createDOMAdapter,
  injectDOMStyles,
} from "../adapters/dom-adapter"
import { createBrowserRenderer, initBrowserRenderer, renderOnce } from "../browser-renderer"
import type { RenderBuffer } from "../render-adapter"

// Re-export components and hooks for convenience
export { Box, type BoxProps } from "@silvery/react/components/Box"
export { Text, type TextProps } from "@silvery/react/components/Text"
export { useContentRect, useScreenRect } from "@silvery/react/hooks/useLayout"
export { useApp } from "@silvery/react/hooks/useApp"

// Re-export adapter utilities
export {
  createDOMAdapter,
  DOMRenderBuffer,
  injectDOMStyles,
  type DOMAdapterConfig,
} from "../adapters/dom-adapter"

// ============================================================================
// Types
// ============================================================================

export interface DOMRenderOptions extends DOMAdapterConfig {
  /** Width of the container (default: container.clientWidth or 800) */
  width?: number
  /** Height of the container (default: container.clientHeight or 600) */
  height?: number
  /** Inject global CSS styles (default: true) */
  injectStyles?: boolean
}

export interface DOMInstance {
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
  /** Get the container element */
  getContainer: () => HTMLElement
}

// ============================================================================
// Initialization
// ============================================================================

const domAdapterFactory = { createAdapter: (config: DOMAdapterConfig) => createDOMAdapter(config) }

/**
 * Initialize the DOM rendering system.
 * Called automatically by renderToDOM, but can be called manually.
 */
export function initDOMRenderer(config: DOMAdapterConfig = {}): void {
  initBrowserRenderer(domAdapterFactory, config)
}

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render a React element to a DOM container.
 *
 * @param element - React element to render
 * @param container - Target DOM element
 * @param options - Render options (font size, colors, etc.)
 * @returns DOMInstance for controlling the render
 *
 * @example
 * ```tsx
 * const container = document.getElementById('app');
 * const instance = renderToDOM(<App />, container, { fontSize: 16 });
 *
 * // Later: update the component
 * instance.rerender(<App newProps />);
 *
 * // Clean up
 * instance.unmount();
 * ```
 */
export function renderToDOM(
  element: ReactElement,
  container: HTMLElement,
  options: DOMRenderOptions = {},
): DOMInstance {
  const { injectStyles = true, ...adapterConfig } = options

  if (injectStyles) {
    injectDOMStyles(adapterConfig.classPrefix)
  }

  initDOMRenderer(adapterConfig)

  const pixelWidth = options.width ?? (container.clientWidth || 800)
  const pixelHeight = options.height ?? (container.clientHeight || 600)

  // Convert pixel dimensions to cell dimensions for the layout engine.
  // The layout engine operates in cell units (columns x rows), not pixels.
  // We estimate cell size from font metrics: charWidth ~ fontSize * 0.6, lineHeight ~ fontSize * lineHeight.
  const fontSize = adapterConfig.fontSize ?? 14
  const lineHeightMultiplier = adapterConfig.lineHeight ?? 1.2
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * lineHeightMultiplier
  const cols = Math.floor(pixelWidth / charWidth)
  const rows = Math.floor(pixelHeight / lineHeight)

  const base = createBrowserRenderer<DOMRenderBuffer>(
    element,
    cols,
    rows,
    (buffer) => {
      buffer.setContainer(container)
      buffer.render()
    },
    () => {
      container.innerHTML = ""
    },
  )

  return {
    ...base,
    getContainer(): HTMLElement {
      return container
    },
  }
}

/**
 * Render a React element to DOM once and return the HTML string.
 * Useful for server-side rendering or static generation.
 *
 * @param element - React element to render
 * @param width - Container width in pixels
 * @param height - Container height in pixels
 * @param options - Render options
 * @returns HTML string representation
 */
export function renderDOMOnce(
  element: ReactElement,
  width: number,
  height: number,
  options: DOMAdapterConfig = {},
): string {
  initDOMRenderer(options)

  // Convert pixel dimensions to cell dimensions for the layout engine
  const fontSize = options.fontSize ?? 14
  const lineHeightMultiplier = options.lineHeight ?? 1.2
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * lineHeightMultiplier
  const cols = Math.floor(width / charWidth)
  const rows = Math.floor(height / lineHeight)

  const buffer = renderOnce<DOMRenderBuffer>(element, cols, rows)

  if (typeof document !== "undefined") {
    const tempContainer = document.createElement("div")
    buffer.setContainer(tempContainer)
    buffer.render()
    return tempContainer.innerHTML
  }

  return "<!-- DOM rendering requires browser environment -->"
}
