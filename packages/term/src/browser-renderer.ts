/**
 * Shared Browser Renderer
 *
 * Common lifecycle logic for browser-based renderers (Canvas, DOM).
 * Both canvas/index.ts and dom/index.ts were ~70-80% identical — this module
 * extracts the shared reconciler setup, scheduling, and render loop.
 */

import type { ReactElement } from "react"
import { createFlextureZeroEngine } from "./adapters/flexture-zero-adapter"
import { setLayoutEngine } from "./layout-engine"
import { executeRenderAdapter } from "./pipeline"
import { createContainer, createFiberRoot, getContainerRoot, reconciler } from "@silvery/react/reconciler"
import type { RenderAdapter, RenderBuffer } from "./render-adapter"
import { setRenderAdapter } from "./render-adapter"

// ============================================================================
// Types
// ============================================================================

/** Config for creating a browser adapter */
export interface BrowserAdapterFactory<TConfig> {
  createAdapter(config: TConfig): RenderAdapter
}

/** Callback invoked after each render with the new buffer */
export type OnRender<TBuffer extends RenderBuffer> = (buffer: TBuffer) => void

/** Base instance returned by createBrowserRenderer */
export interface BrowserInstance {
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

let initialized = false

/**
 * Initialize the browser rendering system with a specific adapter.
 * Called automatically by render functions, but can be called manually.
 * Idempotent — only the first call takes effect.
 */
export function initBrowserRenderer<TConfig>(factory: BrowserAdapterFactory<TConfig>, config: TConfig): void {
  if (initialized) return

  setLayoutEngine(createFlextureZeroEngine())
  setRenderAdapter(factory.createAdapter(config))

  initialized = true
}

// ============================================================================
// Render Loop
// ============================================================================

/**
 * Create a browser renderer instance with reconciler lifecycle and scheduling.
 *
 * @param element - React element to render
 * @param width - Render width
 * @param height - Render height
 * @param onRender - Called after each render with the new buffer
 * @param onUnmount - Optional cleanup callback after reconciler unmount
 */
export function createBrowserRenderer<TBuffer extends RenderBuffer>(
  element: ReactElement,
  width: number,
  height: number,
  onRender: OnRender<TBuffer>,
  onUnmount?: () => void,
): BrowserInstance {
  const container = createContainer(() => {
    scheduleRender()
  })

  const root = getContainerRoot(container)
  const fiberRoot = createFiberRoot(container)

  let currentBuffer: RenderBuffer | null = null
  let currentElement: ReactElement = element
  let renderScheduled = false

  function scheduleRender(): void {
    if (renderScheduled) return
    renderScheduled = true

    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => {
        renderScheduled = false
        doRender()
      })
    } else {
      setTimeout(() => {
        renderScheduled = false
        doRender()
      }, 0)
    }
  }

  function doRender(): void {
    reconciler.updateContainerSync(currentElement, fiberRoot, null, null)
    reconciler.flushSyncWork()

    const prevBuffer = currentBuffer
    const result = executeRenderAdapter(root, width, height, prevBuffer)
    currentBuffer = result.buffer

    onRender(currentBuffer as TBuffer)
  }

  // Initial render
  doRender()

  const unmount = (): void => {
    reconciler.updateContainer(null, fiberRoot, null, () => {})
    onUnmount?.()
  }

  return {
    rerender(newElement: ReactElement): void {
      currentElement = newElement
      scheduleRender()
    },

    unmount,
    [Symbol.dispose]: unmount,

    getBuffer(): RenderBuffer | null {
      return currentBuffer
    },

    refresh(): void {
      scheduleRender()
    },
  }
}

// ============================================================================
// One-Shot Render
// ============================================================================

/**
 * Render a React element once and return the buffer.
 * No ongoing updates — useful for static rendering or server-side generation.
 */
export function renderOnce<TBuffer extends RenderBuffer>(
  element: ReactElement,
  width: number,
  height: number,
): TBuffer {
  const container = createContainer(() => {})
  const root = getContainerRoot(container)
  const fiberRoot = createFiberRoot(container)

  reconciler.updateContainerSync(element, fiberRoot, null, null)
  reconciler.flushSyncWork()

  const { buffer } = executeRenderAdapter(root, width, height, null)

  reconciler.updateContainer(null, fiberRoot, null, () => {})

  return buffer as TBuffer
}
