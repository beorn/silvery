/**
 * withTest() — Compose plugin that adds testing convenience methods.
 *
 * Requires withReact() — adds press(), text, lines, containsText() for testing. // seam-allow: no caller outside its own tests; kept pending E-7 (@i/17-test-system/25631-the-engineering-lane/25641-e-7-dead-modules-are-kept-alive-only-by-their-tests)
 *
 * @example
 * ```tsx
 * const app = pipe(create(), withAg(), withTerm(term), withReact(<App />), withTest())
 * app.render()
 * app.press("j")
 * expect(app.text).toContain("Count: 1")
 * ```
 */

import type { Ag } from "./ag"
import type { Term } from "./ansi/term"
import type { TextFrame } from "@silvery/ag/text-frame"
import { splitRawInput } from "@silvery/ag/keys"

// =============================================================================
// Types
// =============================================================================

interface AppWithRenderBase {
  readonly ag: Ag
  readonly term: Term
  render(): void
  dispatch(op: { type: string; [key: string]: unknown }): void
}

export interface AppWithTest {
  /** Send a keypress through the app */
  press(key: string): void
  /** Current rendered plain text */
  readonly text: string
  /** Current rendered lines */
  readonly lines: string[]
  /** Check if text contains substring */
  containsText(text: string): boolean
  /** Current frame width */
  readonly width: number
  /** Current frame height */
  readonly height: number
}

// =============================================================================
// Plugin
// =============================================================================

export function withTest() {
  return <A extends AppWithRenderBase>(app: A) => {
    // Render once to get initial frame
    app.render()

    const getFrame = (): TextFrame => {
      app.ag.layout({ cols: app.term.size.cols(), rows: app.term.size.rows() })
      const result = app.ag.render({ fresh: true })
      return result.frame
    }

    const appTest: AppWithTest = {
      press(key: string) {
        // Parse key into input events and dispatch
        const keys = splitRawInput(key)
        for (const [input] of keys) {
          app.dispatch({ type: "input:key", input })
        }
        // Re-render after input
        app.render()
      },

      get text() {
        return getFrame().text
      },

      get lines() {
        return getFrame().lines
      },

      containsText(text: string) {
        return getFrame().containsText(text)
      },

      get width() {
        return app.term.size.cols()
      },

      get height() {
        return app.term.size.rows()
      },
    }

    return { ...app, ...appTest } as A & AppWithTest
  }
}
