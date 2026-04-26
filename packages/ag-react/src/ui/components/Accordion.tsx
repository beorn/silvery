/**
 * Accordion Component
 *
 * A focusable, keyboard-driven collapsible section. Header is always
 * visible; body shows when expanded. Use for tool-call cards, log
 * entries, content-block details, anywhere "summary + details" fits.
 *
 * Usage:
 * ```tsx
 * const [open, setOpen] = useState(false)
 * <Accordion title="Tool result" expanded={open} onToggle={setOpen}>
 *   <Text>{toolOutput}</Text>
 * </Accordion>
 * ```
 *
 * Uncontrolled variant: omit `expanded` and pass `defaultExpanded` —
 * the component manages its own state.
 *
 * Keyboard: Enter or Space toggles when focused. The chevron at the
 * left of the header indicates state (▶ collapsed, ▼ expanded).
 */
import React, { useState } from "react"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"

// =============================================================================
// Types
// =============================================================================

export interface AccordionProps extends Omit<BoxProps, "children"> {
  /** Header label rendered to the right of the chevron. */
  title: string
  /** Body content — only mounted when expanded. */
  children: React.ReactNode
  /** Controlled open state. Pair with onToggle. */
  expanded?: boolean
  /** Initial open state for the uncontrolled variant. Default false. */
  defaultExpanded?: boolean
  /** Called when the user toggles via keyboard. */
  onToggle?: (expanded: boolean) => void
  /** Override focused state (mirrors Toggle / TextInput convention). */
  isActive?: boolean
}

// =============================================================================
// Component
// =============================================================================

export function Accordion({
  title,
  children,
  expanded,
  defaultExpanded = false,
  onToggle,
  isActive,
  ...rest
}: AccordionProps): React.ReactElement {
  const { focused } = useFocusable()
  const active = isActive ?? focused

  // Internal state for the uncontrolled variant. When `expanded` is
  // provided, `internal` is ignored (the prop wins on every render).
  const [internal, setInternal] = useState(defaultExpanded)
  const isOpen = expanded ?? internal

  useInput(
    (input, key) => {
      if (!active) return
      if (key.return || input === " ") {
        const next = !isOpen
        if (expanded === undefined) setInternal(next)
        onToggle?.(next)
      }
    },
    { isActive: active },
  )

  // ASCII chevrons — Unicode triangles get reinterpreted as wide-emoji
  // glyphs in many terminals (FE0F variation selector), pushing layout.
  const chevron = isOpen ? "v" : ">"

  return (
    <Box flexDirection="column" {...rest}>
      <Box>
        <Text color={active ? "$primary" : "$muted"}>{chevron} </Text>
        <Text bold={active}>{title}</Text>
      </Box>
      {isOpen ? (
        <Box flexDirection="column" paddingLeft={2}>
          {children}
        </Box>
      ) : null}
    </Box>
  )
}
