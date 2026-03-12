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
import { useFocusable } from "@silvery/react/hooks/useFocusable"
import { useInput } from "@silvery/react/hooks/useInput"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface ButtonProps {
  /** Button label */
  label: string
  /** Called when activated (Enter or Space) */
  onPress: () => void
  /** Whether input is active (default: from focus system) */
  isActive?: boolean
  /** Test ID for focus system */
  testID?: string
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
export function Button({ label, onPress, isActive, testID, color }: ButtonProps): React.ReactElement {
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
    <Box focusable testID={testID}>
      <Text color={color} inverse={active}>
        {"[ "}
        {label}
        {" ]"}
      </Text>
    </Box>
  )
}
