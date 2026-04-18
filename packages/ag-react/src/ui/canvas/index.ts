/**
 * Canvas Entry Point
 *
 * Provides a browser-friendly API for rendering silvery components to HTML5 Canvas.
 * Supports both display-only and fully interactive rendering (keyboard, focus).
 *
 * @example
 * ```tsx
 * import { renderToCanvas } from '@silvery/ag-react/ui/canvas';
 *
 * const canvas = document.getElementById('canvas');
 * const instance = renderToCanvas(<App />, canvas, {
 *   fontSize: 14,
 *   input: true,  // enable keyboard + focus
 * });
 *
 * instance.unmount();
 * ```
 */

import React, { type ReactElement } from "react"
import {
  type CanvasAdapterConfig,
  CanvasRenderBuffer,
  createCanvasAdapter,
} from "@silvery/ag-term/adapters/canvas-adapter"
import { runWithMeasurer, type Measurer } from "@silvery/ag-term/unicode"
import { createPretextMeasurer } from "./pretext-measurer"
import { createDomMeasurer } from "./dom-measurer"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { setLayoutEngine } from "@silvery/ag-term/layout-engine"
import { executeRenderAdapter } from "@silvery/ag-term/pipeline"
import type { RenderAdapter, RenderBuffer } from "@silvery/ag-term/render-adapter"
import { setRenderAdapter } from "@silvery/ag-term/render-adapter"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
  runWithDiscreteEvent,
  setOnNodeRemoved,
} from "../../reconciler/index"
import { RuntimeContext, FocusManagerContext, type RuntimeContextValue } from "../../context"
import { createFocusManager } from "@silvery/ag/focus-manager"
import { parseKey, splitRawInput } from "@silvery/ag/keys"
import { parseBracketedPaste } from "@silvery/ag-term/bracketed-paste"
import { ThemeProvider } from "@silvery/theme/ThemeContext"
import { catppuccinMocha } from "@silvery/theme/schemes"
import { deriveTheme, type Theme } from "@silvery/theme"
import { setActiveTheme } from "@silvery/theme/state"
import { createCursorStore, CursorProvider } from "../../hooks/useCursor"
import { createCanvasInput, type CanvasInputConfig } from "./input"

// Re-export core components
export { Box, type BoxProps } from "../../components/Box"
export { Text, type TextProps } from "../../components/Text"

// Re-export hooks
export { useBoxRect, useScrollRect, useScreenRect } from "../../hooks/useLayout"
export { useApp } from "../../hooks/useApp"
export { useFocusable } from "../../hooks/useFocusable"
export { useFocusManager } from "../../hooks/useFocusManager"
export { useFocusWithin } from "../../hooks/useFocusWithin"

// Re-export all canvas-safe UI components
export { Badge, type BadgeProps } from "../components/Badge"
export { Breadcrumb, type BreadcrumbProps } from "../components/Breadcrumb"
export { Button, type ButtonProps } from "../components/Button"
export { CursorLine } from "../components/CursorLine"
export { Divider } from "../components/Divider"
export { Form, FormField } from "../components/Form"
export { ListView } from "../components/ListView"
export { ModalDialog } from "../components/ModalDialog"
export { PickerDialog } from "../components/PickerDialog"
export { ProgressBar } from "../components/ProgressBar"
export { Screen } from "../components/Screen"
export { SearchBar } from "../components/SearchBar"
export { SelectList } from "../components/SelectList"
export { Skeleton } from "../components/Skeleton"
export { Spinner } from "../components/Spinner"
export { SplitView } from "../components/SplitView"
export { Table } from "../components/Table"
export { Tabs, TabList, Tab, TabPanel } from "../components/Tabs"
export { TextArea } from "../components/TextArea"
export { TextInput } from "../components/TextInput"
export { Toggle } from "../components/Toggle"
export { Tooltip } from "../components/Tooltip"
export { TreeView } from "../components/TreeView"
export { HorizontalVirtualList } from "../components/HorizontalVirtualList"
export {
  H1,
  H2,
  H3,
  P,
  Lead,
  Muted,
  Small,
  Strong,
  Em,
  Code,
  Kbd,
  Blockquote,
  CodeBlock,
  HR,
  UL,
  OL,
  LI,
} from "../components/Typography"
export { useToast, ToastContainer } from "../components/Toast"

// Re-export adapter utilities
export {
  createCanvasAdapter,
  CanvasRenderBuffer,
  type CanvasAdapterConfig,
} from "@silvery/ag-term/adapters/canvas-adapter"

// Re-export input handler
export {
  keyboardEventToSequence,
  createCanvasInput,
  type CanvasInputConfig,
  type CanvasInputInstance,
  type CanvasMouseEvent,
} from "./input"

