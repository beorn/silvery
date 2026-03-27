/**
 * createStyle() — theme-aware chalk replacement.
 *
 * Returns a chainable Proxy-based style object. Access properties to
 * accumulate styles, call with a string to apply them.
 *
 * @example
 * ```ts
 * const s = createStyle()
 * s.bold.red("error")           // "\x1b[1;31merror\x1b[22;39m"
 * s.hex("#ff0000")("text")      // truecolor foreground
 *
 * const s = createStyle({ theme })
 * s.primary("deploy")           // resolves $primary from theme
 * ```
 */

import { detectColor } from "@silvery/ansi"

import { BG_COLORS, FG_COLORS, MODIFIERS, THEME_TOKEN_DEFAULTS, bgFromRgb, fgFromRgb, hexToRgb } from "./colors.ts"
import type { Style, StyleOptions, ThemeLike } from "./types.ts"

// =============================================================================
// Core Types
// =============================================================================

/** Accumulated style state for one chain. */
interface ChainState {
  opens: string[] // SGR open codes (e.g., "1", "31", "38;2;255;0;0")
  closes: string[] // SGR close codes (e.g., "22", "39")
}

// =============================================================================
// Theme Token Resolution
// =============================================================================

/**
 * Resolve a color value against a theme — the canonical token resolver.
 *
 * If the color starts with `$`, looks up the token in the theme.
 * Supports `$primary`, `$surface-bg` (hyphens stripped), `$color0`–`$color15` (palette).
 * Non-`$` strings pass through unchanged. Returns undefined if no theme or unknown token.
 *
 * Compatible with @silvery/theme's Theme type (or any object with string properties).
 */
export function resolveThemeColor(name: string | undefined, theme: object | undefined): string | undefined {
  if (!name) return undefined
  if (!theme) return name.startsWith("$") ? undefined : name
  if (!name.startsWith("$")) return name
  return resolveToken(name, theme as ThemeLike)
}

/** Internal: resolve a token name (with or without $ prefix) against a theme. */
function resolveToken(name: string, theme: ThemeLike | undefined): string | undefined {
  if (!theme) return undefined
  const token = name.startsWith("$") ? name.slice(1) : name
  // Palette colors: $color0–$color15
  if (token.startsWith("color")) {
    const idx = parseInt(token.slice(5), 10)
    if (idx >= 0 && idx < 16 && theme.palette && idx < theme.palette.length) {
      return theme.palette[idx]
    }
  }
  // Strip hyphens for lookup ($surface-bg → surfacebg)
  const key = token.replace(/-/g, "")
  const val = (theme as Record<string, unknown>)[key]
  return typeof val === "string" ? val : undefined
}

// =============================================================================
// Proxy-based Style Chain
// =============================================================================

const ESC = "\x1b["
const KNOWN_METHODS = new Set(["hex", "rgb", "bgHex", "bgRgb", "ansi256", "bgAnsi256", "resolve"])
const THEME_TOKENS = new Set([
  "primary",
  "secondary",
  "accent",
  "error",
  "warning",
  "success",
  "info",
  "muted",
  "link",
  "border",
  "surface",
])

