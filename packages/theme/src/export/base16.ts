/**
 * Export ColorPalette to Base16 YAML format.
 *
 * Maps ColorPalette fields to base00–base0F. For fields that
 * ColorPalette doesn't store directly (base04/base06/base07),
 * we interpolate between neighboring values.
 *
 * @see https://github.com/chriskempson/base16
 */

import { blend } from "../color";
import type { ColorPalette } from "../types";

/** Strip `#` prefix from a hex color string and uppercase. */
function stripHash(hex: string): string {
  const bare = hex.startsWith("#") ? hex.slice(1) : hex;
  return bare.toUpperCase();
}

/**
 * Export a ColorPalette to Base16 YAML format.
 *
 * Mapping:
 *   background → base00, brightBlack → base01, selectionBackground → base02,
 *   white → base03, (interpolated) → base04, foreground → base05,
 *   (interpolated) → base06, (interpolated) → base07,
 *   red → base08, brightRed → base09, yellow → base0A, green → base0B,
 *   cyan → base0C, blue → base0D, magenta → base0E, brightMagenta → base0F.
 */
export function exportBase16(palette: ColorPalette): string {
  const dark = palette.dark ?? true;

  // base04: between white (base03/muted fg) and foreground (base05)
  const base04 = blend(palette.white, palette.foreground, 0.33);

  // base06: light foreground — between fg and the inverse extreme
  const base06 = dark
    ? blend(palette.foreground, "#FFFFFF", 0.15)
    : blend(palette.foreground, "#000000", 0.15);

  // base07: lightest background — use black (the deepest bg extreme)
  const base07 = palette.black;

  const lines = [
    `scheme: "${palette.name ?? "exported"}"`,
    `author: ""`,
    `base00: "${stripHash(palette.background)}"`,
    `base01: "${stripHash(palette.brightBlack)}"`,
    `base02: "${stripHash(palette.selectionBackground)}"`,
    `base03: "${stripHash(palette.white)}"`,
    `base04: "${stripHash(base04)}"`,
    `base05: "${stripHash(palette.foreground)}"`,
    `base06: "${stripHash(base06)}"`,
    `base07: "${stripHash(base07)}"`,
    `base08: "${stripHash(palette.red)}"`,
    `base09: "${stripHash(palette.brightRed)}"`,
    `base0A: "${stripHash(palette.yellow)}"`,
    `base0B: "${stripHash(palette.green)}"`,
    `base0C: "${stripHash(palette.cyan)}"`,
    `base0D: "${stripHash(palette.blue)}"`,
    `base0E: "${stripHash(palette.magenta)}"`,
    `base0F: "${stripHash(palette.brightMagenta)}"`,
  ];

  return lines.join("\n") + "\n";
}
