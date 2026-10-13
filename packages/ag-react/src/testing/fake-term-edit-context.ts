/**
 * @fakes @silvery/ag-react
 *
 * A {@link TermEditContext} over fixed text, built through the real
 * `createTermEditContext` — a member added to the contract fails to compile
 * here, and no cast stands in for it. Tests that read only `text`,
 * `wrapWidth` and the selection (km's `clickToCursorOffset`) get the real
 * cursor/selection behaviour for free.
 */
import { createTermEditContext } from "../edit-context.ts"
import type { TermEditContext } from "../edit-context.ts"

export function createFakeTermEditContext(text: string, wrapWidth = 80): TermEditContext {
  return createTermEditContext({
    text,
    wrapWidth,
    selectionStart: text.length,
    selectionEnd: text.length,
  })
}
