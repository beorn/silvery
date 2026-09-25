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

export { MeasuredBox } from "./components/MeasuredBox"
export type {
  MeasuredBoxProps,
  MeasuredBoxRect,
  MeasuredBoxRenderFn,
} from "./components/MeasuredBox"

export { Scrollbar } from "./components/Scrollbar"
export type { ScrollbarProps } from "./components/Scrollbar"
export { ScrollArea } from "./components/ScrollArea"
export { useScrollController } from "./components/ScrollArea"
export type { ScrollAreaProps, ScrollController } from "./components/ScrollArea"

export { ListView } from "./components/ListView"
export type {
  ListViewProps,
  ListViewHandle,
  ListItemMeta,
  ListViewCacheConfig,
  ListViewSearchConfig,
  TailReserveRows,
} from "./components/ListView"

export { HorizontalVirtualList } from "./components/HorizontalVirtualList"
export type {
  HorizontalVirtualListProps,
  HorizontalVirtualListHandle,
} from "./components/HorizontalVirtualList"

export { SplitView } from "./components/SplitView"
export type { SplitViewProps } from "./components/SplitView"
export {
  SplitPane,
  clampSplitPaneRatio,
  splitPaneRatioAfterDrag,
  resolveSplitPaneLayout,
} from "./components/SplitPane"
export type {
  ResolveSplitPaneLayoutOptions,
  SplitPaneDirection,
  SplitPaneDragOptions,
  SplitPaneLayout,
  SplitPaneNaturalSize,
  SplitPaneProps,
  SplitPaneRatioOptions,
} from "./components/SplitPane"
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

export { SyntaxHighlighter } from "./components/SyntaxHighlighter"
export type { SyntaxHighlighterProps } from "./components/SyntaxHighlighter"

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

export { ShortcutHelpDialog } from "./components/ShortcutHelpDialog"
export type {
  ShortcutHelpDialogProps,
  ShortcutHelpRow,
  ShortcutHelpSection,
} from "./components/ShortcutHelpDialog"

export { ModalOverlay } from "./components/ModalOverlay"
export type { ModalOverlayProps } from "./components/ModalOverlay"

export { Backdrop } from "./components/Backdrop"
export type { BackdropProps } from "./components/Backdrop"

export { PickerDialog } from "./components/PickerDialog"
export type { PickerDialogProps } from "./components/PickerDialog"

export { PickerList } from "./components/PickerList"
export type { PickerListProps } from "./components/PickerList"

// Focusable Controls
export { Toggle } from "./components/Toggle"
export type { ToggleProps } from "./components/Toggle"
export { TogglePill, TogglePillGroup, togglePillColor } from "./components/TogglePill"
export type { TogglePillProps, TogglePillGroupProps } from "./components/TogglePill"

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

export {
  Meter,
  fitSegmentLabel,
  leadingUnitLabelCandidates,
  meterFilledCells,
} from "./components/Meter"
export type {
  FitSegmentLabelOptions,
  MeterLabelColors,
  MeterOverlay,
  MeterProps,
  SegmentLabelFit,
  SegmentLabelRegion,
} from "./components/Meter"

export { Pulse, usePulse, useSynchronizedPhase } from "./components/Pulse"
export type { PulseProps, UsePulseOptions, UseSynchronizedPhaseOptions } from "./components/Pulse"

export { SelectList } from "./components/SelectList"
export type { SelectListProps, SelectOption } from "./components/SelectList"

export { Table } from "../components/Table"
export type {
  TableProps,
  Column as TableColumn,
  MeasuredContent as TableMeasuredContent,
} from "../components/Table"
export {
  contentNode as tableContentNode,
  contentText as tableContentText,
} from "../components/Table"

export { Badge } from "./components/Badge"
export type { BadgeProps } from "./components/Badge"

export { Divider } from "./components/Divider"
export type { DividerProps } from "./components/Divider"

export { PaneDivider } from "./components/PaneDivider"
export type {
  PaneDividerOrientation,
  PaneDividerProps,
  PaneDividerResizeStartEvent,
} from "./components/PaneDivider"

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
  DecoratedRegion,
  Blockquote,
  CodeBlock,
  HR,
  UL,
  OL,
  LI,
} from "./components/Typography"
export type { CodeBlockProps, DecoratedRegionProps, TypographyProps } from "./components/Typography"

export { formatNounId, NounId } from "./components/NounId"
export type { NounIdProps, NounIdValue } from "./components/NounId"

// Prose — text-wrapping container primitive (encapsulates flexShrink + minWidth chain)
export { Prose } from "./components/Prose"
export type { ProseProps, ProseHandle } from "./components/Prose"

