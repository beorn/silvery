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
  "columnGap",
  "rowGap",
  "borderStyle",
  "borderTop",
  "borderBottom",
  "borderLeft",
  "borderRight",
  "display",
  "position",
  "top",
  "left",
  "bottom",
  "right",
  "aspectRatio",
  "overflow",
  "overflowX",
  "overflowY",
  // Note: scrollTo intentionally excluded - it doesn't affect layout dimensions,
  // only scroll offset which is handled in scrollPhase (reads props.scrollTo directly)
])

/**
 * Set of content props that affect layout dimensions (trigger contentDirty + layoutDirty).
 * wrap changes text line count; internal_transform changes text width.
 */
const TEXT_CONTENT_PROPS = new Set(["wrap", "internal_transform"])

/**
 * Set of style props that affect content (paint) but NOT layout dimensions.
 * borderColor, color, bold, etc. don't change how much space a node takes.
 * borderStyle is also a layout prop (affects border widths), but it's included
 * here so stylePropsDirty is set — otherwise border add/remove doesn't trigger
 * renderBox to draw/clear border characters.
 */
const STYLE_PROPS = new Set([
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
  "borderColor",
  "borderStyle",
  "outlineStyle",
  "outlineColor",
  "outlineDimColor",
  "outlineTop",
  "outlineBottom",
  "outlineLeft",
  "outlineRight",
  "theme",
])

// ============================================================================
// Single-pass prop change classification
// ============================================================================

/**
 * Result of classifying prop changes in a single pass.
 */
export interface PropChangeResult {
  /** Whether any prop changed (replaces propsEqual) */
  anyChanged: boolean
  /** Whether layout-affecting props changed (replaces layoutPropsChanged) */
  layoutChanged: boolean
  /**
   * Content change type (replaces contentPropsChanged):
   * - "text": text content changed (affects layout dimensions)
   * - "style": style-only change (affects paint but not layout)
   * - false: no content change
   */
  contentChanged: "text" | "style" | false
}

/** Shared singleton for the no-changes fast path (identity check). */
const NO_CHANGES: PropChangeResult = { anyChanged: false, layoutChanged: false, contentChanged: false }

/**
 * Classify all prop changes in a single pass over the union of old and new keys.
 *
 * Replaces the previous 3-pass approach (propsEqual + layoutPropsChanged +
 * contentPropsChanged) with one iteration. Includes an identity fast path
 * and early exit when both layout and content flags are fully determined.
 */
export function classifyPropChanges(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
): PropChangeResult {
  // Identity check — fastest path
  if (oldProps === newProps) return NO_CHANGES

  const keysA = Object.keys(oldProps)
  const keysB = Object.keys(newProps)

  // Different key count means something definitely changed
  const sameKeyCount = keysA.length === keysB.length

  let layoutChanged = false
  let contentChanged: "text" | "style" | false = false
  let anyChanged = false

  // Iterate old keys — covers changed values and keys removed in newProps
  for (const key of keysA) {
    if (oldProps[key] !== newProps[key]) {
      anyChanged = true
      if (LAYOUT_PROPS.has(key)) layoutChanged = true
      // Classify content change (text > style priority)
      if (contentChanged !== "text") {
        if (key === "children") {
          // Only primitive children (string, number) affect text rendering.
          // Array/object children are React elements reconciled separately.
          const oldIsPrimitive = typeof oldProps[key] === "string" || typeof oldProps[key] === "number"
          const newIsPrimitive = typeof newProps[key] === "string" || typeof newProps[key] === "number"
          if (oldIsPrimitive || newIsPrimitive) {
            contentChanged = "text"
          }
        } else if (TEXT_CONTENT_PROPS.has(key)) {
          contentChanged = "text"
        } else if (contentChanged !== "style" && STYLE_PROPS.has(key)) {
          contentChanged = "style"
        }
      }
      // Early exit: both layout and text-content detected — can't escalate further
      if (layoutChanged && contentChanged === "text") break
    }
  }

  // Check for keys added in newProps (present in newProps but absent in oldProps).
  // If key counts are the same and we found changes above, all keys that exist in
  // newProps also exist in oldProps (no new keys were added). Skip this loop.
  if (!sameKeyCount) {
    for (const key of keysB) {
      if (!(key in oldProps)) {
        anyChanged = true
        if (LAYOUT_PROPS.has(key)) layoutChanged = true
        if (contentChanged !== "text") {
          if (key === "children") {
            const newIsPrimitive = typeof newProps[key] === "string" || typeof newProps[key] === "number"
            if (newIsPrimitive) {
              contentChanged = "text"
            }
          } else if (TEXT_CONTENT_PROPS.has(key)) {
            contentChanged = "text"
          } else if (contentChanged !== "style" && STYLE_PROPS.has(key)) {
            contentChanged = "style"
          }
        }
        if (layoutChanged && contentChanged === "text") break
      }
    }
  }

  // If key counts differ, something definitely changed even if no individual
  // key comparison flagged it (e.g., a key was removed from newProps and its
  // old value was undefined — oldProps[key] === newProps[key] === undefined).
  if (!anyChanged && !sameKeyCount) {
    anyChanged = true
  }

  if (!anyChanged) return NO_CHANGES
  return { anyChanged, layoutChanged, contentChanged }
}

// ============================================================================
// Legacy API — kept for external callers and tests
// ============================================================================

/**
 * Check if layout-affecting props changed.
 * @deprecated Use classifyPropChanges() for single-pass classification.
 */
export function layoutPropsChanged(oldProps: Record<string, unknown>, newProps: Record<string, unknown>): boolean {
  return classifyPropChanges(oldProps, newProps).layoutChanged
}

/**
 * Check if content-affecting props changed.
 * Returns "text" for text content changes (affect layout dimensions),
 * "style" for style-only changes (affect paint but not layout),
 * or false if nothing content-related changed.
 * @deprecated Use classifyPropChanges() for single-pass classification.
 */
export function contentPropsChanged(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
): "text" | "style" | false {
  return classifyPropChanges(oldProps, newProps).contentChanged
}

/**
 * Shallow compare two prop objects.
 * @deprecated Use classifyPropChanges() for single-pass classification.
 */
export function propsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return !classifyPropChanges(a, b).anyChanged
}
