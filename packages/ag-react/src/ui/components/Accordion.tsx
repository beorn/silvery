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
 * Keyboard: Enter or Space toggles when focused. The header itself is
 * the affordance; callers can add their own marker if their surface needs one.
 */
import React from "react"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { useExpansion } from "./use-expansion"

// =============================================================================
// Types
// =============================================================================

export interface AccordionProps extends Omit<BoxProps, "children"> {
  /** Header label. */
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

  const [isOpen, setExpanded] = useExpansion(expanded, defaultExpanded, onToggle)

  useInput(
    (input, key) => {
      if (!active) return
      if (key.return || input === " ") {
        setExpanded(!isOpen)
      }
    },
    { isActive: active },
  )

  // Disclosure indicator — collapsed shows ">" (closed), expanded
  // shows "v" (open). Renders inline before the title so a11y users
  // get the same affordance as the visible state.
  const chevron = isOpen ? "v" : ">"

  return (
    <Box flexDirection="column" {...rest}>
      <Box flexDirection="row" gap={1}>
        <Text bold={active}>{chevron}</Text>
        <Text bold={active}>{title}</Text>
      </Box>
      {isOpen ? <Box flexDirection="column">{children}</Box> : null}
    </Box>
  )
}
