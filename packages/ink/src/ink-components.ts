/**
 * Ink compat components: Box, Text, Static, Newline, Spacer, Transform.
 * @internal
 */

import React, { createContext, useContext } from "react"
import { Box as SilveryBox, type BoxProps as SilveryBoxProps, type BoxHandle } from "@silvery/ag-react/components/Box"
import { Static as SilveryStatic } from "@silvery/ag-react/components/Static"
import { Text as SilveryText } from "@silvery/ag-react/components/Text"
import type { TextProps as SilveryTextProps, TextHandle as SilveryTextHandle } from "@silvery/ag-react/components/Text"

import {
  currentChalkLevel,
  ForceStylesCtx,
  InkRenderStateCtx,
  scanChildrenForVS16,
  childrenContainAnsi,
} from "./ink-utils"
import { sanitizeChildren } from "./ink-sanitize"
import { backgroundContext } from "./bg-context"

// =============================================================================
// Box
// =============================================================================

export type { BoxHandle } from "@silvery/ag-react/components/Box"

/**
 * Ink-compatible Box props. Same as silvery's BoxProps.
 */
export type BoxProps = SilveryBoxProps

/**
 * Ink-compatible Box component.
 *
 * Wraps silvery's Box with Ink's default flex properties:
 * - flexGrow: 0
 * - flexShrink: 1
 * - flexWrap: 'nowrap'
 *
 * These match Ink's Box.tsx line 83-88 defaults. User-provided props override.
 * flexDirection defaults to 'row' to match Ink's behavior (Ink Box.tsx line 85).
 */
export const Box = React.forwardRef<BoxHandle, BoxProps>(function InkBox(props, ref) {
  // When chalk has no color support, strip visual style props to match Ink behavior.
  // Ink uses chalk internally for border/background colors, so chalk.level=0 means
  // no styles are applied. But embedded ANSI in text content is still preserved.
  const hasColors = currentChalkLevel() > 0
  const effectiveBg = hasColors ? ((props as any).backgroundColor as string | undefined) : undefined
  const boxElement = React.createElement(SilveryBox, {
    flexDirection: "row",
    flexGrow: 0,
    flexShrink: 1,
    ...props,
    color: hasColors ? (props as any).color : undefined,
    backgroundColor: effectiveBg,
    borderColor: hasColors ? (props as any).borderColor : undefined,
    // borderDimColor is an Ink-specific prop not in silvery's BoxProps
    borderDimColor: hasColors ? (props as any).borderDimColor : undefined,
    ref,
  } as any)
  // Mirror Ink 7.0: when this Box has a background color, provide it to children
  // via React context so descendant <Text> can inherit it. Silvery already does
  // paint-time bg inheritance via findInheritedBg(), but providing the context
  // matches Ink's exact API surface so consumers that import `backgroundContext`
  // (and the upstream compat test suite) work without changes.
  if (effectiveBg) {
    return React.createElement(backgroundContext.Provider, { value: effectiveBg }, boxElement)
  }
  return boxElement
})

// =============================================================================
// Text
// =============================================================================

export type { TextProps, TextHandle } from "@silvery/ag-react/components/Text"

/**
 * Ink-compatible Text component.
 *
 * Wraps silvery's Text with ANSI sequence sanitization:
 * - Preserves SGR sequences (colors, bold, etc.)
 * - Preserves OSC sequences (hyperlinks, etc.)
 * - Strips cursor movement, screen clearing, and other control sequences
 * - Strips DCS, PM, APC, SOS control strings
 *
 * This matches Ink's text sanitization behavior from sanitize-ansi.ts.
 */