// ============================================================================
// Types
// ============================================================================

/** Input handling options for renderToCanvas */
export interface CanvasInputOptions {
  /** Called on keyboard input (raw terminal escape sequences) */
  onKey?: (data: string) => void
  /** Called when the canvas gains or loses focus */
  onFocus?: (focused: boolean) => void
}

export interface CanvasRenderOptions extends CanvasAdapterConfig {
  /** Width of the canvas in pixels (default: canvas.width) */
  width?: number
  /** Height of the canvas in pixels (default: canvas.height) */
  height?: number
  /** Theme to use (default: Catppuccin Mocha) */
  theme?: Theme
  /**
   * Text measurement strategy for proportional mode.
   * - `"pretext"` (default) — fast, uses @chenglou/pretext canvas measurement
   * - `"dom"` — pixel-perfect CSS parity, uses hidden DOM elements (slower, causes reflow)
   */
  measurer?: "pretext" | "dom"
  /**
   * Enable keyboard input and focus management.
   *
   * When enabled, `useInput()` and focus management work inside rendered components.
   *
   * - `true` — enable input handling (keyboard via hidden textarea)
   * - `{ onKey, onFocus }` — enable with callbacks
   * - `false` — display-only (default)
   */
  input?: boolean | CanvasInputOptions
  /** Exit on Ctrl+C (default: true when input is enabled) */
  exitOnCtrlC?: boolean
  /** Handle Tab/Shift+Tab/Escape focus cycling (default: true when input is enabled) */
  handleFocusCycling?: boolean
  /** Mouse event callback (click, wheel, drag) */
  onMouse?: (event: import("./input").CanvasMouseEvent) => void
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
  /** Get the ag tree root node (for diagnostics, tree walking) */
  getRoot: () => import("@silvery/ag").AgNode | null
  /** Force a re-render */
  refresh: () => void
  /** Resize the canvas and re-render */
  resize: (pixelWidth: number, pixelHeight: number) => void
}

// ============================================================================
// Dimension Helpers
// ============================================================================

/** Compute pipeline dimensions from pixel size and font config. */
function computeDimensions(pixelWidth: number, pixelHeight: number, options: CanvasRenderOptions) {
  const fontSize = options.fontSize ?? 14
  const lineHeightMultiplier = options.lineHeight ?? 1.2
  const isProportional = options.monospace === false
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * lineHeightMultiplier
  const cols = isProportional ? pixelWidth : Math.floor(pixelWidth / charWidth)
  const rows = isProportional ? pixelHeight : Math.floor(pixelHeight / lineHeight)
  const measurerType = (options as CanvasRenderOptions).measurer ?? "pretext"
  const fontFamily = options.fontFamily ?? "monospace"
  let measurer: (Measurer & { dispose?: () => void }) | undefined
  if (isProportional) {
    measurer =
      measurerType === "dom"
        ? createDomMeasurer({ fontSize, fontFamily, lineHeight: lineHeightMultiplier })
        : createPretextMeasurer({ fontSize, fontFamily, lineHeight: lineHeightMultiplier })
  }
  return {
    fontSize,
    lineHeightMultiplier,
    isProportional,
    charWidth,
    lineHeight,
    cols,
    rows,
    measurer,
  }
}

// ============================================================================
// Initialization
// ============================================================================

let initialized = false
let currentAdapter: RenderAdapter | null = null
let lastMonospace: boolean | undefined

function initCanvasRenderer(config: CanvasAdapterConfig): void {
  const monospace = config.monospace ?? true
  // Re-init if monospace mode changed (adapter + measurer need to match)
  if (initialized && lastMonospace === monospace) return

  setLayoutEngine(createFlexilyZeroEngine())
  currentAdapter = createCanvasAdapter(config)
  setRenderAdapter(currentAdapter)

  lastMonospace = monospace
  initialized = true
}

// ============================================================================
// Theme
// ============================================================================

let cachedTheme: Theme | null = null
function getDefaultTheme(): Theme {
  if (!cachedTheme) cachedTheme = deriveTheme(catppuccinMocha)
  return cachedTheme
}

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render a React element to an HTML5 Canvas.
 *
 * When `input` is enabled, provides full runtime support:
 * - `useInput()` works for keyboard input handling
 * - Focus management (Tab/Shift+Tab/Escape cycling)
 * - Keyboard input via hidden textarea (standard web terminal technique)
 *
 * @param element - React element to render
 * @param canvas - Target canvas element
 * @param options - Render options (font size, colors, input handling, etc.)
 * @returns CanvasInstance for controlling the render
 */
