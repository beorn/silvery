/**
 * silvery/components -- Rich UI components beyond Ink's built-in set.
 *
 * ```tsx
 * import { VirtualList, Table, SelectList, TextInput, Spinner } from '@silvery/ui/components'
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Layout Components
// =============================================================================

export { VirtualList } from "./components/VirtualList"
export type { VirtualListProps, VirtualListHandle } from "./components/VirtualList"

export { HorizontalVirtualList } from "./components/HorizontalVirtualList"
export type { HorizontalVirtualListProps, HorizontalVirtualListHandle } from "./components/HorizontalVirtualList"

export { SplitView } from "./components/SplitView"
export type { SplitViewProps } from "./components/SplitView"
export type { LayoutNode as SplitLayoutNode } from "@silvery/term/pane-manager"
export {
  createLeaf,
  splitPane,
  removePane,
  getPaneIds,
  findAdjacentPane,
  resizeSplit,
  swapPanes,
  getTabOrder as getSplitTabOrder,
} from "@silvery/term/pane-manager"

export { Fill } from "@silvery/react/components/Fill"
export type { FillProps } from "@silvery/react/components/Fill"

export { Link } from "@silvery/react/components/Link"
export type { LinkProps } from "@silvery/react/components/Link"

export { ErrorBoundary } from "./components/ErrorBoundary"
export type { ErrorBoundaryProps } from "./components/ErrorBoundary"

export { Console } from "./components/Console"

// =============================================================================
// Input Components
// =============================================================================

export { TextInput } from "./components/TextInput"
export type { TextInputProps, TextInputHandle } from "./components/TextInput"

export { TextArea } from "./components/TextArea"
export type { TextAreaProps, TextAreaHandle, TextAreaSelection } from "./components/TextArea"

export { EditContextDisplay } from "./components/EditContextDisplay"
export type { EditContextDisplayProps } from "./components/EditContextDisplay"

// Display Components
export { CursorLine } from "./components/CursorLine"
export type { CursorLineProps } from "./components/CursorLine"

// Dialog Components
export { ModalDialog, formatTitleWithHotkey } from "./components/ModalDialog"
export type { ModalDialogProps } from "./components/ModalDialog"

export { PickerDialog } from "./components/PickerDialog"
export type { PickerDialogProps } from "./components/PickerDialog"

// Focusable Controls
export { Toggle } from "./components/Toggle"
export type { ToggleProps } from "./components/Toggle"

export { Button } from "./components/Button"
export type { ButtonProps } from "./components/Button"

export { useReadline } from "./components/useReadline"
export type { ReadlineState, UseReadlineOptions, UseReadlineResult } from "./components/useReadline"

// =============================================================================
// Widget Components
// =============================================================================

export { Spinner } from "./components/Spinner"
export type { SpinnerProps } from "./components/Spinner"

export { ProgressBar } from "./components/ProgressBar"
export type { ProgressBarProps } from "./components/ProgressBar"

export { SelectList } from "./components/SelectList"
export type { SelectListProps, SelectOption } from "./components/SelectList"

export { Table } from "./components/Table"
export type { TableProps, TableColumn } from "./components/Table"

export { Badge } from "./components/Badge"
export type { BadgeProps } from "./components/Badge"

export { Divider } from "./components/Divider"
export type { DividerProps } from "./components/Divider"

// =============================================================================
// Position Registry (2D Grid Virtualization)
// =============================================================================

export {
  PositionRegistryProvider,
  usePositionRegistry,
  createPositionRegistry,
} from "@silvery/react/hooks/usePositionRegistry"
export type { PositionRegistry, ScreenRect } from "@silvery/react/hooks/usePositionRegistry"
export { useGridPosition } from "@silvery/react/hooks/useGridPosition"
export { GridCell } from "./components/GridCell"
export type { GridCellProps } from "./components/GridCell"

// =============================================================================
// Scroll Utilities
// =============================================================================

export { calcEdgeBasedScrollOffset } from "@silvery/term/scroll-utils"

export {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "@silvery/term/scroll-region"
export type { ScrollRegionConfig } from "@silvery/term/scroll-region"
