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
    | "mousedown"
    | "mouseup"
    | "mousemove"
    | "mouseenter"
    | "mouseleave"
    | "wheel"
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
  onMouseDown?: (event: SilveryMouseEvent) => void
  onMouseUp?: (event: SilveryMouseEvent) => void
  onMouseMove?: (event: SilveryMouseEvent) => void
  onMouseEnter?: (event: SilveryMouseEvent) => void
  onMouseLeave?: (event: SilveryMouseEvent) => void
  onWheel?: (event: SilveryWheelEvent) => void
}
