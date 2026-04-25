/**
 * silvery/components -- Rich UI components beyond Ink's built-in set.
 *
 * ```tsx
 * import { ListView, Table, SelectList, TextInput, Spinner } from './components'
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Layout Components
// =============================================================================

export { ListView } from "./components/ListView"
export type {
  ListViewProps,
  ListViewHandle,
  ListItemMeta,
  ListViewCacheConfig,
  ListViewSearchConfig,
} from "./components/ListView"

export { HorizontalVirtualList } from "./components/HorizontalVirtualList"
export type {
  HorizontalVirtualListProps,
  HorizontalVirtualListHandle,
} from "./components/HorizontalVirtualList"

export { SplitView } from "./components/SplitView"
export type { SplitViewProps } from "./components/SplitView"
export type { LayoutNode as SplitLayoutNode } from "@silvery/ag-term/pane-manager"
export {
  createLeaf,
  splitPane,
  removePane,
  getPaneIds,
  findAdjacentPane,
  resizeSplit,
  swapPanes,
  getTabOrder as getSplitTabOrder,
} from "@silvery/ag-term/pane-manager"

export { Fill } from "../components/Fill"
export type { FillProps } from "../components/Fill"

export { Link } from "../components/Link"
export type { LinkProps } from "../components/Link"

export { ErrorBoundary } from "./components/ErrorBoundary"
export type { ErrorBoundaryProps } from "./components/ErrorBoundary"

export { Console } from "./components/Console"
export type { ConsoleProps } from "./components/Console"

// Viewport Architecture (Phase 2)
export { Screen } from "./components/Screen"
export type { ScreenProps } from "./components/Screen"

// =============================================================================
// Input Components
// =============================================================================

export { TextInput } from "./components/TextInput"
export type { TextInputProps, TextInputHandle } from "./components/TextInput"

export { TextArea } from "./components/TextArea"
export type { TextAreaProps, TextAreaHandle, TextAreaSelection } from "./components/TextArea"

export { useTextArea, clampScroll } from "./components/useTextArea"
export type { UseTextAreaOptions, UseTextAreaResult } from "./components/useTextArea"

export { EditContextDisplay } from "./components/EditContextDisplay"
export type { EditContextDisplayProps } from "./components/EditContextDisplay"

// Display Components
export { CursorLine } from "./components/CursorLine"
export type { CursorLineProps } from "./components/CursorLine"

// Dialog Components
export { ModalDialog, formatTitleWithHotkey } from "./components/ModalDialog"
export type { ModalDialogProps } from "./components/ModalDialog"

export { Backdrop } from "./components/Backdrop"
export type { BackdropProps } from "./components/Backdrop"

export { PickerDialog } from "./components/PickerDialog"
export type { PickerDialogProps } from "./components/PickerDialog"

export { PickerList } from "./components/PickerList"
export type { PickerListProps } from "./components/PickerList"

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

export { SearchBar } from "./components/SearchBar"
export { Spinner } from "./components/Spinner"
export type { SpinnerProps } from "./components/Spinner"

export { ProgressBar } from "./components/ProgressBar"
export type { ProgressBarProps } from "./components/ProgressBar"

export { SelectList } from "./components/SelectList"
export type { SelectListProps, SelectOption } from "./components/SelectList"

export { Table } from "../components/Table"
export type { TableProps, Column as TableColumn } from "../components/Table"

export { Badge } from "./components/Badge"
export type { BadgeProps } from "./components/Badge"

export { Divider } from "./components/Divider"
export type { DividerProps } from "./components/Divider"

// Typography Presets
export {
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  P,
  Lead,
  Muted,
  Small,
  Strong,
  Em,
  Code,
  Kbd,
  Blockquote,
  CodeBlock,
  HR,
  UL,
  OL,
  LI,
} from "./components/Typography"
export type { TypographyProps } from "./components/Typography"

// Prose — text-wrapping container primitive (encapsulates flexShrink + minWidth chain)
export { Prose } from "./components/Prose"
export type { ProseProps, ProseHandle } from "./components/Prose"

// Heading (OSC 66 text sizing)
export { Heading } from "./components/Heading"
export type { HeadingProps, HeadingLevel } from "./components/Heading"

// Form Components
export { Form, FormField } from "./components/Form"
export type { FormProps, FormFieldProps } from "./components/Form"

// Toast / Notification
export { useToast, ToastContainer, ToastItem } from "./components/Toast"
export type {
  ToastData,
  ToastOptions,
  ToastVariant,
  UseToastResult,
  ToastContainerProps,
  ToastItemProps,
} from "./components/Toast"

// Alert family — InlineAlert (low), Banner (medium), Alert (high)
// Urgency is component choice, not a priority prop — see Sterling design-system.md
// §"Urgency is not a design-system concern".
export { InlineAlert } from "./components/InlineAlert"
export type { InlineAlertProps } from "./components/InlineAlert"

export { Banner } from "./components/Banner"
export type { BannerProps } from "./components/Banner"

export { Alert } from "./components/Alert"
export type {
  AlertProps,
  AlertTitleProps,
  AlertBodyProps,
  AlertActionsProps,
} from "./components/Alert"

// Shared variant surface — Variant union and resolver helpers (renamed from
// `tone` 2026-04-25). Old `tone*` aliases remain available for one cycle.
export {
  variantFillTokens,
  variantSubtleTokens,
  variantFgToken,
  variantIcon,
  VARIANT_ICONS,
  // Deprecated aliases (one-cycle compatibility):
  toneFillTokens,
  toneSubtleTokens,
  toneFgToken,
  toneIcon,
  TONE_ICONS,
} from "./components/_variant"
export type {
  Variant,
  VariantFillTokens,
  VariantSubtleTokens,
  // Deprecated aliases:
  ToneKey,
  ToneFillTokens,
  ToneSubtleTokens,
} from "./components/_variant"

// Command Palette
export { CommandPalette } from "./components/CommandPalette"
export type { CommandPaletteProps, CommandItem } from "./components/CommandPalette"

// Tree View
export { TreeView } from "./components/TreeView"
export type { TreeViewProps, TreeNode } from "./components/TreeView"

// Breadcrumb
export { Breadcrumb } from "./components/Breadcrumb"
export type { BreadcrumbProps, BreadcrumbItem } from "./components/Breadcrumb"

// Tabs
export { Tabs, TabList, Tab, TabPanel } from "./components/Tabs"
export type { TabsProps, TabListProps, TabProps, TabPanelProps } from "./components/Tabs"

// Tooltip
export { Tooltip } from "./components/Tooltip"
export type { TooltipProps } from "./components/Tooltip"

// Skeleton
export { Skeleton } from "./components/Skeleton"
export type { SkeletonProps } from "./components/Skeleton"

// =============================================================================
// Position Registry (2D Grid Virtualization)
// =============================================================================

export {
  PositionRegistryProvider,
  usePositionRegistry,
  createPositionRegistry,
} from "../hooks/usePositionRegistry"
export type { PositionRegistry, ScrollRect } from "../hooks/usePositionRegistry"
export { useGridPosition } from "../hooks/useGridPosition"
export { GridCell } from "./components/GridCell"
export type { GridCellProps } from "./components/GridCell"

// =============================================================================
// Scroll Utilities
// =============================================================================

export { calcEdgeBasedScrollOffset } from "@silvery/ag-term/scroll-utils"

export {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "@silvery/ag-term/scroll-region"
export type { ScrollRegionConfig } from "@silvery/ag-term/scroll-region"
