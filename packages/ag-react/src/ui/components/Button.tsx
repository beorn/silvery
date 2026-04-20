/**
 * Button Component
 *
 * A focusable button control. Integrates with the silvery focus system
 * and responds to Enter or Space key to activate.
 *
 * Sterling tone surface (Phase 2b): accepts a `tone` prop that resolves to
 * Sterling flat tokens (`$bg-<role>`, `$fg-on-<role>`). `destructive` is a
 * component-layer intent alias for `error` (Sterling preflight D1) — same
 * pixels by default, semantic correctness at the call site.
 *
 * Usage:
 * ```tsx
 * <Button label="Save" onPress={() => save()} />                 // tone="accent"
 * <Button label="Delete" tone="destructive" onPress={remove} />  // intent
 * <Button label="Retry" tone="warning" onPress={retry} />
 * <Button label="OK" tone="accent" isActive={hasFocus} />        // explicit active
 * <Button label="Legacy" color="red" onPress={...} />            // raw color still works
 * ```
 *
 * `color` remains supported for callers that need a raw palette entry; `tone`
 * takes precedence when both are set, matching the Badge/Toast pattern.
 */
import React from "react"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { type ToneKey, toneFillTokens } from "./_tone"

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
  /**
   * Sterling tone. Accepts status roles (`error` / `warning` / `success` /
   * `info`), the `accent` emphasis role, and the `destructive` intent alias
   * (resolves to `error`). Defaults to `accent` — the standard primary button.
   *
   * When both `tone` and `color` are set, `tone` wins.
   */
  tone?: ToneKey
  /**
   * Raw color override. Kept for backward compatibility with callers that
   * reach around the tone axis (e.g. per-category coloring). Ignored when
   * `tone` is set.
   */
  color?: string
}

// =============================================================================
// Component
// =============================================================================

/**
 * Focusable button control.
 *
 * Renders `[ label ]` with tone-resolved background fill and inverse-mapped
 * foreground when focused. Activates on Enter or Space key press.
 */
export function Button({
  label,
  onPress,
  isActive,
  tone,
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

  // Resolve tone → Sterling flat tokens. `tone` wins over `color`; `color`
  // stays as the escape hatch for callers that want a raw palette entry.
  const effectiveTone: ToneKey = tone ?? (color ? ("accent" as const) : ("accent" as const))
  const tokens = toneFillTokens(effectiveTone)

  // When a raw `color` is supplied AND no `tone` is set, fall back to the
  // legacy single-color rendering (no bg fill) — preserves existing callers.
  const legacyColorMode = color !== undefined && tone === undefined

  if (legacyColorMode) {
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

  // Tone-driven rendering: fill background with `$bg-<role>` and use
  // `$fg-on-<role>` text. When active, swap to the `-active` bg so the
  // press state reads as a visible affordance.
  const bg = active ? tokens.bgActive : tokens.bg
  return (
    <Box focusable backgroundColor={bg} {...rest}>
      <Text color={tokens.fgOn} bold>
        {"[ "}
        {label}
        {" ]"}
      </Text>
    </Box>
  )
}