function createChain(
  state: ChainState,
  level: import("@silvery/ansi").ColorLevel | null,
  theme: ThemeLike | undefined,
): Style {
  const handler: ProxyHandler<(...args: unknown[]) => string> = {
    apply(_target, _thisArg, args) {
      // No color support → return plain text
      if (level === null) {
        if (typeof args[0] === "string") return args[0]
        if (Array.isArray(args[0]) && "raw" in args[0]) {
          return String.raw(args[0] as TemplateStringsArray, ...args.slice(1))
        }
        return String(args[0] ?? "")
      }

      let text: string
      if (typeof args[0] === "string") {
        text = args[0]
      } else if (Array.isArray(args[0]) && "raw" in args[0]) {
        text = String.raw(args[0] as TemplateStringsArray, ...args.slice(1))
      } else {
        text = String(args[0] ?? "")
      }

      if (state.opens.length === 0) return text

      const open = `${ESC}${state.opens.join(";")}m`
      const close = `${ESC}${state.closes.join(";")}m`
      return `${open}${text}${close}`
    },

    get(_target, prop) {
      if (typeof prop === "symbol") return undefined

      // resolve() method
      if (prop === "resolve") {
        return (token: string): string | undefined => {
          return resolveToken(token, theme)
        }
      }

      // Color methods that take arguments
      if (prop === "hex" || prop === "bgHex") {
        return (color: string) => {
          if (level === null) return createChain(state, level, theme)
          const rgb = hexToRgb(color)
          if (!rgb) return createChain(state, level, theme)
          const code =
            prop === "hex" ? fgFromRgb(rgb[0], rgb[1], rgb[2], level) : bgFromRgb(rgb[0], rgb[1], rgb[2], level)
          const close = prop === "hex" ? "39" : "49"
          return createChain({ opens: [...state.opens, code], closes: [...state.closes, close] }, level, theme)
        }
      }

      if (prop === "rgb" || prop === "bgRgb") {
        return (r: number, g: number, b: number) => {
          if (level === null) return createChain(state, level, theme)
          const code = prop === "rgb" ? fgFromRgb(r, g, b, level) : bgFromRgb(r, g, b, level)
          const close = prop === "rgb" ? "39" : "49"
          return createChain({ opens: [...state.opens, code], closes: [...state.closes, close] }, level, theme)
        }
      }

      if (prop === "ansi256") {
        return (code: number) => {
          if (level === null) return createChain(state, level, theme)
          return createChain({ opens: [...state.opens, `38;5;${code}`], closes: [...state.closes, "39"] }, level, theme)
        }
      }

      if (prop === "bgAnsi256") {
        return (code: number) => {
          if (level === null) return createChain(state, level, theme)
          return createChain({ opens: [...state.opens, `48;5;${code}`], closes: [...state.closes, "49"] }, level, theme)
        }
      }

      // Modifiers (bold, dim, italic, etc.)
      if (prop in MODIFIERS) {
        if (level === null) return createChain(state, level, theme)
        const [open, close] = MODIFIERS[prop]!
        return createChain(
          { opens: [...state.opens, String(open)], closes: [...state.closes, String(close)] },
          level,
          theme,
        )
      }

      // Foreground colors (red, green, cyan, etc.)
      if (prop in FG_COLORS) {
        if (level === null) return createChain(state, level, theme)
        return createChain(
          { opens: [...state.opens, String(FG_COLORS[prop]!)], closes: [...state.closes, "39"] },
          level,
          theme,
        )
      }

      // Background colors (bgRed, bgGreen, etc.)
      if (prop in BG_COLORS) {
        if (level === null) return createChain(state, level, theme)
        return createChain(
          { opens: [...state.opens, String(BG_COLORS[prop]!)], closes: [...state.closes, "49"] },
          level,
          theme,
        )
      }

      // Theme tokens (primary, success, error, etc.)
      if (THEME_TOKENS.has(prop)) {
        if (level === null) return createChain(state, level, theme)

        // Try theme first
        const hex = resolveToken(prop, theme)
        if (hex) {
          const rgb = hexToRgb(hex)
          if (rgb) {
            const code = fgFromRgb(rgb[0], rgb[1], rgb[2], level)
            // Special: link gets underline too
            if (prop === "link") {
              return createChain(
                { opens: [...state.opens, code, "4"], closes: [...state.closes, "39", "24"] },
                level,
                theme,
              )
            }
            return createChain({ opens: [...state.opens, code], closes: [...state.closes, "39"] }, level, theme)
          }
        }

        // Fallback to default ANSI codes
        const fallback = THEME_TOKEN_DEFAULTS[prop]
        if (fallback !== undefined) {
          // muted uses dim (modifier), others use fg color
          if (prop === "muted") {
            return createChain(
              { opens: [...state.opens, String(fallback)], closes: [...state.closes, "22"] },
              level,
              theme,
            )
          }
          if (prop === "link") {
            return createChain(
              { opens: [...state.opens, String(fallback), "4"], closes: [...state.closes, "39", "24"] },
              level,
              theme,
            )
          }
          return createChain(
            { opens: [...state.opens, String(fallback)], closes: [...state.closes, "39"] },
            level,
            theme,
          )
        }
      }

      return undefined
    },

    has(_target, prop) {
      if (typeof prop === "symbol") return false
      return (
        prop in MODIFIERS || prop in FG_COLORS || prop in BG_COLORS || THEME_TOKENS.has(prop) || KNOWN_METHODS.has(prop)
      )
    },
  }

  const target = function () {} as unknown as (...args: unknown[]) => string
  return new Proxy(target, handler) as unknown as Style
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a style object for terminal output.
 *
 * @param options - Color level and optional theme
 * @returns A chainable style object (chalk-compatible API)
 *
 * @example
 * ```ts
 * import { createStyle } from "@silvery/style"
 *
 * const s = createStyle()
 * console.log(s.bold.red("Error!"))
 * console.log(s.hex("#818cf8")("Indigo"))
 *
 * // With theme
 * const s = createStyle({ theme })
 * console.log(s.primary("Deploy"))
 * console.log(s.success("Done"))
 * ```
 */
export function createStyle(options?: StyleOptions): Style {
  let level: import("@silvery/ansi").ColorLevel | null

  if (options?.level !== undefined) {
    level = options.level
  } else {
    // Auto-detect from terminal
    try {
      level = detectColor(process.stdout)
    } catch {
      // Not in a TTY context
      level = null
    }
  }

  return createChain({ opens: [], closes: [] }, level, options?.theme)
}
