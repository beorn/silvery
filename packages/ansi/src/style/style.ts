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

import { detectColor } from "../detection.ts"

import {
  BG_COLORS,
  FG_COLORS,
  MODIFIERS,
  THEME_TOKEN_DEFAULTS,
  bgFromRgb,
  fgFromRgb,
  hexToRgb,
} from "./colors.ts"
import type { Style, StyleOptions, ThemeLike } from "./types.ts"

// =============================================================================
// Core Types
// =============================================================================

/** Accumulated style state for one chain. */
interface ChainState {
  opens: string[] // SGR open codes (e.g., "1", "31", "38;2;255;0;0")
  closes: string[] // SGR close codes (e.g., "22", "39")
  visible?: boolean // chalk's `visible` modifier — suppresses output when level === 0
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
export function resolveThemeColor(
  name: string | undefined,
  theme: object | undefined,
): string | undefined {
  if (!name) return undefined
  if (!name.startsWith("$")) return name
  if (!theme) return undefined
  return resolveToken(name, theme as ThemeLike)
}

/**
 * Legacy alias table — maps no-hyphen variants of old Ink-style names to the
 * canonical (all-lowercase, no-hyphen) Theme keys that have always existed.
 *
 * This is a subset of the old PRIMER_ALIASES: only entries where the token
 * introduces a NEW semantic name for an existing differently-named key. The
 * state-variant entries (primaryhover → primaryHover, etc.) are gone — those
 * fields are now kebab keys ("primary-hover") in the Theme and are found by
 * the direct-lookup path.
 *
 * Keys: token name with hyphens stripped and $ removed (e.g. "fgmuted").
 * Values: the canonical Theme property name (e.g. "muted").
 */
const LEGACY_ALIASES: Record<string, string> = {
  // Text slots — "fg-<role>" maps to legacy all-lowercase name
  fgmuted: "muted",
  fgdisabled: "disabledfg",
  fgcursor: "cursor",
  fgselected: "selection",
  fginverse: "inverse",
  fgonsurface: "surface",
  fgonpopover: "popover",
  fgonprimary: "primaryfg",
  fgonsecondary: "secondaryfg",
  fgonaccent: "accentfg",
  fgonerror: "errorfg",
  fgonwarning: "warningfg",
  fgonsuccess: "successfg",
  fgoninfo: "infofg",
  // Background slots — "bg-<role>" maps to legacy name
  bgmuted: "mutedbg",
  bgsurface: "surfacebg",
  bgpopover: "popoverbg",
  bginverse: "inversebg",
  bgselected: "selectionbg",
  bgcursor: "cursorbg",
  // Border slots
  borderfocus: "focusborder",
  borderinput: "inputborder",
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
  const themeObj = theme as Record<string, unknown>
  // Direct kebab lookup first — handles new-style keys like "primary-hover",
  // "fg-hover", "bg-surface-hover", and all plain tokens like "bg", "primary".
  const direct = themeObj[token]
  if (typeof direct === "string") return direct
  // Strip hyphens and try the no-hyphen key (legacy names: surfacebg, focusborder, …)
  const noHyphen = token.replace(/-/g, "")
  if (noHyphen !== token) {
    const stripped = themeObj[noHyphen]
    if (typeof stripped === "string") return stripped
    // Legacy alias fallback (e.g. "fgmuted" → "muted", "bgsurface" → "surfacebg")
    const aliased = LEGACY_ALIASES[noHyphen]
    if (aliased) {
      const val = themeObj[aliased]
      if (typeof val === "string") return val
    }
  }
  return undefined
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

// =============================================================================
// Public API
// =============================================================================

/** Convert chalk numeric level (0-3) to ColorLevel. */
function fromChalkLevel(n: number): import("../types.ts").ColorLevel | null {
  if (n <= 0) return null
  if (n === 1) return "basic"
  if (n === 2) return "256"
  return "truecolor"
}

/** Convert ColorLevel to chalk numeric level (0-3). */
function toChalkLevel(cl: import("../types.ts").ColorLevel | null): number {
  if (cl === null) return 0
  if (cl === "basic") return 1
  if (cl === "256") return 2
  return 3
}

/**
 * Create a style object for terminal output.
 *
 * @param options - Color level and optional theme
 * @returns A chainable style object (chalk-compatible API)
 *
 * @example
 * ```ts
 * import { createStyle } from "@silvery/ansi"
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
  // Mutable level ref — shared across all chains from this instance
  const ref = {
    level: null as import("../types.ts").ColorLevel | null,
    theme: options?.theme as ThemeLike | undefined,
  }

  if (options?.level !== undefined) {
    ref.level = options.level
  } else {
    try {
      ref.level = detectColor(process.stdout)
    } catch {
      ref.level = null
    }
  }

  // Root chain with mutable level via ref
  const root = createChainWithRef({ opens: [], closes: [] }, ref)
  return root
}

/**
 * Create a plain style object — no theme, just color level.
 * Equivalent to `createStyle()` without a theme.
 *
 * @param level - Color level override. Auto-detected if omitted.
 */
export function createPlainStyle(level?: import("../types.ts").ColorLevel | null): Style {
  return createStyle({ level })
}

/**
 * Pre-configured global style instance.
 * Auto-detects color level from the terminal.
 * No theme by default — use `createStyle({ theme })` for themed output.
 */
export const style: Style = createStyle()

/**
 * Create a chain that reads level from a mutable ref.
 * This allows `style.level = 3` to affect all subsequent calls.
 */
function createChainWithRef(
  state: ChainState,
  ref: { level: import("../types.ts").ColorLevel | null; theme: ThemeLike | undefined },
): Style {
  // proxyRef lets the handler reference its own proxy (needed for Function.prototype methods)
  const proxyRef: { proxy: Style | null } = { proxy: null }
  const handler: ProxyHandler<(...args: unknown[]) => string> = {
    apply(_target, _thisArg, args) {
      const level = ref.level

      // chalk compat: visible modifier suppresses output when level === 0
      if (state.visible && level === null) return ""

      // Resolve text from args — supports: string, multiple args (chalk compat), template literals
      let text: string
      if (args.length === 0) {
        text = ""
      } else if (Array.isArray(args[0]) && "raw" in args[0]) {
        text = String.raw(args[0] as TemplateStringsArray, ...args.slice(1))
      } else if (args.length > 1) {
        text = args.map((a) => String(a ?? "")).join(" ")
      } else {
        text = String(args[0] ?? "")
      }

      // chalk compat: don't output escape codes if the input is empty
      if (text === "") return ""

      if (level === null || state.opens.length === 0) return text

      const open = `${ESC}${state.opens.join(";")}m`
      const close = `${ESC}${state.closes.join(";")}m`

      // chalk compat: replace inner close codes with close+reopen to restore parent styles.
      // When nesting like chalk.red("a" + chalk.green("c") + "b"), the inner chalk.green("c")
      // produces \x1b[32mc\x1b[39m. The \x1b[39m would reset fg to default, losing the red.
      // Chalk replaces inner close codes with close+open to restore the parent color.
      // This must happen BEFORE line-break splitting to avoid double-replacement.
      for (const closeCode of state.closes) {
        const closeSeq = `${ESC}${closeCode}m`
        const parts = text.split(closeSeq)
        if (parts.length > 1) {
          text = parts.join(`${closeSeq}${open}`)
        }
      }

      // chalk compat: split on line breaks — close before \n, reopen after
      if (text.includes("\n")) {
        text = text.replace(/\r?\n/g, `${close}$&${open}`)
      }

      return `${open}${text}${close}`
    },

    get(_target, prop) {
      if (typeof prop === "symbol") return undefined

      // level getter/setter (chalk compat)
      if (prop === "level") return toChalkLevel(ref.level)

      // resolve() method
      if (prop === "resolve") {
        return (token: string): string | undefined => resolveToken(token, ref.theme)
      }

      // chalk compat: visible modifier — pass-through when level > 0, suppress when level === 0
      if (prop === "visible") {
        return createChainWithRef({ ...state, visible: true }, ref)
      }

      // Function.prototype methods — chalk compat (call, apply, bind)
      // Return the method bound to the proxy so the apply trap fires
      if (prop === "call" || prop === "apply" || prop === "bind") {
        return Function.prototype[prop as "call" | "apply" | "bind"].bind(proxyRef.proxy!)
      }

      const level = ref.level

      // Color methods
      if (prop === "hex" || prop === "bgHex") {
        return (color: string) => {
          if (level === null) return createChainWithRef(state, ref)
          const rgb = hexToRgb(color)
          if (!rgb) return createChainWithRef(state, ref)
          const code =
            prop === "hex"
              ? fgFromRgb(rgb[0], rgb[1], rgb[2], level)
              : bgFromRgb(rgb[0], rgb[1], rgb[2], level)
          const close = prop === "hex" ? "39" : "49"
          return createChainWithRef(
            { opens: [...state.opens, code], closes: [...state.closes, close] },
            ref,
          )
        }
      }

      if (prop === "rgb" || prop === "bgRgb") {
        return (r: number, g: number, b: number) => {
          if (level === null) return createChainWithRef(state, ref)
          const code = prop === "rgb" ? fgFromRgb(r, g, b, level) : bgFromRgb(r, g, b, level)
          const close = prop === "rgb" ? "39" : "49"
          return createChainWithRef(
            { opens: [...state.opens, code], closes: [...state.closes, close] },
            ref,
          )
        }
      }

      if (prop === "ansi256") {
        return (code: number) => {
          if (level === null) return createChainWithRef(state, ref)
          return createChainWithRef(
            { opens: [...state.opens, `38;5;${code}`], closes: [...state.closes, "39"] },
            ref,
          )
        }
      }

      if (prop === "bgAnsi256") {
        return (code: number) => {
          if (level === null) return createChainWithRef(state, ref)
          return createChainWithRef(
            { opens: [...state.opens, `48;5;${code}`], closes: [...state.closes, "49"] },
            ref,
          )
        }
      }

      // Modifiers
      if (prop in MODIFIERS) {
        if (level === null) return createChainWithRef(state, ref)
        const [open, close] = MODIFIERS[prop]!
        return createChainWithRef(
          { opens: [...state.opens, String(open)], closes: [...state.closes, String(close)] },
          ref,
        )
      }

      // Foreground colors
      if (prop in FG_COLORS) {
        if (level === null) return createChainWithRef(state, ref)
        return createChainWithRef(
          { opens: [...state.opens, String(FG_COLORS[prop]!)], closes: [...state.closes, "39"] },
          ref,
        )
      }

      // Background colors
      if (prop in BG_COLORS) {
        if (level === null) return createChainWithRef(state, ref)
        return createChainWithRef(
          { opens: [...state.opens, String(BG_COLORS[prop]!)], closes: [...state.closes, "49"] },
          ref,
        )
      }

      // Theme tokens
      if (THEME_TOKENS.has(prop)) {
        if (level === null) return createChainWithRef(state, ref)
        const hex = resolveToken(prop, ref.theme)
        if (hex) {
          const rgb = hexToRgb(hex)
          if (rgb) {
            const code = fgFromRgb(rgb[0], rgb[1], rgb[2], level)
            if (prop === "link") {
              return createChainWithRef(
                { opens: [...state.opens, code, "4"], closes: [...state.closes, "39", "24"] },
                ref,
              )
            }
            return createChainWithRef(
              { opens: [...state.opens, code], closes: [...state.closes, "39"] },
              ref,
            )
          }
        }
        const fallback = THEME_TOKEN_DEFAULTS[prop]
        if (fallback !== undefined) {
          if (prop === "muted") {
            return createChainWithRef(
              { opens: [...state.opens, String(fallback)], closes: [...state.closes, "22"] },
              ref,
            )
          }
          if (prop === "link") {
            return createChainWithRef(
              {
                opens: [...state.opens, String(fallback), "4"],
                closes: [...state.closes, "39", "24"],
              },
              ref,
            )
          }
          return createChainWithRef(
            { opens: [...state.opens, String(fallback)], closes: [...state.closes, "39"] },
            ref,
          )
        }
      }

      return undefined
    },

    set(_target, prop, value) {
      if (prop === "level") {
        ref.level = fromChalkLevel(value as number)
        return true
      }
      return false
    },

    has(_target, prop) {
      if (prop === "level") return true
      if (typeof prop === "symbol") return false
      return (
        prop in MODIFIERS ||
        prop in FG_COLORS ||
        prop in BG_COLORS ||
        THEME_TOKENS.has(prop) ||
        KNOWN_METHODS.has(prop)
      )
    },
  }

  const target = function () {} as unknown as (...args: unknown[]) => string
  const proxy = new Proxy(target, handler) as unknown as Style
  proxyRef.proxy = proxy
  return proxy
}
