/**
 * Inkx Fill Component
 *
 * Repeats its children's text content to fill the parent's allocated width.
 * Wraps children (typically a styled Text) and repeats the text pattern
 * to exactly fill available space. Follows CSS leader() spec for edge cases.
 *
 * @example
 * ```tsx
 * // Dot leaders (fills remaining space with dots)
 * <Box>
 *   <Text color="yellow">hjkl</Text>
 *   <Box flexGrow={1}>
 *     <Fill><Text dimColor>.</Text></Fill>
 *   </Box>
 *   <Text>navigate</Text>
 * </Box>
 *
 * // Section header fill
 * <Box>
 *   <Text dimColor>── </Text>
 *   <Text bold color="cyan">NAVIGATION</Text>
 *   <Box flexGrow={1}>
 *     <Fill><Text dimColor> ─</Text></Fill>
 *   </Box>
 * </Box>
 *
 * // Capped repetition
 * <Fill max={5}><Text color="yellow">★ </Text></Fill>
 * ```
 */

import { type JSX, type ReactNode, useMemo, Children, isValidElement, cloneElement } from "react"
import { useContentRect } from "../hooks/useLayout.js"
import { displayWidth, splitGraphemes, graphemeWidth } from "../unicode.js"

export interface FillProps {
  /** Content to repeat (typically a styled Text element or plain string) */
  children: ReactNode
  /** Maximum number of repetitions. If omitted, fills all available width. */
  max?: number
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
    } else if (isValidElement(child) && child.props.children != null) {
      text += extractText(child.props.children as ReactNode)
    }
  })
  return text
}

/**
 * Repeats children's text content to fill parent width.
 *
 * Uses `useContentRect()` to read the parent Box's allocated width,
 * then repeats the text pattern to exactly fill that space. Handles
 * wide characters correctly (never splits a glyph). Allows partial
 * pattern at the end per CSS leader() spec.
 */
export function Fill({ children, max }: FillProps): JSX.Element | null {
  const { width } = useContentRect()

  const repeatedText = useMemo(() => {
    const pattern = extractText(children)
    if (!pattern || width <= 0) return null

    const unitWidth = displayWidth(pattern)
    if (unitWidth <= 0) return null

    let count = Math.floor(width / unitWidth)
    if (max !== undefined) count = Math.min(count, max)
    if (count <= 0) return null

    let text = pattern.repeat(count)
    let usedWidth = count * unitWidth

    // CSS leader spec: allow partial pattern at the end
    if (usedWidth < width && (max === undefined || count < max)) {
      const graphemes = splitGraphemes(pattern)
      for (const g of graphemes) {
        const gw = graphemeWidth(g)
        if (usedWidth + gw > width) break
        text += g
        usedWidth += gw
      }
    }

    return text
  }, [children, width, max])

  if (!repeatedText) return null

  // Clone the outermost child element and replace its text content
  const childArray = Children.toArray(children)
  const firstChild = childArray[0]

  if (isValidElement(firstChild)) {
    return cloneElement(firstChild, {}, repeatedText)
  }

  // Plain string children — return the repeated text directly
  return <>{repeatedText}</>
}
