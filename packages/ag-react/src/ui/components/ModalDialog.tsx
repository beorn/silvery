/**
 * ModalDialog Component
 *
 * Reusable modal dialog with consistent styling: raised background, title bar,
 * optional footer, and solid background that covers board content.
 *
 * Moved from km-tui shared-components to silvery for reuse across apps.
 *
 * Usage:
 * ```tsx
 * <ModalDialog title="Settings" width={60} footer="ESC to close">
 *   <Text>Dialog content here</Text>
 * </ModalDialog>
 *
 * <ModalDialog title="Help" hotkey="?" titleRight={<Text>1/3</Text>}>
 *   <Text>Help content</Text>
 * </ModalDialog>
 * ```
 */
import React from "react"
import { Box, type BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { useTheme } from "../../ThemeContext"

// =============================================================================
// Types
// =============================================================================

export interface ModalDialogProps extends Omit<BoxProps, "children" | "flexDirection"> {
  /** Border color (default: $border-default). Accent is reserved for text input focus rings. */
  borderColor?: string
  /** Dialog title (rendered bold in titleColor or borderColor) */
  title?: string
  /** Title color override (default: $fg-accent). Separate from border for independent styling. */
  titleColor?: string
  /** Title alignment (default: center) */
  titleAlign?: "center" | "flex-start" | "flex-end"
  /** Toggle hotkey character (e.g., "?" for help). Reserved for callers; not rendered in the title. */
  hotkey?: string
  /** Content to render on the right side of the title bar (e.g., hotkey indicator, match count) */
  titleRight?: React.ReactNode
  /** Dialog width. Defaults to "snug-content" (tightest fit around content). */
  width?: number | string
  /** Dialog height (optional, omit for auto-height) */
  height?: number
  /** Footer hint text (rendered dimColor at bottom) */
  footer?: React.ReactNode
  /** Footer alignment (default: center) */
  footerAlign?: "center" | "flex-start" | "flex-end"
  /** Called when ESC is pressed (optional convenience handler) */
  onClose?: () => void
  /** Whether to create a focus scope (default: true, for future focus system integration) */
  focusScope?: boolean
  /**
   * Backdrop fade amount — fades everything OUTSIDE this dialog's rect, making
   * the modal's content stand out visually. Range [0, 1]. Default: 0.25.
   *
   * Calibrated against real-world scrim conventions:
   *   - macOS sheet backdrop ≈ 0.20
   *   - iOS action-sheet scrim ≈ 0.40
   *   - Material 3 scrim = 0.32
   *
   * 0.25 lands in the middle — the backdrop is visibly dimmed but the UI
   * behind stays readable. An earlier default of 0.7 drowned the scene
   * because the asymmetric blend math used uniform amounts for fg/bg; with
   * the asymmetric path removed (see `pipeline/backdrop/`), 0.7 is now truly
   * too strong. Apps that want a heavier dim can opt in with `fade={0.4}`.
   *
   * Applied at render time via a cell-level color transform (see
   * `@silvery/ag-term/pipeline/backdrop`). Set `fade={0}` to disable.
   */
  fade?: number
  /** Dialog children */
  children: React.ReactNode
}

const DEFAULT_FADE = 0.25

function themeToken(theme: unknown, key: string): string | undefined {
  const value = (theme as Record<string, unknown>)[key]
  return typeof value === "string" ? value : undefined
}

function raisedSurfaceBackground(theme: unknown): string {
  return (
    themeToken(theme, "bg-surface-raised") ||
    themeToken(theme, "bg-surface-overlay") ||
    themeToken(theme, "bg-muted") ||
    "blackBright"
  )
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a dialog title with a hotkey prefix.
 *
 * If the hotkey letter appears in the title (case-insensitive), highlights it inline:
 *   hotkey="D", title="Details" -> [D]etails
 * If the hotkey is not found in the title, prepends it:
 *   hotkey="?", title="Help" -> [?] Help
 *
 * Brackets are dim, the hotkey letter is bold/bright.
 */
export function formatTitleWithHotkey(
  title: string,
  hotkey: string,
  color?: string,
): React.ReactElement {
  const idx = title.toLowerCase().indexOf(hotkey.toLowerCase())
  if (idx >= 0 && hotkey.length === 1 && hotkey.toLowerCase() !== hotkey.toUpperCase()) {
    // Letter found in title — highlight it inline: prefix + [X] + rest
    const before = title.slice(0, idx)
    const matched = title[idx]
    const after = title.slice(idx + 1)
    return (
      <Text color={color} bold>
        {before}
        <Text color="$fg-muted" bold={false}>
          [
        </Text>
        <Text bold>{matched}</Text>
        <Text color="$fg-muted" bold={false}>
          ]
        </Text>
        {after}
      </Text>
    )
  }
  // Hotkey not in title (or symbol) — prepend [X] Title
  return (
    <Text color={color} bold>
      <Text color="$fg-muted" bold={false}>
        [
      </Text>
      <Text bold>{hotkey}</Text>
      <Text color="$fg-muted" bold={false}>
        ]
      </Text>{" "}
      {title}
    </Text>
  )
}

// =============================================================================
// Component
// =============================================================================

/**
 * Reusable modal dialog with consistent styling.
 *
 * Features:
 * - Solid raised background (covers board content)
 * - Borderless by default; the raised background carries the modal surface.
 * - Horizontal padding (2), vertical padding (1)
 * - Title: bold, colored, with spacer below
 * - Footer: centered, dimColor, with spacer above
 */
export function ModalDialog({
  borderColor = "$border-default",
  title,
  titleColor,
  titleAlign = "center",
  hotkey: _hotkey,
  titleRight,
  width,
  height,
  footer,
  footerAlign = "center",
  onClose: _onClose,
  focusScope: _focusScope = true,
  fade = DEFAULT_FADE,
  children,
  ...boxProps
}: ModalDialogProps): React.ReactElement {
  const theme = useTheme()
  const effectiveTitleColor = titleColor ?? "$fg-accent"
  // When titleRight is provided, use space-between layout for the title bar
  const effectiveTitleAlign = titleRight ? "space-between" : titleAlign

  // Backdrop fade: emit `data-backdrop-fade-excluded` so the pipeline's
  // backdrop pass fades everything OUTSIDE this dialog's screen rect.
  // `fade={0}` disables the effect entirely (no marker emitted).
  const fadeAttrs: Record<string, unknown> =
    Number.isFinite(fade) && fade > 0 ? { "data-backdrop-fade-excluded": clampFade(fade) } : {}

  return (
    <Box
      flexDirection="column"
      width={width ?? "snug-content"}
      minWidth={0}
      height={height}
      borderColor={borderColor}
      backgroundColor={raisedSurfaceBackground(theme)}
      paddingX={2}
      paddingY={1}
      userSelect="contain"
      {...fadeAttrs}
      {...boxProps}
    >
      {title && (
        <Box flexShrink={0} flexDirection="column">
          <Box justifyContent={effectiveTitleAlign}>
            <Text color={effectiveTitleColor} bold>
              {title}
            </Text>
            {titleRight}
          </Box>
          <Text> </Text>
        </Box>
      )}
      {/* Content area - flexGrow pushes footer to bottom; the bounded overflow
          keeps the title in place, and `scroll` (not `hidden`) means a body
          taller than the dialog stays reachable by wheel through Box's default
          scroll owner. A body that fits leaves wheel input to its ancestors. */}
      <Box flexDirection="column" flexGrow={1} overflow="scroll">
        {children}
      </Box>
      {/* Footer with spacer line above */}
      {footer && (
        <>
          <Text> </Text>
          <Box justifyContent={footerAlign}>
            {typeof footer === "string" ? <Text color="$fg-muted">{footer}</Text> : footer}
          </Box>
        </>
      )}
    </Box>
  )
}

function clampFade(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return n > 1 ? 1 : n
}
