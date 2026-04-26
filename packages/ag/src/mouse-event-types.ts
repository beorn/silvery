/**
 * Mouse Event Type Definitions
 *
 * Pure type interfaces for the silvery mouse event system.
 * These live in @silvery/ag because they're used by core prop types (BoxProps, TextProps).
 * The runtime mouse event processing lives in @silvery/ag-term/mouse-events.
 */

import type { AgNode } from "./types"

// ============================================================================
// Event Types
// ============================================================================

/**
 * Synthetic mouse event, mirroring React.MouseEvent / DOM MouseEvent.
 */
export interface SilveryMouseEvent {
  /** Terminal column (0-indexed) */
  clientX: number
  /** Terminal row (0-indexed) */
  clientY: number
  /** Mouse button: 0=left, 1=middle, 2=right */
  button: number
  /** Modifier keys */
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  /** Deepest node under cursor */
  target: AgNode
  /** Node whose handler is currently firing (changes during bubble) */
  currentTarget: AgNode
  /** Event type */
  type:
    | "click"
    | "dblclick"
    | "tripleclick"
    | "mousedown"
    | "mouseup"
    | "mousemove"
    | "mouseenter"
    | "mouseleave"
    | "wheel"
  /**
   * Click count for `click` / `dblclick` / `tripleclick` events
   * (mirrors DOM `MouseEvent.detail`).
   *
   * - 1 on a fresh click (`type === "click"`)
   * - 2 on a double-click (`type === "dblclick"`)
   * - 3 on a triple-click (`type === "tripleclick"`)
   * - undefined on non-click events
   */
  detail?: 1 | 2 | 3
  /** Stop event from bubbling to parent nodes */
  stopPropagation(): void
  /** Prevent default behavior */
  preventDefault(): void
  /** Whether stopPropagation() was called */
  readonly propagationStopped: boolean
  /** Whether preventDefault() was called */
  readonly defaultPrevented: boolean
  /** Raw parsed mouse data from terminal protocol */
  nativeEvent: unknown
}

/**
 * Synthetic wheel event, extending SilveryMouseEvent with scroll deltas.
 */
export interface SilveryWheelEvent extends SilveryMouseEvent {
  /** Vertical scroll: -1 (up) or +1 (down) */
  deltaY: number
  /** Horizontal scroll: always 0 for terminals */
  deltaX: number
}

// ============================================================================
// Mouse Event Handler Props (added to BoxProps/TextProps)
// ============================================================================

export interface MouseEventProps {
  onClick?: (event: SilveryMouseEvent) => void
  onDoubleClick?: (event: SilveryMouseEvent) => void
  /** Triple-click handler — fires after `onDoubleClick` when the user
   *  produces a third click within 300ms / 2 cells of the first two. */
  onTripleClick?: (event: SilveryMouseEvent) => void
  onMouseDown?: (event: SilveryMouseEvent) => void
  onMouseUp?: (event: SilveryMouseEvent) => void
  onMouseMove?: (event: SilveryMouseEvent) => void
  onMouseEnter?: (event: SilveryMouseEvent) => void
  onMouseLeave?: (event: SilveryMouseEvent) => void
  onWheel?: (event: SilveryWheelEvent) => void
}
