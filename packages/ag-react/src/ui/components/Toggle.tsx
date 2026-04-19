/**
 * Toggle Component
 *
 * A focusable checkbox-style toggle control. Integrates with the silvery focus
 * system and responds to Space key to toggle the value.
 *
 * Usage:
 * ```tsx
 * const [enabled, setEnabled] = useState(false)
 * <Toggle value={enabled} onChange={setEnabled} label="Dark mode" />
 *
 * // With explicit active control (bypasses focus system)
 * <Toggle value={on} onChange={setOn} label="Option" isActive={isEditing} />
 * ```
 */
import React from "react"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"

// =============================================================================
// Types
// =============================================================================

export interface ToggleProps extends Omit<BoxProps, "children" | "onChange"> {
  /** Whether the toggle is on */
  value: boolean
  /** Called when value changes */
  onChange: (value: boolean) => void
  /** Label text */
  label?: string
  /** Whether input is active (default: from focus system) */
  isActive?: boolean
}

// =============================================================================
// Component
// =============================================================================

/**
 * Focusable toggle (checkbox) control.
 *
 * Renders `[x]` when on, `[ ]` when off. When focused, the checkbox indicator
 * is rendered with inverse styling for visibility.
 */
export function Toggle({
  value,
  onChange,
  label,
  isActive,
  ...rest
}: ToggleProps): React.ReactElement {
  const { focused } = useFocusable()

  // isActive prop overrides focus state (same pattern as TextInput)
  const active = isActive ?? focused

  useInput(
    (_input, key) => {
      // Space toggles the value
      if (_input === " " && !key.ctrl && !key.meta && !key.shift) {
        onChange(!value)
      }
    },
    { isActive: active },
  )

  const indicator = value ? "[x]" : "[ ]"

  return (
    <Box focusable {...rest}>
      <Text inverse={active}>{indicator}</Text>
      {label && <Text> {label}</Text>}
    </Box>
  )
}
