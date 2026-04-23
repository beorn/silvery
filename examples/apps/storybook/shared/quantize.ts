/**
 * Tier-quantization for storybook previews.
 *
 * The real pipeline quantizes colors at the output phase, when ANSI is
 * emitted to a TTY. The storybook renders its preview in-process via the
 * same runtime the host terminal uses — so if the host is truecolor-capable,
 * every tier looks identical because the output phase never has to
 * down-sample.
 *
 * To make the `1 / 2 / 3 / 4` toggle visibly different in the storybook, we
 * apply the same quantization at RENDER time to every hex value that flows
 * into the preview (legacy Theme tokens, Sterling Theme tokens, token-tree
 * swatch hexes, derivation-panel input chips). The result: switching to
 * `ansi16` snaps colors to one of 16 slots (very different look), `256`
 * introduces subtle cube-quantization shifts, `mono` collapses all hues to
 * black/white by luminance.
 *
 * This is a preview-only transform — it does not affect what a real terminal
 * would render at truecolor, because the output phase leaves truecolor hex
 * alone regardless.
 *
 * Implementation: thin wrappers over the public {@link pickColorLevel} API.
 * `pickColorLevel` walks hex leaves at any depth (flat tokens, nested roles,
 * palette arrays, arbitrary objects) so both Theme shapes work without a
 * storybook-local implementation.
 */

import { pickColorLevel, quantizeHex, type ColorLevel } from "@silvery/ansi"
import type { Theme as LegacyTheme } from "@silvery/ansi"
import type { SterlingTheme } from "@silvery/theme"

/** Quantize the legacy (silvery/ui) Theme. Returns a new object; inputs not mutated. */
export function quantizeLegacyTheme(theme: LegacyTheme, tier: ColorLevel): LegacyTheme {
  return pickColorLevel(theme, tier)
}

/** Quantize the Sterling Theme (nested roles + flat tokens). */
export function quantizeSterlingTheme(theme: SterlingTheme, tier: ColorLevel): SterlingTheme {
  return pickColorLevel(theme, tier)
}

export { pickColorLevel, quantizeHex }
export type { ColorLevel }
