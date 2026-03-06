/**
 * inkx/components -- Rich UI components beyond Ink's built-in set.
 *
 * ```tsx
 * import { VirtualList, Table, SelectList, TextInput, Spinner } from '@hightea/term/components'
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Layout Components
// =============================================================================

export { VirtualList } from "./components/VirtualList.js"
export type { VirtualListProps, VirtualListHandle } from "./components/VirtualList.js"

export { HorizontalVirtualList } from "./components/HorizontalVirtualList.js"
export type { HorizontalVirtualListProps, HorizontalVirtualListHandle } from "./components/HorizontalVirtualList.js"

export { SplitView } from "./components/SplitView.js"
export type { SplitViewProps } from "./components/SplitView.js"
export type { LayoutNode as SplitLayoutNode } from "./pane-manager.js"
export {
  createLeaf,
  splitPane,
  removePane,
  getPaneIds,
  findAdjacentPane,
  resizeSplit,
  swapPanes,
  getTabOrder as getSplitTabOrder,
} from "./pane-manager.js"

export { Fill } from "./components/Fill.js"
export type { FillProps } from "./components/Fill.js"

export { Link } from "./components/Link.js"
export type { LinkProps } from "./components/Link.js"

export { ErrorBoundary } from "./components/ErrorBoundary.js"
export type { ErrorBoundaryProps } from "./components/ErrorBoundary.js"

export { Console } from "./components/Console.js"

// =============================================================================
// Input Components
// =============================================================================

export { TextInput } from "./components/TextInput.js"
export type { TextInputProps, TextInputHandle } from "./components/TextInput.js"

export { TextArea } from "./components/TextArea.js"
export type { TextAreaProps, TextAreaHandle, TextAreaSelection } from "./components/TextArea.js"

export { EditContextDisplay } from "./components/EditContextDisplay.js"
export type { EditContextDisplayProps } from "./components/EditContextDisplay.js"

// Display Components
export { CursorLine } from "./components/CursorLine.js"
export type { CursorLineProps } from "./components/CursorLine.js"

// Dialog Components
export { ModalDialog, formatTitleWithHotkey } from "./components/ModalDialog.js"
export type { ModalDialogProps } from "./components/ModalDialog.js"

export { PickerDialog } from "./components/PickerDialog.js"
export type { PickerDialogProps } from "./components/PickerDialog.js"

// Focusable Controls
export { Toggle } from "./components/Toggle.js"
export type { ToggleProps } from "./components/Toggle.js"

export { Button } from "./components/Button.js"
export type { ButtonProps } from "./components/Button.js"

export { useReadline } from "./components/useReadline.js"
export type { ReadlineState, UseReadlineOptions, UseReadlineResult } from "./components/useReadline.js"

// =============================================================================
// Widget Components
// =============================================================================

export { Spinner } from "./components/Spinner.js"
export type { SpinnerProps } from "./components/Spinner.js"

export { ProgressBar } from "./components/ProgressBar.js"
export type { ProgressBarProps } from "./components/ProgressBar.js"

export { SelectList } from "./components/SelectList.js"
export type { SelectListProps, SelectOption } from "./components/SelectList.js"

export { Table } from "./components/Table.js"
export type { TableProps, TableColumn } from "./components/Table.js"

export { Badge } from "./components/Badge.js"
export type { BadgeProps } from "./components/Badge.js"

export { Divider } from "./components/Divider.js"
export type { DividerProps } from "./components/Divider.js"

// =============================================================================
// Position Registry (2D Grid Virtualization)
// =============================================================================

export { PositionRegistryProvider, usePositionRegistry, createPositionRegistry } from "./hooks/usePositionRegistry.js"
export type { PositionRegistry, ScreenRect } from "./hooks/usePositionRegistry.js"
export { useGridPosition } from "./hooks/useGridPosition.js"
export { GridCell } from "./components/GridCell.js"
export type { GridCellProps } from "./components/GridCell.js"

// =============================================================================
// Scroll Utilities
// =============================================================================

export { calcEdgeBasedScrollOffset } from "./scroll-utils.js"

export {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "./scroll-region.js"
export type { ScrollRegionConfig } from "./scroll-region.js"