export const Text = React.forwardRef<SilveryTextHandle, SilveryTextProps>(function InkText(props, ref) {
  // Scan original children for user-provided VS16 before sanitization
  scanChildrenForVS16(props.children)
  const sanitizedChildren = sanitizeChildren(props.children)
  // Track embedded ANSI in children so processBuffer knows whether to strip
  // prop-based ANSI codes when chalk has no colors (FORCE_COLOR=0).
  const renderState = React.useContext(InkRenderStateCtx)
  if (renderState && !renderState.hasEmbeddedAnsi) {
    if (childrenContainAnsi(sanitizedChildren)) {
      renderState.hasEmbeddedAnsi = true
    }
  }
  // ForceStylesCtx is always true in the render() path so buffer cells
  // are styled for correct content edge detection (trailing whitespace).
  // When chalk has no colors, processBuffer handles ANSI stripping.
  const hasColors = currentChalkLevel() > 0
  const forceStyles = React.useContext(ForceStylesCtx)
  // Mirror Ink 7.0 Text: read inherited background from context, fall back to
  // explicit prop. Ink's logic is `effectiveBg = props.backgroundColor ?? inherited`,
  // and an empty string in `props.backgroundColor` means "explicitly opt out of
  // inheritance" — so we respect the explicit prop when it's defined (including "").
  const inheritedBg = React.useContext(backgroundContext)
  const explicitBg = (props as any).backgroundColor as string | undefined
  const effectiveBg = explicitBg !== undefined ? explicitBg : inheritedBg
  const passProps =
    hasColors || forceStyles
      ? {
          ...props,
          color: props.color,
          backgroundColor: effectiveBg,
          ref,
          children: sanitizedChildren,
        }
      : {
          // Only pass layout-affecting props, not visual style props
          wrap: props.wrap,
          ref,
          children: sanitizedChildren,
        }
  return React.createElement(SilveryText, passProps)
})

// =============================================================================
// Static
// =============================================================================

/**
 * Store for tracking Static component output.
 * Ink renders static content separately from dynamic content:
 * - Static output is accumulated across renders (fullStaticOutput)
 * - In debug mode, each frame writes fullStaticOutput + dynamicOutput
 * - Static output always gets a trailing \n appended
 */
export interface InkStaticStore {
  /** All rendered static items as text lines */
  renderedCount: number
  /** Accumulated full static output (grows with each new item) */
  fullStaticOutput: string
}

export const InkStaticStoreCtx = createContext<InkStaticStore | null>(null)

/**
 * Extract plain text from a React element tree.
 * Used to convert Static item render output to text without going through
 * the full silvery render pipeline.
 */
function extractTextFromElement(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return (node as React.ReactNode[]).map(extractTextFromElement).join("")
  if (React.isValidElement(node)) {
    const props = node.props as Record<string, any>
    return extractTextFromElement(props.children)
  }
  return ""
}

/**
 * Ink-compatible Static component for the compat layer.
 *
 * Renders nothing to the tree (returns null). Instead, converts items to text
 * and stores them in the InkStaticStore context. The render/writeFrame functions
 * read the store and prepend static output to the frame.
 *
 * This matches Ink's behavior where Static content is rendered separately
 * and placed above the dynamic content.
 */
export function Static<T>({
  items,
  children: renderItem,
  style,
}: {
  items: T[]
  children: (item: T, index: number) => React.ReactNode
  style?: Record<string, any>
}): React.ReactElement | null {
  const store = useContext(InkStaticStoreCtx)

  // When no static store is available (e.g., called outside the compat render()),
  // delegate to silvery's native Static component which handles both inline
  // (scrollback promotion) and fullscreen (render in tree) modes.
  if (!store) {
    return React.createElement(SilveryStatic, { items, children: renderItem, style } as any)
  }

  // Compute new items since last render
  if (items.length > store.renderedCount) {
    // Strip any previous padding suffix before appending new items
    const paddingBottom = (style?.paddingBottom as number) ?? 0
    if (paddingBottom > 0 && store.fullStaticOutput.length > 0) {
      // Remove trailing padding that was added in a previous render
      const paddingSuffix = "\n".repeat(paddingBottom)
      if (store.fullStaticOutput.endsWith(paddingSuffix)) {
        store.fullStaticOutput = store.fullStaticOutput.slice(0, -paddingSuffix.length)
      }
    }

    const newItems = items.slice(store.renderedCount)
    const newLines = newItems.map((item, i) => {
      const element = renderItem(item, store.renderedCount + i)
      return extractTextFromElement(element)
    })
    // Each item is on its own line, static output gets trailing \n from Ink's renderer
    const newStaticOutput = newLines.join("\n") + "\n"
    store.fullStaticOutput += newStaticOutput
    store.renderedCount = items.length

    // Apply paddingBottom from style — adds extra blank lines after items
    if (paddingBottom > 0) {
      store.fullStaticOutput += "\n".repeat(paddingBottom)
    }
  }

  // Return null — Static content is handled outside the normal render tree
  return null
}

// =============================================================================
// Re-exports
// =============================================================================

export { Newline } from "@silvery/ag-react/components/Newline"
export { Spacer } from "@silvery/ag-react/components/Spacer"
export { Transform } from "@silvery/ag-react/components/Transform"
export type { TransformProps } from "@silvery/ag-react/components/Transform"
