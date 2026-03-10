/**
 * Terminal palette auto-detection via OSC queries.
 *
 * Detects the terminal's actual colors by querying:
 * - OSC 10: foreground (text) color
 * - OSC 11: background color
 * - OSC 4;0–15: ANSI 16 palette colors
 *
 * Then maps the detected colors to a partial ColorPalette for
 * theme generation via createTheme() or deriveTheme().
 *
 * Supported by: Ghostty, Kitty, WezTerm, iTerm2, foot, Alacritty, xterm
 * NOT supported by: tmux (blocks OSC), basic xterm, CI environments
 */

import type { ColorPalette, Theme } from "./types";
import { deriveTheme } from "./derive";
import { nord } from "./palettes/nord";
import { catppuccinLatte } from "./palettes/catppuccin";

// silvery is an optional peer dependency — lazy-import to avoid breaking
// standalone consumers that don't have silvery installed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _silvery: any = null;
async function getSilvery() {
  if (!_silvery) {
    try {
      const mod = "@silvery/react";
      _silvery = await import(mod);
    } catch {
      throw new Error("Terminal palette detection requires '@silvery/term' to be installed");
    }
  }
  return _silvery as {
    queryBackgroundColor: (
      write: (s: string) => void,
      read: (ms: number) => Promise<string | null>,
      timeout: number,
    ) => Promise<string | null>;
    queryForegroundColor: (
      write: (s: string) => void,
      read: (ms: number) => Promise<string | null>,
      timeout: number,
    ) => Promise<string | null>;
    queryMultiplePaletteColors: (indices: number[], write: (s: string) => void) => void;
    parsePaletteResponse: (chunk: string) => { index: number; color: string } | null;
  };
}

/** Result of terminal palette detection. */
export interface DetectedPalette {
  /** Terminal foreground color (#RRGGBB), or null if undetected */
  fg: string | null;
  /** Terminal background color (#RRGGBB), or null if undetected */
  bg: string | null;
  /** ANSI 16 palette colors (index 0-15), null entries = undetected */
  ansi: (string | null)[];
  /** Whether the terminal appears to be dark mode (from bg luminance) */
  dark: boolean;
  /** Partial ColorPalette derived from detected colors */
  palette: Partial<ColorPalette>;
}

/**
 * Detect the terminal's color palette via OSC queries.
 *
 * Must be called BEFORE entering alternate screen / fullscreen mode,
 * as some terminals don't respond to OSC in alternate screen.
 *
 * @param timeoutMs How long to wait for each response (default 150ms)
 * @returns Detected palette, or null if terminal doesn't support OSC queries
 */
export async function detectTerminalPalette(timeoutMs = 150): Promise<DetectedPalette | null> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY || !stdout.isTTY) return null;

  const wasRaw = stdin.isRaw;
  if (!wasRaw) stdin.setRawMode(true);

  // Buffer for collecting responses
  let buffer = "";
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString();
  };
  stdin.on("data", onData);

  try {
    const write = (s: string) => {
      stdout.write(s);
    };

    const read = (ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        if (buffer.length > 0) {
          const result = buffer;
          buffer = "";
          resolve(result);
          return;
        }

        const timer = setTimeout(() => {
          resolve(buffer.length > 0 ? buffer : null);
          buffer = "";
        }, ms);

        const check = (_chunk: Buffer) => {
          clearTimeout(timer);
          stdin.removeListener("data", check);
          const result = buffer;
          buffer = "";
          resolve(result);
        };
        stdin.on("data", check);
      });

    const silvery = await getSilvery();

    // Query bg and fg first
    const bg = await silvery.queryBackgroundColor(write, read, timeoutMs);
    const fg = await silvery.queryForegroundColor(write, read, timeoutMs);

    // Query ANSI 16 palette
    const ansi: (string | null)[] = new Array(16).fill(null);
    silvery.queryMultiplePaletteColors(
      Array.from({ length: 16 }, (_, i) => i),
      write,
    );

    // Wait for responses
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));

    // Parse any buffered palette responses
    const remaining = buffer;
    buffer = "";
    if (remaining) {
      const oscPrefix = "\x1b]4;";
      let pos = 0;
      while (pos < remaining.length) {
        const nextOsc = remaining.indexOf(oscPrefix, pos);
        if (nextOsc === -1) break;

        let end = remaining.indexOf("\x07", nextOsc);
        if (end === -1) end = remaining.indexOf("\x1b\\", nextOsc);
        if (end === -1) break;

        const chunk = remaining.slice(nextOsc, end + 1);
        const parsed = silvery.parsePaletteResponse(chunk);
        if (parsed && parsed.index >= 0 && parsed.index < 16) {
          ansi[parsed.index] = parsed.color;
        }
        pos = end + 1;
      }
    }

    // Determine dark/light from bg
    const dark = bg ? isDarkColor(bg) : true;

    // Build partial ColorPalette from detected colors
    const palette: Partial<ColorPalette> = { dark };

    if (bg) palette.background = bg;
    if (fg) palette.foreground = fg;

    // Map ANSI 16 indices to ColorPalette fields
    const ansiFields: (keyof ColorPalette)[] = [
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
      "brightBlack",
      "brightRed",
      "brightGreen",
      "brightYellow",
      "brightBlue",
      "brightMagenta",
      "brightCyan",
      "brightWhite",
    ];
    for (let i = 0; i < 16; i++) {
      if (ansi[i]) {
        (palette as Record<string, string>)[ansiFields[i]!] = ansi[i]!;
      }
    }

    // Derive special colors from detected values
    if (fg) {
      palette.cursorColor = fg;
      palette.selectionForeground = fg;
    }
    if (bg) {
      palette.cursorText = bg;
    }
    if (ansi[4]) {
      // Selection background from blue at 30% on bg
      palette.selectionBackground = ansi[4];
    }

    return { fg, bg, ansi, dark, palette };
  } finally {
    stdin.removeListener("data", onData);
    if (!wasRaw) stdin.setRawMode(false);
  }
}

// ============================================================================
// detectTheme — high-level: detect terminal palette, fill gaps, derive theme
// ============================================================================

export interface DetectThemeOptions {
  /** Fallback ColorPalette when detection fails or returns partial data.
   * Detected colors override matching fallback fields. */
  fallback?: ColorPalette;
  /** Timeout per OSC query in ms (default 150). */
  timeoutMs?: number;
}

/**
 * Detect the terminal's color palette and derive a Theme.
 *
 * Queries the terminal via OSC, fills gaps from `fallback` palette,
 * and runs `deriveTheme()` to produce a complete 33-token Theme.
 *
 * Falls back entirely to the fallback palette (or Nord dark) if
 * detection fails (e.g., not a TTY, tmux, CI).
 */
export async function detectTheme(opts: DetectThemeOptions = {}): Promise<Theme> {
  const detected = await detectTerminalPalette(opts.timeoutMs);
  const isDark = detected?.dark ?? true;
  const fallback = opts.fallback ?? (isDark ? nord : catppuccinLatte);

  if (!detected) {
    // Detection failed entirely — use fallback
    return deriveTheme(fallback);
  }

  // Merge: detected colors override fallback
  const merged: ColorPalette = { ...fallback, ...stripNulls(detected.palette) };
  return deriveTheme(merged);
}

/** Strip null/undefined values from a partial palette so they don't override fallback. */
function stripNulls(partial: Partial<ColorPalette>): Partial<ColorPalette> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(partial)) {
    if (v != null) result[k] = v;
  }
  return result as Partial<ColorPalette>;
}

/** Check if a #RRGGBB color is dark (luminance <= 0.5). */
function isDarkColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance <= 0.5;
}
