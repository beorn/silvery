/** Compatibility path for the render adapter state and lazy terminal fallback. */

export {
  getRenderAdapter,
  getTextMeasurer,
  hasRenderAdapter,
  setRenderAdapter,
  type BorderChars,
  type RenderAdapter,
  type RenderBuffer,
  type RenderStyle,
  type TextMeasurer,
  type TextMeasureResult,
  type TextMeasureStyle,
} from "./render-adapter-state"

import { hasRenderAdapter, setRenderAdapter } from "./render-adapter-state"

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
