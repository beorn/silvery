/**
 * Reconciler Helper Functions
 *
 * Utility functions for props comparison and change detection
 * used by the React reconciler during updates.
 */

/**
 * Set of layout-affecting props.
 */
export const LAYOUT_PROPS = new Set([
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "flexDirection",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "alignContent",
  "alignSelf",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "gap",
  "borderStyle",
  "borderTop",
  "borderBottom",
  "borderLeft",
  "borderRight",
  "display",
  "position",
  "overflow",
  // Note: scrollTo intentionally excluded - it doesn't affect layout dimensions,
  // only scroll offset which is handled in scrollPhase (reads props.scrollTo directly)
])

/**
 * Check if layout-affecting props changed.
 */
export function layoutPropsChanged(oldProps: Record<string, unknown>, newProps: Record<string, unknown>): boolean {
  for (const prop of LAYOUT_PROPS) {
    if (oldProps[prop] !== newProps[prop]) {
      return true
    }
  }
  return false
}

/**
 * Check if content-affecting props changed.
 * Returns "text" for text content changes (affect layout dimensions),
 * "style" for style-only changes (affect paint but not layout),
 * or false if nothing content-related changed.
 */
export function contentPropsChanged(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
): "text" | "style" | false {
  // Children change triggers content change ONLY for primitive children (text)
  // Array children are React elements that get reconciled separately
  const oldChildren = oldProps.children
  const newChildren = newProps.children
  if (oldChildren !== newChildren) {
    // Only trigger for primitive children (string, number) that affect text rendering
    const oldIsPrimitive = typeof oldChildren === "string" || typeof oldChildren === "number"
    const newIsPrimitive = typeof newChildren === "string" || typeof newChildren === "number"
    if (oldIsPrimitive || newIsPrimitive) {
      return "text" // Text changes affect layout (measure returns different result)
    }
    // Array/object children are React elements - don't set contentDirty
    // (child nodes will be updated via their own commitUpdate calls)
  }

  // Style props affect content (paint) but NOT layout dimensions.
  // borderColor, color, bold, etc. don't change how much space a node takes.
  // borderStyle is also a layout prop (affects border widths), but it's included
  // here so paintDirty is set — otherwise border add/remove doesn't trigger
  // renderBox to draw/clear border characters.
  const styleProps = [
    "color",
    "backgroundColor",
    "bold",
    "dim",
    "dimColor",
    "italic",
    "underline",
    "underlineStyle",
    "underlineColor",
    "strikethrough",
    "inverse",
    "wrap",
    "borderColor",
    "borderStyle",
    "outlineStyle",
    "outlineColor",
    "outlineDimColor",
    "internal_transform",
  ]

  for (const prop of styleProps) {
    if (oldProps[prop] !== newProps[prop]) {
      return "style"
    }
  }

  return false
}

/**
 * Shallow compare two prop objects.
 */
export function propsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) {
    return false
  }

  for (const key of keysA) {
    if (a[key] !== b[key]) {
      return false
    }
  }

  return true
}
