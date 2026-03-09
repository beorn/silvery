/**
 * Core types for silvery-ui progress components
 */

/** Progress info passed to callbacks (legacy, use StepProgress for steps()) */
export interface ProgressInfo {
  phase?: string
  current: number
  total: number
  detail?: string
}

/**
 * Progress info yielded from step generators
 *
 * Yield with `label` to create/update a sub-step:
 * ```typescript
 * function* loadRepo() {
 *   yield { label: "Discovering files" };
 *   // ... do work ...
 *   yield { label: "Parsing markdown", current: 0, total: 100 };
 *   // ... do work ...
 *   yield { label: "Parsing markdown", current: 100, total: 100 };
 * }
 * ```
 */
export interface StepProgress {
  /** Display label for sub-step (changing label creates new sub-step) */
  label?: string
  /** Current progress count */
  current?: number
  /** Total count for progress display */
  total?: number
}

/** Callback signature for progress reporting */
export type ProgressCallback = (info: ProgressInfo) => void

/** Generator that yields progress info */
export type ProgressGenerator<T = void> = Generator<{ current: number; total: number }, T, unknown>

/** Spinner animation styles */
export type SpinnerStyle = "dots" | "line" | "arc" | "bounce" | "pulse"

/** Task status for multi-task display */
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped"

/** Options for Spinner class */
export interface SpinnerOptions {
  /** Initial text to display */
  text?: string
  /** Animation style */
  style?: SpinnerStyle
  /** Spinner color (chalk color name) */
  color?: string
  /** Output stream (default: process.stdout) */
  stream?: NodeJS.WriteStream
  /** Hide cursor during spinner (default: true) */
  hideCursor?: boolean
  /** Animation interval in ms (default: 80) */
  interval?: number
}

/** Options for ProgressBar class */
export interface ProgressBarOptions {
  /** Total value for progress calculation */
  total?: number
  /** Format string with placeholders: :bar :percent :current :total :eta :rate :phase */
  format?: string
  /** Width of the progress bar in characters (default: 40) */
  width?: number
  /** Character for completed portion (default: "█") */
  complete?: string
  /** Character for incomplete portion (default: "░") */
  incomplete?: string
  /** Show percentage (default: true) */
  showPercentage?: boolean
  /** Show ETA (default: true) */
  showETA?: boolean
  /** Output stream (default: process.stdout) */
  stream?: NodeJS.WriteStream
  /** Hide cursor during progress (default: true) */
  hideCursor?: boolean
  /** Phase names for multi-phase progress */
  phases?: Record<string, string>
}

/** Options for withSpinner wrapper */
export interface WithSpinnerOptions {
  /** Spinner style */
  style?: SpinnerStyle
  /** Clear the spinner output on completion */
  clearOnComplete?: boolean
  /** Color for the spinner */
  color?: string
}

/** Options for withProgress wrapper */
export interface WithProgressOptions {
  /** Map of phase keys to display names */
  phases?: Record<string, string>
  /** Format string for progress bar */
  format?: string
  /** Clear output on completion */
  clearOnComplete?: boolean
  /** Show initial loading message after this many ms (default: 1000). Set to 0 to show immediately. */
  showAfter?: number
  /** Initial loading message to show before progress starts (default: "Loading...") */
  initialMessage?: string
}

/** Task state for Tasks component */
export interface TaskState {
  id: string
  title: string
  status: TaskStatus
  progress?: { current: number; total: number }
  error?: Error
  children?: TaskState[]
}

/** Props for React Spinner component */
export interface SpinnerProps {
  /** Label text to display */
  label?: string
  /** Animation style */
  style?: SpinnerStyle
  /** Spinner color */
  color?: string
}

/** Props for React ProgressBar component */
export interface ProgressBarProps {
  /** Current value */
  value: number
  /** Total value */
  total: number
  /** Width in characters */
  width?: number
  /** Show percentage */
  showPercentage?: boolean
  /** Show ETA */
  showETA?: boolean
  /** Label text */
  label?: string
  /** Color for completed portion */
  color?: string
}

/** Props for React Task component */
export interface TaskProps {
  /** Task title */
  title: string
  /** Task status */
  status: TaskStatus
  /** Children (e.g., nested progress bar) */
  children?: React.ReactNode
}

/** Props for React TextInput component */
export interface TextInputProps {
  /** Current input value (controlled) */
  value: string
  /** Called when value changes */
  onChange: (value: string) => void
  /** Placeholder text when empty */
  placeholder?: string
  /** Mask character for password input (e.g., "*") */
  mask?: string
  /** Autocomplete suggestions */
  autocomplete?: string[]
  /** Called when autocomplete suggestion is selected */
  onAutocomplete?: (suggestion: string) => void
  /** Called when Enter is pressed */
  onSubmit?: (value: string) => void
  /** Cursor position (for rendering) */
  cursorPosition?: number
  /** Whether input is focused */
  focused?: boolean
}

/** Options for withTextInput CLI wrapper */
export interface TextInputOptions {
  /** Placeholder text shown when input is empty */
  placeholder?: string
  /** Mask character for password input (e.g., "*") */
  mask?: string
  /** Validation function - return error message or undefined if valid */
  validate?: (value: string) => string | undefined
  /** Autocomplete suggestions */
  autocomplete?: string[]
  /** Default value */
  defaultValue?: string
  /** Output stream (default: process.stdout) */
  stream?: NodeJS.WriteStream
  /** Input stream (default: process.stdin) */
  inputStream?: NodeJS.ReadStream
}

/** Column definition for Table component */
export interface TableColumn {
  /** Key in data objects to display */
  key: string
  /** Header text */
  header: string
  /** Fixed column width (auto-calculated from content if not specified) */
  width?: number
  /** Text alignment within the column */
  align?: "left" | "center" | "right"
}

/** Props for React Table component */
export interface TableProps {
  /** Column definitions */
  columns: TableColumn[]
  /** Data rows to display */
  data: Array<Record<string, unknown>>
  /** Show box borders around cells */
  border?: boolean
}

/** Option for Select component */
export interface SelectOption<T> {
  /** Display text for this option */
  label: string
  /** Value returned when selected */
  value: T
}

/** Props for React Select component */
export interface SelectProps<T> {
  /** Available options */
  options: SelectOption<T>[]
  /** Currently selected value */
  value?: T
  /** Called when selection changes */
  onChange?: (value: T) => void
  /** Maximum number of visible options (default: 10) */
  maxVisible?: number
  /** Controlled highlight index for keyboard navigation */
  highlightIndex?: number
  /** Called when highlight index changes */
  onHighlightChange?: (index: number) => void
}

/** Options for withSelect CLI wrapper */
export interface WithSelectOptions {
  /** Initial highlighted index (default: 0) */
  initial?: number
  /** Maximum number of visible options (default: 10) */
  maxVisible?: number
}
