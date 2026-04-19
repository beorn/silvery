/**
 * Silvery Fill Component
 *
 * Repeats its children's text content to fill the parent's allocated width.
 * Single-pass rendering: generates a long repeated string that gets
 * hard-clipped by the Text element's wrap="clip" mode. No useBoxRect,
 * no layout re-render cycle.
 *
 * Parent Box MUST use `flexBasis={0}` to prevent the long content from
 * inflating the flex item's minimum size.
 *
 * @example
 * ```tsx
 * // Dot leaders — parent needs flexGrow={1} flexBasis={0}
 * <Box>
 *   <Text color="yellow">hjkl</Text>
 *   <Box flexGrow={1} flexBasis={0}>
 *     <Fill><Text dimColor>.</Text></Fill>
 *   </Box>
 *   <Text>navigate</Text>
 * </Box>
 *
 * // Section header fill
 * <Box>
 *   <Text dimColor>── </Text>
 *   <Text bold color="cyan">NAVIGATION</Text>
 *   <Box flexGrow={1} flexBasis={0}>
 *     <Fill><Text dimColor> ─</Text></Fill>
 *   </Box>
 * </Box>
 * ```
 */

import React, {
  type JSX,
  type ReactNode,
  useMemo,
  Children,
  isValidElement,
  cloneElement,
} from "react"
import { type Measurer, displayWidth } from "@silvery/ag-term/unicode"

/** Maximum fill width in columns. Covers ultrawide terminals (8K at 5px font ≈ 1500 cols). */
const MAX_FILL_COLS = 500

export interface FillProps {
  /** Content to repeat (typically a styled Text element or plain string) */
  children: ReactNode
  /** Optional explicit measurer for width calculation (avoids module-level global) */
  measurer?: Measurer
}

/**
 * Extract plain text content from React children (strings, numbers, nested elements).
 */
function extractText(children: ReactNode): string {
  let text = ""
  Children.forEach(children, (child) => {
    if (typeof child === "string") {
      text += child
    } else if (typeof child === "number") {
      text += String(child)
    } else if (isValidElement(child) && (child as React.ReactElement<any>).props.children != null) {
      text += extractText((child as React.ReactElement<any>).props.children as ReactNode)
    }
  })
  return text
}

/**
 * Clone the outermost child element, replace its text content, and set
 * wrap="clip" to hard-truncate the long text without adding an ellipsis.
 * Falls back to plain text fragment for string children.
 */
function renderWithText(children: ReactNode, text: string): JSX.Element {
  const childArray = Children.toArray(children)
  const firstChild = childArray[0]

  if (isValidElement(firstChild)) {
    return cloneElement(firstChild as React.ReactElement<any>, { wrap: "clip" }, text)
  }

  return <>{text}</>
}

/**
 * Repeats children's text content to fill parent width.
 *
 * Single-pass rendering: generates a long repeated string, truncated by the
 * Text element. No layout feedback needed — no useBoxRect, no re-render.
 *
 * Parent Box **must** use `flexBasis={0}` so the long text doesn't inflate
 * the flex minimum size; it gets truncated to the allocated width.
 */
export function Fill({ children, measurer }: FillProps): JSX.Element {
  const repeatedText = useMemo(() => {
    const pattern = extractText(children)
    if (!pattern) return null

    // Use explicit measurer when available, fall back to module-level convenience function
    const dw = measurer ? measurer.displayWidth.bind(measurer) : displayWidth
    const unitWidth = dw(pattern)
    if (unitWidth <= 0) return null

    const count = Math.ceil(MAX_FILL_COLS / unitWidth)
    return pattern.repeat(count)
  }, [children, measurer])

  if (!repeatedText) return <>{children}</>
  return renderWithText(children, repeatedText)
}
