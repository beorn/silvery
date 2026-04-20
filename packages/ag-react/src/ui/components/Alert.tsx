/**
 * Alert Component — high-urgency modal
 *
 * Sterling Phase 2b — the highest-urgency member of the Alert family. Built
 * on top of ModalDialog with tone-aware border and title styling. Blocks
 * flow; the user must acknowledge/dismiss.
 *
 * Urgency pairing (Sterling design-system.md §"Urgency is not a design-system
 * concern"):
 *
 *   <InlineAlert>   low      passive, in-flow
 *   <Banner>        medium   dismissible, fills row width
 *   <Alert>         high     modal, blocks flow                ← this component
 *
 * Alert is a compound component: `<Alert.Title>`, `<Alert.Body>`,
 * `<Alert.Actions>`. Using the sub-components keeps the imperative API narrow
 * while giving callers layout control inside the dialog.
 *
 * Usage:
 * ```tsx
 * <Alert tone="error" open onClose={close}>
 *   <Alert.Title>Delete repository?</Alert.Title>
 *   <Alert.Body>This action cannot be undone.</Alert.Body>
 *   <Alert.Actions>
 *     <Button tone="destructive" label="Delete" onPress={confirmDelete} />
 *     <Button tone="accent" label="Cancel" onPress={close} />
 *   </Alert.Actions>
 * </Alert>
 *
 * <Alert tone="warning" open onClose={close}>
 *   <Alert.Title>Unsaved changes</Alert.Title>
 *   <Alert.Body>You have unsaved changes. Save before closing?</Alert.Body>
 * </Alert>
 * ```
 */
import React from "react"
import { useInput } from "../../hooks/useInput"
import { Box, type BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { ModalDialog } from "./ModalDialog"
import { type ToneKey, toneFgToken, toneIcon } from "./_tone"

// =============================================================================
// Types
// =============================================================================

export interface AlertProps extends Omit<BoxProps, "children" | "flexDirection" | "width" | "height"> {
  /**
   * Sterling tone. `destructive` aliases to `error` at the component layer.
   * Defaults to `error` — the prototypical high-urgency case (destructive
   * confirmation, fatal error). Callers ask for `warning` / `info` / `success`
   * when the modal conveys those tones instead.
   */
  tone?: ToneKey
  /** Whether the alert is open. Render nothing when `false`. */
  open?: boolean
  /** Called when the user dismisses (Escape key). */
  onClose?: () => void
  /** Alert content — compose `<Alert.Title>`, `<Alert.Body>`, `<Alert.Actions>`. */
  children: React.ReactNode
  /** Whether to render the tone icon in the title (default: true). */
  showIcon?: boolean
  /** Override the default tone icon glyph. */
  icon?: string
  /** Dialog width (default: passed through to ModalDialog, which snaps to content). */
  width?: number | string
}

export interface AlertTitleProps {
  children: React.ReactNode
}

export interface AlertBodyProps {
  children: React.ReactNode
}

export interface AlertActionsProps {
  children: React.ReactNode
}

// =============================================================================
// Sub-components
// =============================================================================

function AlertTitle({ children }: AlertTitleProps): React.ReactElement {
  return (
    <Text bold>
      {children}
    </Text>
  )
}

function AlertBody({ children }: AlertBodyProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{children}</Text>
    </Box>
  )
}

function AlertActions({ children }: AlertActionsProps): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} marginTop={1} justifyContent="flex-end">
      {children}
    </Box>
  )
}

// =============================================================================
// Main component
// =============================================================================

/**
 * Modal high-urgency alert — blocks the user's flow until dismissed.
 *
 * Uses ModalDialog under the hood for the double border, backdrop fade, and
 * layout conventions. Adds tone-aware border + title-icon styling so the
 * modal reads as the matching status (error / warning / success / info).
 */
function AlertRoot({
  tone = "error",
  open = true,
  onClose,
  children,
  showIcon = true,
  icon,
  width,
  ...boxProps
}: AlertProps): React.ReactElement | null {
  const fgToken = toneFgToken(tone)
  const glyph = icon ?? toneIcon(tone)

  useInput(
    (_input, key) => {
      if (key.escape) onClose?.()
    },
    { isActive: Boolean(onClose) && open },
  )

  if (!open) return null

  // Render icon + content as a single column. The icon sits inline with the
  // first child (Title) so it reads like a leading glyph without constraining
  // the content width. ModalDialog's content box snaps to intrinsic content,
  // so the column layout here just flows naturally inside the dialog.
  return (
    <ModalDialog
      borderColor={fgToken}
      titleColor={fgToken}
      onClose={onClose}
      width={width}
      {...boxProps}
    >
      <Box flexDirection="column">
        {showIcon && (
          <Text color={fgToken} bold>
            {glyph}{" "}
          </Text>
        )}
        {children}
      </Box>
    </ModalDialog>
  )
}

// =============================================================================
// Exported compound component
// =============================================================================

/**
 * Alert — high-urgency modal dialog. Use `<Alert.Title>`, `<Alert.Body>`,
 * and `<Alert.Actions>` for structured content.
 */
export const Alert = Object.assign(AlertRoot, {
  Title: AlertTitle,
  Body: AlertBody,
  Actions: AlertActions,
})
