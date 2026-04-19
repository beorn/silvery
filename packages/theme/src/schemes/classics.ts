/**
 * Classic terminal default schemes — useful for fingerprint matching against
 * users still on stock terminal configurations.
 *
 * Each scheme reflects the OUT-OF-THE-BOX defaults of a major terminal. They
 * are NOT aesthetic recommendations — they're anchor points for
 * `fingerprintMatch` to identify "this user hasn't changed their terminal
 * theme." Apps can then choose to style accordingly (or offer to set a nicer
 * scheme).
 *
 * Attribution: sourced from public terminal documentation + defaults repos.
 * License: values are factual defaults, not copyrightable.
 */

import type { ColorScheme } from "@silvery/ansi"

/** Classic IBM VGA 16-color palette (circa 1987). The OG 16 colors. */
export const vga: ColorScheme = {
  name: "vga",
  dark: true,
  black: "#000000",
  red: "#AA0000",
  green: "#00AA00",
  yellow: "#AA5500",
  blue: "#0000AA",
  magenta: "#AA00AA",
  cyan: "#00AAAA",
  white: "#AAAAAA",
  brightBlack: "#555555",
  brightRed: "#FF5555",
  brightGreen: "#55FF55",
  brightYellow: "#FFFF55",
  brightBlue: "#5555FF",
  brightMagenta: "#FF55FF",
  brightCyan: "#55FFFF",
  brightWhite: "#FFFFFF",
  foreground: "#AAAAAA",
  background: "#000000",
  cursorColor: "#FFFFFF",
  cursorText: "#000000",
  selectionBackground: "#888888",
  selectionForeground: "#000000",
}

/** xterm's default palette (X Consortium). The reference terminal defaults. */
export const xtermDefault: ColorScheme = {
  name: "xterm-default",
  dark: true,
  black: "#000000",
  red: "#CD0000",
  green: "#00CD00",
  yellow: "#CDCD00",
  blue: "#0000EE",
  magenta: "#CD00CD",
  cyan: "#00CDCD",
  white: "#E5E5E5",
  brightBlack: "#7F7F7F",
  brightRed: "#FF0000",
  brightGreen: "#00FF00",
  brightYellow: "#FFFF00",
  brightBlue: "#5C5CFF",
  brightMagenta: "#FF00FF",
  brightCyan: "#00FFFF",
  brightWhite: "#FFFFFF",
  foreground: "#E5E5E5",
  background: "#000000",
  cursorColor: "#E5E5E5",
  cursorText: "#000000",
  selectionBackground: "#555555",
  selectionForeground: "#E5E5E5",
}

/** Apple Terminal.app "Basic" profile. */
export const appleTerminalBasic: ColorScheme = {
  name: "apple-terminal-basic",
  dark: false,
  black: "#000000",
  red: "#990000",
  green: "#00A600",
  yellow: "#999900",
  blue: "#0000B2",
  magenta: "#B200B2",
  cyan: "#00A6B2",
  white: "#BFBFBF",
  brightBlack: "#666666",
  brightRed: "#E50000",
  brightGreen: "#00D900",
  brightYellow: "#E5E500",
  brightBlue: "#0000FF",
  brightMagenta: "#E500E5",
  brightCyan: "#00E5E5",
  brightWhite: "#E5E5E5",
  foreground: "#000000",
  background: "#FFFFFF",
  cursorColor: "#000000",
  cursorText: "#FFFFFF",
  selectionBackground: "#B5D5FF",
  selectionForeground: "#000000",
}

/** Windows Terminal (Campbell scheme — the default profile on Windows 10/11). */
export const windowsTerminalCampbell: ColorScheme = {
  name: "windows-terminal-campbell",
  dark: true,
  black: "#0C0C0C",
  red: "#C50F1F",
  green: "#13A10E",
  yellow: "#C19C00",
  blue: "#0037DA",
  magenta: "#881798",
  cyan: "#3A96DD",
  white: "#CCCCCC",
  brightBlack: "#767676",
  brightRed: "#E74856",
  brightGreen: "#16C60C",
  brightYellow: "#F9F1A5",
  brightBlue: "#3B78FF",
  brightMagenta: "#B4009E",
  brightCyan: "#61D6D6",
  brightWhite: "#F2F2F2",
  foreground: "#CCCCCC",
  background: "#0C0C0C",
  cursorColor: "#FFFFFF",
  cursorText: "#0C0C0C",
  selectionBackground: "#FFFFFF",
  selectionForeground: "#0C0C0C",
}

/** GNOME Terminal (Tango variant — the default on many Linux distros). */
export const gnomeTerminalTango: ColorScheme = {
  name: "gnome-terminal-tango",
  dark: true,
  black: "#2E3436",
  red: "#CC0000",
  green: "#4E9A06",
  yellow: "#C4A000",
  blue: "#3465A4",
  magenta: "#75507B",
  cyan: "#06989A",
  white: "#D3D7CF",
  brightBlack: "#555753",
  brightRed: "#EF2929",
  brightGreen: "#8AE234",
  brightYellow: "#FCE94F",
  brightBlue: "#729FCF",
  brightMagenta: "#AD7FA8",
  brightCyan: "#34E2E2",
  brightWhite: "#EEEEEC",
  foreground: "#D3D7CF",
  background: "#300A24",
  cursorColor: "#D3D7CF",
  cursorText: "#300A24",
  selectionBackground: "#555753",
  selectionForeground: "#D3D7CF",
}
