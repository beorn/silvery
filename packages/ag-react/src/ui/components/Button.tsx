/**
 * Button Component
 *
 * A focusable button control. Integrates with the silvery focus system
 * and responds to Enter or Space key to activate.
 *
 * Sterling variant surface (Phase 2b): accepts a `variant` prop that resolves
 * to Sterling flat tokens (`$bg-<role>`, `$fg-on-<role>`). `destructive` is a
 * component-layer intent alias for `error` (Sterling preflight D1) — same
 * pixels by default, semantic correctness at the call site.
 *
 * Usage:
 * ```tsx
 * <Button label="Save" onPress={() => save()} />                       // variant="accent"
 * <Button label="Delete" variant="destructive" onPress={remove} />     // intent
 * <Button label="Retry" variant="warning" onPress={retry} />
 * <Button label="OK" variant="accent" isActive={hasFocus} />           // explicit active
 * <Button label="Legacy" color="red" onPress={...} />                  // raw color still works
 * ```
 *
 * `color` remains supported for callers that need a raw palette entry;
 * `variant` takes precedence when both are set, matching the Badge/Toast
 * pattern.
 *
 * The `tone` prop is accepted as a one-cycle deprecated alias for `variant`
 * — emit a console warning at dev time.
 */
import React from "react"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { type Variant, variantFillTokens } from "./_variant"

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
   * Sterling variant. Accepts status roles (`error` / `warning` / `success` /
   * `info`), the `accent` emphasis role, and the `destructive` intent alias
   * (resolves to `error`). Defaults to `accent` — the standard primary button.
   *
   * When both `variant` and `color` are set, `variant` wins.
   */
  variant?: Variant
  /** @deprecated Use `variant`. Kept for one cycle. */
  tone?: Variant
  /**
   * Raw color override. Kept for backward compatibility with callers that
   * reach around the variant axis (e.g. per-category coloring). Ignored when
   * `variant` is set.
   */
  color?: string
}

// =============================================================================
// Component
// =============================================================================

/**
 * Focusable button control.
 *
 * Renders `[ label ]` with variant-resolved background fill and inverse-mapped
 * foreground when focused. Activates on Enter or Space key press.
 */
export function Button({
  label,
  onPress,
  isActive,
  variant,
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

  // Resolve variant → Sterling flat tokens. `variant` wins over `color`;
  // `color` stays as the escape hatch for callers that want a raw palette
  // entry. `tone` is a one-cycle deprecated alias for `variant`.
  const effectiveVariant: Variant =
    variant ?? tone ?? (color ? ("accent" as const) : ("accent" as const))
  const tokens = variantFillTokens(effectiveVariant)

  // When a raw `color` is supplied AND no variant is set, fall back to the
  // legacy single-color rendering (no bg fill) — preserves existing callers.
  const legacyColorMode = color !== undefined && variant === undefined && tone === undefined

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

  // Variant-driven rendering: fill background with `$bg-<role>` and use
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
