/**
 * RadioGroup Component
 *
 * Mutually-exclusive option group. Up/Down (or j/k) navigates between
 * options; Enter or Space selects the focused option. Pair with a label
 * via `<Text>` outside the group.
 *
 * Usage:
 * ```tsx
 * const [theme, setTheme] = useState("dark")
 * <RadioGroup
 *   value={theme}
 *   onChange={setTheme}
 *   options={[
 *     { value: "light", label: "Light" },
 *     { value: "dark", label: "Dark" },
 *     { value: "auto", label: "Auto" },
 *   ]}
 * />
 * ```
 *
 * Renders inline `(•)` for selected, `( )` for unselected. The currently
 * focused option (cursor) gets a leading marker — distinct from
 * "selected" since you can navigate without selecting.
 */
import React, { useState } from "react"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"

// =============================================================================
// Types
// =============================================================================

export interface RadioGroupOption<T extends string = string> {
  value: T
  label: string
}

export interface RadioGroupProps<T extends string = string> extends Omit<
  BoxProps,
  "children" | "onChange"
> {
  /** All options, in display order. */
  options: ReadonlyArray<RadioGroupOption<T>>
  /** Currently selected value. Pair with onChange. */
  value: T
  /** Called when the user selects (Enter or Space). */
  onChange: (value: T) => void
  /** Override focused state (mirrors Toggle/TextInput). */
  isActive?: boolean
}

// =============================================================================
// Component
// =============================================================================

export function RadioGroup<T extends string = string>({
  options,
  value,
  onChange,
  isActive,
  ...rest
}: RadioGroupProps<T>): React.ReactElement {
  const { focused } = useFocusable()
  const active = isActive ?? focused

  // Track which option the cursor is on. Defaults to the currently
  // selected option so navigating in lands on the obvious starting point.
  const initialCursor = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const [cursor, setCursor] = useState(initialCursor)

  useInput(
    (input, key) => {
      if (!active) return
      if (key.upArrow || input === "k") {
        setCursor((c) => (c <= 0 ? options.length - 1 : c - 1))
      } else if (key.downArrow || input === "j") {
        setCursor((c) => (c >= options.length - 1 ? 0 : c + 1))
      } else if (key.return || input === " ") {
        const opt = options[cursor]
        if (opt) onChange(opt.value)
      }
    },
    { isActive: active },
  )

  return (
    <Box flexDirection="column" {...rest}>
      {options.map((opt, i) => {
        const isSelected = opt.value === value
        const isCursor = active && i === cursor
        const marker = isSelected ? "(•)" : "( )"
        return (
          <Box key={opt.value}>
            <Text color={isCursor ? "$fg-accent" : isSelected ? "$fg-accent" : "$fg-muted"}>
              {isCursor ? "› " : "  "}
              {marker} {opt.label}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
