/**
 * Inkx Components
 *
 * Public component exports for the Inkx library.
 */

// Layout
export { Box } from "./Box.js"
export type { BoxProps, BoxHandle } from "./Box.js"

// Text
export { Text } from "./Text.js"
export type { TextProps, TextHandle } from "./Text.js"

// Error Handling
export { ErrorBoundary } from "./ErrorBoundary.js"
export type { ErrorBoundaryProps } from "./ErrorBoundary.js"

// Transform
export { Transform } from "./Transform.js"
export type { TransformProps } from "./Transform.js"

// Utilities
export { Fill } from "./Fill.js"
export type { FillProps } from "./Fill.js"
export { Newline } from "./Newline.js"
export { Spacer } from "./Spacer.js"
export { Static } from "./Static.js"

// Input Components
export { TextInput } from "./TextInput.js"
export type { TextInputProps, TextInputHandle } from "./TextInput.js"

export { TextArea } from "./TextArea.js"
export type { TextAreaProps, TextAreaHandle } from "./TextArea.js"

// Display Components
export { CursorLine } from "./CursorLine.js"
export type { CursorLineProps } from "./CursorLine.js"

export { EditContextDisplay } from "./EditContextDisplay.js"
export type { EditContextDisplayProps } from "./EditContextDisplay.js"

// Dialog Components
export { ModalDialog, formatTitleWithHotkey } from "./ModalDialog.js"
export type { ModalDialogProps } from "./ModalDialog.js"

export { PickerDialog } from "./PickerDialog.js"
export type { PickerDialogProps } from "./PickerDialog.js"

export { PickerList } from "./PickerList.js"
export type { PickerListProps } from "./PickerList.js"

// Focusable Controls
export { Toggle } from "./Toggle.js"
export type { ToggleProps } from "./Toggle.js"

export { Button } from "./Button.js"
export type { ButtonProps } from "./Button.js"

// Input Hooks
export { useReadline } from "./useReadline.js"
export type { ReadlineState, UseReadlineOptions, UseReadlineResult } from "./useReadline.js"

// Readline Operations (shared utilities)
export {
  killRing,
  addToKillRing,
  findPrevWordStart,
  findNextWordEnd,
  MAX_KILL_RING_SIZE,
  handleReadlineKey,
} from "../hooks/readline-ops.js"
export type { YankState, ReadlineKeyResult } from "../hooks/readline-ops.js"

// Image
export { Image } from "../image/Image.js"
export type { ImageProps } from "../image/Image.js"

// Widgets
export { Spinner } from "./Spinner.js"
export type { SpinnerProps } from "./Spinner.js"

export { ProgressBar } from "./ProgressBar.js"
export type { ProgressBarProps } from "./ProgressBar.js"

export { SelectList } from "./SelectList.js"
export type { SelectListProps, SelectOption } from "./SelectList.js"

export { Table } from "./Table.js"
export type { TableProps, TableColumn } from "./Table.js"

export { Badge } from "./Badge.js"
export type { BadgeProps } from "./Badge.js"

export { Divider } from "./Divider.js"
export type { DividerProps } from "./Divider.js"

// Form Components
export { Form, FormField } from "./Form.js"
export type { FormProps, FormFieldProps } from "./Form.js"

// Toast / Notification
export { useToast, ToastContainer, ToastItem } from "./Toast.js"
export type {
  ToastData,
  ToastOptions,
  ToastVariant,
  UseToastResult,
  ToastContainerProps,
  ToastItemProps,
} from "./Toast.js"

// Command Palette
export { CommandPalette } from "./CommandPalette.js"
export type { CommandPaletteProps, CommandItem } from "./CommandPalette.js"

// Tree View
export { TreeView } from "./TreeView.js"
export type { TreeViewProps, TreeNode } from "./TreeView.js"

// Breadcrumb
export { Breadcrumb } from "./Breadcrumb.js"
export type { BreadcrumbProps, BreadcrumbItem } from "./Breadcrumb.js"

// Tabs
export { Tabs, TabList, Tab, TabPanel } from "./Tabs.js"
export type { TabsProps, TabListProps, TabProps, TabPanelProps } from "./Tabs.js"

// Tooltip
export { Tooltip } from "./Tooltip.js"
export type { TooltipProps } from "./Tooltip.js"

// Skeleton
export { Skeleton } from "./Skeleton.js"
export type { SkeletonProps } from "./Skeleton.js"
