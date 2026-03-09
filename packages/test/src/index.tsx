/**
 * Silvery Testing Library
 *
 * Unified App-based API for testing Silvery components.
 * Uses the actual silvery render pipeline for accurate ANSI output.
 *
 * ## Import Syntax
 *
 * ```tsx
 * import { createRenderer, bufferToText, stripAnsi } from '@silvery/test';
 * ```
 *
 * ## Auto-cleanup
 *
 * Each render() call from createRenderer automatically unmounts the previous render,
 * so you don't need explicit cleanup.
 *
 * ## Basic Testing
 *
 * @example
 * ```tsx
 * import { createRenderer } from '@silvery/test';
 * import { Text, Box } from '@silvery/react';
 *
 * const render = createRenderer({ cols: 80, rows: 24 });
 *
 * test('renders text', () => {
 *   const app = render(<Text>Hello</Text>);
 *
 *   // Plain text (no ANSI)
 *   expect(app.text).toContain('Hello');
 *
 *   // Auto-refreshing locators
 *   expect(app.getByText('Hello').count()).toBe(1);
 * });
 * ```
 *
 * ## Keyboard Input Testing
 *
 * @example
 * ```tsx
 * test('handles keyboard', () => {
 *   const app = render(<MyComponent />);
 *
 *   await app.press('j');           // Letter key
 *   await app.press('ArrowUp');     // Arrow keys
 *   await app.press('Escape');      // Special keys
 *   await app.press('Enter');       // Enter
 *
 *   expect(app.text).toContain('expected result');
 * });
 * ```
 *
 * ## Auto-refreshing Locators
 *
 * @example
 * ```tsx
 * test('locators auto-refresh', () => {
 *   const app = render(<Board />);
 *   const cursor = app.locator('[data-cursor]');
 *
 *   expect(cursor.textContent()).toBe('item1');
 *   await app.press('j');
 *   expect(cursor.textContent()).toBe('item2');  // Same locator, fresh result!
 * });
 * ```
 *
 * ## Querying by ID
 *
 * Two equivalent approaches for identifying components:
 *
 * @example
 * ```tsx
 * // Option 1: id prop with #id selector (CSS-style, preferred)
 * const app = render(<Box id="sidebar">Content</Box>);
 * expect(app.locator('#sidebar').textContent()).toBe('Content');
 *
 * // Option 2: testID prop with getByTestId (React Testing Library style)
 * const app = render(<Box testID="sidebar">Content</Box>);
 * expect(app.getByTestId('sidebar').textContent()).toBe('Content');
 * ```
 */

import { ensureDefaultLayoutEngine } from "@silvery/term/layout-engine"

// Re-export App for type usage
export type { App } from "@silvery/term/app"
export { createAutoLocator, type AutoLocator, type FilterOptions } from "./auto-locator"
export type { BoundTerm } from "@silvery/term/bound-term"

// Re-export buffer utilities for testing convenience
export { bufferToText, bufferToStyledText, bufferToHTML } from "@silvery/term/buffer"
export type { TerminalBuffer } from "@silvery/term/buffer"

// Re-export locator API for DOM queries (legacy, prefer App.locator())
export { createLocator, type SilveryLocator } from "./locator"
export type { Rect } from "@silvery/tea/types"

// Re-export keyboard utilities
export { keyToAnsi, keyToKittyAnsi, CODE_TO_KEY } from "@silvery/tea/keys"

// Re-export debug utilities
export { debugTree, type DebugTreeOptions } from "./debug"

// Re-export buffer comparison utilities
export { compareBuffers, formatMismatch, type BufferMismatch } from "./compare-buffers"

// Re-export render API
export {
  render,
  createRenderer,
  createStore,
  run,
  ensureEngine,
  getActiveRenderCount,
  type RenderOptions,
  type PerRenderOptions,
  type Store,
  type StoreOptions,
} from "@silvery/term/renderer"

// ============================================================================
// Module Initialization
// ============================================================================

// Configure React to recognize this as a testing environment for act() support
// This suppresses the "testing environment not configured" warning
// @ts-expect-error - React internal flag for testing environments
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Initialize default layout engine via top-level await.
// This ensures render()/createRenderer() work immediately after import.
await ensureDefaultLayoutEngine()

// ============================================================================
// Utility Functions
// ============================================================================

// Re-export stripAnsi from unicode.ts (canonical implementation)
import { stripAnsi } from "@silvery/term/unicode"
export { stripAnsi } from "@silvery/term/unicode"

/**
 * Normalize frame output for comparison.
 * - Strips ANSI codes
 * - Trims trailing whitespace from lines
 * - Removes empty trailing lines
 */
export function normalizeFrame(frame: string): string {
  return stripAnsi(frame)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()
}

/**
 * Wait for a condition to be true, polling at intervals.
 * Useful for waiting for async state updates.
 */
export async function waitFor(condition: () => boolean, { timeout = 1000, interval = 10 } = {}): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`)
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, interval)
    })
  }
}
