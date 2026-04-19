/**
 * Button Component
 *
 * A focusable button control. Integrates with the silvery focus system
 * and responds to Enter or Space key to activate.
 *
 * Usage:
 * ```tsx
 * <Button label="Save" onPress={() => save()} />
 * <Button label="Cancel" onPress={() => close()} color="red" />
 *
 * // With explicit active control (bypasses focus system)
 * <Button label="OK" onPress={confirm} isActive={hasFocus} />
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

export interface ButtonProps extends Omit<BoxProps, "children"> {
  /** Button label */
  label: string
  /** Called when activated (Enter or Space) */
  onPress: () => void
  /** Whether input is active (default: from focus system) */
  isActive?: boolean
  /** Button color */
  color?: string
}

// =============================================================================
// Component
// =============================================================================

/**
 * Focusable button control.
 *
 * Renders `[ label ]` with inverse styling when focused. Activates on
 * Enter or Space key press.
 */
export function Button({
  label,
  onPress,
  isActive,
  color,
  ...rest
}: ButtonProps): React.ReactElement {
  const { focused } = useFocusable()

  // isActive prop overrides focus state (same pattern as TextInput)
  const active = isActive ?? focused

  useInput(
    (_input, key) => {
      if (key.return || (_input === " " && !key.ctrl && !key.meta && !key.shift)) {
        onPress()
      }
    },
    { isActive: active },
  )

  return (
    <Box focusable {...rest}>
      <Text color={color} inverse={active}>
        {"[ "}
        {label}
        {" ]"}
      </Text>
    </Box>
  )
}
