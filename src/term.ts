// silvery/term — terminal-specific user-facing surface
//
// Companion subpath to the main `silvery` barrel. The main barrel already
// re-exports the commonly-needed terminal primitives (`Term`, `createTerm`,
// `TerminalProfile`, `TerminalCaps`, etc.). This module is for terminal-
// specific *additions* that consumers routinely reach for when they need
// to interact with mouse events, terminal capabilities, or the bound-term
// abstraction at a type level.
//
// Collisions between this surface and the top-level `silvery` exports are
// resolved in favor of the top-level barrel — import the widely-used types
// from `silvery` directly, and come here for the terminal-specific
// additions.
//
// DO NOT `export *` from `@silvery/ag-term` here — the ag-term barrel
// includes low-level pipeline/buffer/layout internals that should stay
// internal. Pick the user-facing surface deliberately.

// -----------------------------------------------------------------------------
// Mouse events (DOM-level synthetic events)
// -----------------------------------------------------------------------------
//
// `SilveryMouseEvent` / `SilveryWheelEvent` are the synthetic event objects
// dispatched to `onClick`, `onMouseDown`, `onMouseEnter`, `onWheel`, etc.
// Consumers that hand-roll mouse handlers on React refs type their callbacks
// with these.

export {
  hitTest,
  createMouseEvent,
  createWheelEvent,
  dispatchMouseEvent,
  processMouseEvent,
  createMouseEventProcessor,
  checkDoubleClick,
  createDoubleClickState,
  computeEnterLeave,
  type SilveryMouseEvent,
  type SilveryWheelEvent,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "@silvery/ag-term/mouse-events"

export type { MouseEventProps } from "@silvery/ag/mouse-event-types"

// -----------------------------------------------------------------------------
// Mouse parsing (SGR mode 1006 / X10 / any-event)
// -----------------------------------------------------------------------------

export { parseMouseSequence, isMouseSequence, type ParsedMouse } from "@silvery/ag-term/mouse"

// -----------------------------------------------------------------------------
// Term — terminal abstraction
// -----------------------------------------------------------------------------
//
// `Term` and `createTerm` are also exported from the main `silvery` barrel.
// Re-exported here for convenience so terminal-focused code can import from
// a single `silvery/term` module.

export { createTerm, term, createConsole } from "@silvery/ag-term/ansi"
export type {
  Term,
  StyleChain,
  ConsoleCaptureOptions,
  ConsoleStats,
  ConsoleEntry,
} from "@silvery/ag-term/ansi"

// `BoundTerm` — the app-bound term handle returned from `run()` / `render()`.
export type { BoundTerm } from "@silvery/ag-term/bound-term"

// -----------------------------------------------------------------------------
// Terminal capabilities & profile
// -----------------------------------------------------------------------------

export type { TerminalCaps } from "@silvery/ag-term/terminal-caps"
export {
  createTerminalProfile,
  probeTerminalProfile,
  defaultCaps,
  type TerminalProfile,
  type ColorProvenance,
  type ProbeTerminalProfileOptions,
  type CreateTerminalProfileOptions,
} from "@silvery/ansi"

// -----------------------------------------------------------------------------
// Hit registry (mouse dispatch internals useful to advanced consumers)
// -----------------------------------------------------------------------------

export type { HitTarget, HitRegion } from "@silvery/ag-term/hit-registry"