export function renderToCanvas(
  element: ReactElement,
  canvas: HTMLCanvasElement,
  options: CanvasRenderOptions = {},
): CanvasInstance {
  // Auto-detect DPR for sharp HiDPI rendering
  const dpr = options.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1)
  const optionsWithDpr = { ...options, dpr }

  initCanvasRenderer(optionsWithDpr)

  const theme = options.theme ?? getDefaultTheme()
  setActiveTheme(theme)

  let pixelWidth = options.width ?? canvas.width
  let pixelHeight = options.height ?? canvas.height

  // Set canvas: internal size at native resolution, CSS display size at logical pixels
  canvas.width = Math.ceil(pixelWidth * dpr)
  canvas.height = Math.ceil(pixelHeight * dpr)
  canvas.style.width = `${pixelWidth}px`
  canvas.style.height = `${pixelHeight}px`

  let dims = computeDimensions(pixelWidth, pixelHeight, optionsWithDpr)
  let { cols, rows } = dims
  const { charWidth, lineHeight, isProportional, measurer: pixelMeasurer } = dims

  // Cursor store for cursor position tracking
  const cursorStore = createCursorStore()

  const container = createContainer(() => {
    scheduleRender()
  })

  const root = getContainerRoot(container)
  const fiberRoot = createFiberRoot(container)

  let currentBuffer: RenderBuffer | null = null
  let currentElement: ReactElement = element
  let renderScheduled = false
  let unmounted = false

  // ---- Input / Runtime setup ----
  const inputOpts = options.input
  const inputEnabled = inputOpts === true || (typeof inputOpts === "object" && inputOpts !== null)
  const inputCallbacks: CanvasInputOptions = typeof inputOpts === "object" && inputOpts !== null ? inputOpts : {}
  const exitOnCtrlC = options.exitOnCtrlC ?? inputEnabled
  const handleFocusCycling = options.handleFocusCycling ?? inputEnabled

  let canvasInput: ReturnType<typeof createCanvasInput> | null = null
  let focusManager: ReturnType<typeof createFocusManager> | null = null
  let runtimeContextValue: RuntimeContextValue | null = null

  // Subscriber lists for RuntimeContext
  type InputEventHandler = (input: string, key: import("@silvery/ag/keys").Key) => void
  type PasteEventHandler = (text: string) => void
  const inputHandlers = new Set<InputEventHandler>()
  const pasteHandlers = new Set<PasteEventHandler>()

  let doUnmount: () => void = () => {}
  const handleExit = (_error?: Error) => {
    doUnmount()
  }

  if (inputEnabled) {
    focusManager = createFocusManager()
    setOnNodeRemoved((removedNode) => focusManager!.handleSubtreeRemoved(removedNode))

    // Create canvas input handler (hidden textarea + DOM event conversion)
    const canvasContainer = canvas.parentElement ?? canvas
    canvasInput = createCanvasInput({
      container: canvasContainer,
      onData(data: string) {
        if (unmounted) return

        // Check for bracketed paste
        const pasteResult = parseBracketedPaste(data)
        if (pasteResult) {
          for (const handler of pasteHandlers) handler(pasteResult.content)
          return
        }

        // Split and process individual keys
        for (const keypress of splitRawInput(data)) {
          processKey(keypress)
        }
      },
      onFocusChange(focused: boolean) {
        inputCallbacks.onFocus?.(focused)
      },
      onMouse: options.onMouse,
    })

    // Set dimensions for mouse coordinate conversion
    canvasInput.updateDimensions(charWidth, lineHeight)

    function processKey(rawKey: string): void {
      // Handle Ctrl+C
      if (rawKey === "\x03" && exitOnCtrlC) {
        handleExit()
        return
      }

      // Focus cycling (Tab/Shift+Tab/Escape)
      if (handleFocusCycling && focusManager) {
        const treeRoot = getContainerRoot(container)
        if (treeRoot) {
          const [, key] = parseKey(rawKey)
          if (key.tab && !key.shift) {
            focusManager.focusNext(treeRoot)
            reconciler.flushSyncWork()
            return
          }
          if (key.tab && key.shift) {
            focusManager.focusPrev(treeRoot)
            reconciler.flushSyncWork()
            return
          }
          if (key.escape && focusManager.activeElement) {
            focusManager.blur()
            reconciler.flushSyncWork()
            return
          }
        }
      }

      // Parse and dispatch to RuntimeContext subscribers
      const [input, key] = parseKey(rawKey)
      runWithDiscreteEvent(() => {
        for (const handler of inputHandlers) handler(input, key)
      })
      reconciler.flushSyncWork()

      // Also call user callback
      inputCallbacks.onKey?.(rawKey)
    }

    // Build RuntimeContext value
    runtimeContextValue = {
      on(event, handler) {
        if (event === "input") {
          const typed = handler as InputEventHandler
          inputHandlers.add(typed)
          return () => {
            inputHandlers.delete(typed)
          }
        }
        if (event === "paste") {
          const typed = handler as unknown as PasteEventHandler
          pasteHandlers.add(typed)
          return () => {
            pasteHandlers.delete(typed)
          }
        }
        return () => {} // Unknown event — no-op cleanup
      },
      emit() {
        // renderToCanvas doesn't support view → runtime events
      },
      exit: handleExit,
    }
  }

  // Wrap element with context providers
  function wrapElement(el: ReactElement): ReactElement {
    const withCursor = React.createElement(CursorProvider, { store: cursorStore }, el)
    const themed = React.createElement(ThemeProvider, { theme, children: withCursor })

    if (!inputEnabled || !runtimeContextValue || !focusManager) return themed
    return React.createElement(
      FocusManagerContext.Provider,
      { value: focusManager },
      React.createElement(RuntimeContext.Provider, { value: runtimeContextValue }, themed),
    )
  }

  function scheduleRender(): void {
    if (renderScheduled || unmounted) return
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
    if (unmounted) return
    reconciler.updateContainerSync(wrapElement(currentElement), fiberRoot, null, null)
    reconciler.flushSyncWork()

    const prevBuffer = currentBuffer
    const execute = () => executeRenderAdapter(root, cols, rows, prevBuffer)
    const result = pixelMeasurer ? runWithMeasurer(pixelMeasurer, execute) : execute()
    currentBuffer = result.buffer

    // Copy rendered buffer (at native DPR resolution) to visible canvas
    const ctx = canvas.getContext("2d")
    if (ctx && currentBuffer instanceof CanvasRenderBuffer) {
      // Reset transform — buffer is already at native resolution, copy 1:1
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      // Clear previous frame (prevents stale content when render shrinks)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(currentBuffer.canvas, 0, 0)

      // Render cursor on canvas (inverse block at cursor position)
      const cursor = cursorStore.accessors.getCursorState()
      if (cursor?.visible) {
        // Cursor coordinates are in CSS pixels — scale by DPR for native canvas
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const cx = cursor.x * charWidth
        const cy = cursor.y * lineHeight
        ctx.save()
        ctx.globalCompositeOperation = "difference"
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(cx, cy, charWidth, lineHeight)
        ctx.restore()
      }
    }
  }

  // Initial render (two passes for layout feedback — useBoxRect)
  doRender()
  doRender()

  // Auto-focus if input is enabled
  if (canvasInput) canvasInput.focus()

  const unmount = (): void => {
    if (unmounted) return
    unmounted = true

    if (canvasInput) canvasInput.dispose()
    reconciler.updateContainerSync(null, fiberRoot, null, null)
    reconciler.flushSyncWork()
    setOnNodeRemoved(null)
    inputHandlers.clear()
    pasteHandlers.clear()
  }
  doUnmount = unmount

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

    getRoot() {
      return root
    },

    refresh(): void {
      scheduleRender()
    },

    resize(newPixelWidth: number, newPixelHeight: number): void {
      pixelWidth = newPixelWidth
      pixelHeight = newPixelHeight
      canvas.width = Math.ceil(pixelWidth * dpr)
      canvas.height = Math.ceil(pixelHeight * dpr)
      canvas.style.width = `${pixelWidth}px`
      canvas.style.height = `${pixelHeight}px`
      dims = computeDimensions(pixelWidth, pixelHeight, optionsWithDpr)
      cols = dims.cols
      rows = dims.rows
      // Clear buffer for full repaint at new size
      currentBuffer = null
      // Two passes for layout feedback
      renderScheduled = false
      doRender()
      doRender()
    },
  }
}

/**
 * Render a React element to a canvas and return the buffer.
 * One-shot render without ongoing updates.
 */
export function renderCanvasOnce(
  element: ReactElement,
  width: number,
  height: number,
  options: CanvasAdapterConfig = {},
): CanvasRenderBuffer {
  initCanvasRenderer(options)

  const { cols, rows, measurer: onceMeasurer } = computeDimensions(width, height, options)

  const container = createContainer(() => {})
  const root = getContainerRoot(container)
  const fiberRoot = createFiberRoot(container)

  reconciler.updateContainerSync(element, fiberRoot, null, null)
  reconciler.flushSyncWork()

  const execute = () => executeRenderAdapter(root, cols, rows, null)
  const { buffer } = onceMeasurer ? runWithMeasurer(onceMeasurer, execute) : execute()

  reconciler.updateContainer(null, fiberRoot, null, () => {})

  return buffer as CanvasRenderBuffer
}
