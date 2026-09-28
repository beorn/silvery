/**
 * Layout Type Abstractions
 *
 * Pure type interfaces for layout engines (Yoga, Flexily, etc.)
 * These live in @silvery/ag because they're used by core types (AgNode).
 * The runtime layout engine management lives in @silvery/ag-term/layout-engine.
 */

// ============================================================================
// Measure Function Types
// ============================================================================

/**
 * Measure mode determines how the width/height constraint should be interpreted.
 *
 * - "undefined": no constraint — return max-content (natural unconstrained size).
 * - "at-most":   constrain to at most `width`/`height`. Used for Yoga/CSS
 *                shrink-wrap and for cross-axis sizing in column/row layouts.
 * - "exactly":   exactly `width`/`height` — used when a definite size has
 *                been resolved.
 * - "min-content": flexily-only extension. Asks the measurer for its
 *                CSS min-content size — longest unbreakable token for
 *                wrappable text, naturalWidth for non-wrappable. Used by
 *                CSS §4.5 auto-min-size derivation. Measurers that don't
 *                recognize this mode should treat it as "at-most" with
 *                width/height = 0 (the conservative fallback).
 */
export type MeasureMode = "undefined" | "exactly" | "at-most" | "min-content"

/**
 * Measure function callback for intrinsic sizing.
 * Called when a node needs to determine its size based on content.
 */
export type MeasureFunc = (
  width: number,
  widthMode: MeasureMode,
  height: number,
  heightMode: MeasureMode,
) => { width: number; height: number }

// ============================================================================
// Fit-Width Lane Type (A0.2)
// ============================================================================

/**
 * A fit-width lane entry: either a plain number (cells, treated as CSS points)
 * or a `{ value, unit }` object for container-query units.
 *
 * String values (`"100cqi"`) are parsed at the React seam (`applyBoxProps`)
 * into this shape before reaching the LayoutNode adapter; the adapter itself
 * receives only the parsed form.
 */
export type FitWidthLane = number | { value: number; unit: "cqi" | "cqmin" }

// ============================================================================
// Layout Node Interface
// ============================================================================

/**
 * Abstract layout node interface.
 * Represents a single node in the layout tree.
 */
export interface LayoutNode {
  // Tree operations
  insertChild(child: LayoutNode, index: number): void
  removeChild(child: LayoutNode): void
  free(): void

  // Measure function
  setMeasureFunc(measureFunc: MeasureFunc): void

  // Dirty tracking
  markDirty(): void
  isDirty(): boolean

  // Dimension setters
  setWidth(value: number | string): void
  setWidthPercent(value: number): void
  setWidthAuto(): void
  setWidthFitContent(): void
  setWidthSnugContent(): void
  setHeight(value: number | string): void
  setHeightPercent(value: number): void
  setHeightAuto(): void
  setMinWidth(value: number | string): void
  setMinWidthPercent(value: number): void
  setMinHeight(value: number | string): void
  setMinHeightPercent(value: number): void
  setMaxWidth(value: number | string): void
  setMaxWidthPercent(value: number): void
  setMaxHeight(value: number | string): void
  setMaxHeightPercent(value: number): void

  // Flex properties
  setFlexGrow(value: number): void
  setFlexShrink(value: number): void
  setFlexBasis(value: number | string): void
  setFlexBasisPercent(value: number): void
  setFlexBasisAuto(): void
  setFlexDirection(direction: number): void
  setFlexWrap(wrap: number): void

  // Alignment
  setAlignItems(align: number): void
  setAlignSelf(align: number): void
  setAlignContent(align: number): void
  setJustifyContent(justify: number): void

  // Spacing
  setPadding(edge: number, value: number): void
  setMargin(edge: number, value: number): void
  /** CSS `margin: auto` — absorbs positive free space, resolves to 0 when negative. */
  setMarginAuto(edge: number): void
  setBorder(edge: number, value: number): void
  setGap(gutter: number, value: number): void

  // Display & Position
  setDisplay(display: number): void
  setPositionType(positionType: number): void
  setPosition(edge: number, value: number): void
  setPositionPercent(edge: number, value: number): void
  setOverflow(overflow: number): void

  // Aspect Ratio
  setAspectRatio(value: number): void

  // Container queries (A0.1) — only implemented by adapters that advertise the
  // `containerQueries` / `containSize` capabilities (flexily today; yoga never).
  // Adapters without the capability MUST implement these as no-ops; the
  // user-facing throw fires at the React layer via `requireCapability` before
  // these methods are called in production. Defining the methods on the
  // interface keeps consumers branch-free.
  /** CSS container-type. Maps to flexily's CONTAINER_TYPE_NORMAL | CONTAINER_TYPE_INLINE_SIZE. */
  setContainerType(containerType: number): void
  /** CSS contain: size. True = block intrinsic propagation on the inline axis. */
  setContainSize(value: boolean): void

  /**
   * Fit-width lanes (A0.2). Single-pass lane snap; consumes children's
   * max-content and picks the smallest lane that fits (else last). Each
   * entry is either a plain number (cells) or a `{ value, unit }` object
   * for cqi/cqmin entries. Pass `undefined` to disable.
   *
   * Engine requirement: this maps to flexily's `setFitWidth` directly.
   * Adapters without the capability MUST implement as a no-op; the user-facing
   * throw fires at the React layer via `requireCapability("fitWidth", ...)`.
   */
  setFitWidth(lanes: readonly FitWidthLane[] | undefined): void

  // Layout calculation
  calculateLayout(width: number, height: number, direction?: number): void

  // Layout results
  getComputedLeft(): number
  getComputedTop(): number
  getComputedWidth(): number
  getComputedHeight(): number
}