// Content — shared semantic layout lanes (prose/wide/full/auto)
export {
  Content,
  MeasuredPaneScope,
  PaneSize,
  useContentLayout,
  useContentRowWidth,
  useHasContentLayout,
  useResponsiveContent,
} from "./components/Content"
export type {
  ContentBodyProps,
  ContentBodyWidth,
  ContentLayoutContextValue,
  ContentResponsive,
  ContentWidthValue,
} from "./components/Content"

// DocumentView — store-neutral semantic document presentation.
export { DocumentView } from "./components/DocumentView"
export type {
  DocumentBlock,
  DocumentBlockId,
  DocumentCodeBlock,
  DocumentExtensionBlock,
  DocumentHeadingBlock,
  DocumentLane,
  DocumentListItem,
  DocumentListItemBlock,
  DocumentMediaBlock,
  DocumentParagraphBlock,
  DocumentQuoteBlock,
  DocumentRuleBlock,
  DocumentTableBlock,
  DocumentTableCell,
  DocumentViewSearchConfig,
  DocumentViewProps,
} from "./components/DocumentView"

// MarkdownView — minimal Markdown → Silvery renderer (headings, emphasis, code,
// lists, blockquotes, HR; paragraph hard-wrap reflow). Maps onto Typography
// presets + semantic tokens.
export { MarkdownView } from "./components/MarkdownView"
export type { MarkdownViewProps } from "./components/MarkdownView"

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

// Shared variant surface — Variant union and resolver helpers.
export {
  variantFillTokens,
  variantSubtleTokens,
  variantFgToken,
  variantIcon,
  VARIANT_ICONS,
} from "./components/_variant"
export type { Variant, VariantFillTokens, VariantSubtleTokens } from "./components/_variant"

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
export type {
  TabsProps,
  TabListProps,
  TabProps,
  TabPanelProps,
  TabsVariant,
} from "./components/Tabs"

// Tooltip
export { Tooltip } from "./components/Tooltip"
export type { TooltipProps } from "./components/Tooltip"
export { AnchoredOverlay } from "./components/AnchoredOverlay"
export type { AnchoredOverlayProps, AnchoredOverlayRect } from "./components/AnchoredOverlay"

// Skeleton
export { Skeleton } from "./components/Skeleton"
export type { SkeletonProps } from "./components/Skeleton"

// Accordion / Collapsible
export { Accordion } from "./components/Accordion"
export type { AccordionProps } from "./components/Accordion"

// LineNumber gutter primitive
export { LineNumber } from "./components/LineNumber"
export type { LineNumberProps } from "./components/LineNumber"

// Diff renderer (unified / side-by-side; v0 — no syntax highlighting,
// follow-up via Code + tree-sitter)
export { Diff } from "./components/Diff"
export type { DiffProps, DiffHunk, DiffLine, DiffMode } from "./components/Diff"

// Animation primitives (built on useAnimation)
export { AnimatedNumber } from "./components/AnimatedNumber"
export type { AnimatedNumberProps } from "./components/AnimatedNumber"
export { TextShimmer } from "./components/TextShimmer"
export type { TextShimmerProps } from "./components/TextShimmer"
export {
  GlimmerText,
  GLIMMER_PERIOD_MS,
  GLIMMER_REFERENCE_COLUMNS,
  GLIMMER_SPAN,
  glimmerCycleLength,
  glimmerPeriod,
  isGlimmerCell,
} from "./components/GlimmerText"
export type { GlimmerTextProps } from "./components/GlimmerText"
export { TextReveal } from "./components/TextReveal"
export type { TextRevealProps } from "./components/TextReveal"
export { TimeToFirstDraw } from "./components/TimeToFirstDraw"
export type { TimeToFirstDrawProps } from "./components/TimeToFirstDraw"

// RadioGroup — mutually-exclusive option group
export { RadioGroup } from "./components/RadioGroup"
export type { RadioGroupProps, RadioGroupOption } from "./components/RadioGroup"

// Aliases for ACP-aligned naming. Identical components today; future
// variants may diverge if the call site needs distinct semantics.
export { Badge as Tag } from "./components/Badge"
export type { BadgeProps as TagProps } from "./components/Badge"
export { Toggle as Switch } from "./components/Toggle"
export type { ToggleProps as SwitchProps } from "./components/Toggle"

// Terminal — render a headless terminal's grid inside a silvery layout.
// Backend-agnostic (duck-typed TerminalReadable). Pairs with
// `render({ input: false })` so a host process can pipe its own stdin to
// a child PTY while silvery renders visuals around the child's grid.
// See `docs/design/terminal-component.md`.
export { Terminal, encodeTerminalRow } from "./components/Terminal"
export type {
  TerminalProps,
  TerminalReadable,
  TerminalCell,
  TerminalCursor,
  TerminalRGB,
  TerminalMouseEvent,
} from "./components/Terminal"

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
