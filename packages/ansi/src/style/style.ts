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
 * s.resolve("$fg-accent")       // resolves a canonical Sterling token
 * ```
 */

import { createTerminalProfile } from "../profile.ts"
import {
  UNDERLINE_CODES,
  UNDERLINE_STANDARD,
  UNDERLINE_RESET_STANDARD,
  UNDERLINE_COLOR_RESET,
  buildUnderlineColorCode,
} from "../constants.ts"

import { BG_COLORS, FG_COLORS, MODIFIERS, bgFromRgb, fgFromRgb, hexToRgb } from "./colors.ts"
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
 * Supports canonical Sterling tokens and `$color0`–`$color15` palette slots.
 * Retired spellings fail loudly with their canonical replacement; other
 * unknown tokens return undefined so optional custom-token lookups stay safe.
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

/** Internal: resolve a token name (with or without $ prefix) against a theme.
 *
 * Resolution is direct only. A legacy spelling is a programmer error, not a
 * missing optional resource: reject it with the exact canonical cure instead
 * of silently returning an empty color or following an alias fallback.
 */
function resolveToken(name: string, theme: ThemeLike | undefined): string | undefined {
  const token = name.startsWith("$") ? name.slice(1) : name
  const cure = LEGACY_THEME_TOKEN_CURES[token]
  if (cure !== undefined) {
    throw new Error(`Legacy theme token "$${token}" is retired; use ${cure}.`)
  }
  if (!theme) return undefined
  // Palette colors: $color0–$color15
  if (token.startsWith("color")) {
    const idx = parseInt(token.slice(5), 10)
    if (idx >= 0 && idx < 16 && theme.palette && idx < theme.palette.length) {
      return theme.palette[idx]
    }
  }
  const themeObj = theme as Record<string, unknown>
  // Direct lookup covers canonical Sterling flat keys plus the root canvas
  // pair and app-defined custom tokens.
  const direct = themeObj[token]
  if (typeof direct === "string") return direct
  return undefined
}

/** Retired token spellings and the channel-aware canonical cure for each. */
const LEGACY_THEME_TOKEN_CURES: Readonly<Record<string, string>> = {
  primary: '"$fg-accent" for text or "$bg-accent" for fills',
  "primary-hover": '"$fg-accent-hover" for text or "$bg-accent-hover" for fills',
  "primary-active": '"$fg-accent-active" for text or "$bg-accent-active" for fills',
  primaryfg: '"$fg-on-accent"',
  secondary: '"$fg-link" for navigation or "$purple" for a categorical hue',
  secondaryfg: '"$fg-on-accent" only for an actual accent fill',
  accent: '"$fg-accent" for text or "$bg-accent" for fills',
  "accent-hover": '"$fg-accent-hover" for text or "$bg-accent-hover" for fills',
  "accent-active": '"$fg-accent-active" for text or "$bg-accent-active" for fills',
  accentfg: '"$fg-on-accent"',
  "accent-fg":
    '"$fg-accent" for accent-colored text or "$fg-on-accent" for text on an accent background',
  muted: '"$fg-muted"',
  mutedbg: '"$bg-muted"',
  surface: '"$fg" for text or "$bg-surface-raised" for fills',
  surfacebg: '"$bg-surface-raised"',
  "surface-bg": '"$bg-surface-raised"',
  popover: '"$fg" for text or "$bg-surface-overlay" for fills',
  popoverbg: '"$bg-surface-overlay"',
  "popover-bg": '"$bg-surface-overlay"',
  error: '"$fg-error" for text or "$bg-error" for fills',
  errorfg: '"$fg-on-error"',
  warning: '"$fg-warning" for text or "$bg-warning" for fills',
  warningfg: '"$fg-on-warning"',
  "warning-fg":
    '"$fg-warning" for warning-colored text or "$fg-on-warning" for text on a warning background',
  success: '"$fg-success" for text or "$bg-success" for fills',
  successfg: '"$fg-on-success"',
  info: '"$fg-info" for text or "$bg-info" for fills',
  infofg: '"$fg-on-info"',
  border: '"$border-default"',
  inputborder: '"$border-default"',
  focusborder: '"$border-focus"',
  "focus-border": '"$border-focus"',
  "bg-surface": '"$bg-surface-default"',
  "bg-popover": '"$bg-surface-overlay"',
  "fg-selected": '"$fg-on-selected"',
  "border-input": '"$border-default"',
  "fg-on-primary": '"$fg-on-accent"',
  cursor: '"$fg-cursor" for text or "$bg-cursor" for fills',
  cursorbg: '"$bg-cursor"',
  "cursor-bg": '"$bg-cursor"',
  selection: '"$fg-on-selected"',
  selectionbg: '"$bg-selected"',
  inverse: '"$fg-on-inverse"',
  inversebg: '"$bg-inverse"',
  link: '"$fg-link"',
  disabledfg: '"$fg-disabled"',
}

// =============================================================================
// Proxy-based Style Chain
// =============================================================================

const ESC = "\x1b["
const KNOWN_METHODS = new Set([
  "hex",
  "rgb",
  "bgHex",
  "bgRgb",
  "ansi256",
  "bgAnsi256",
  "resolve",
  // Extended underline terminators (Phase 6, 2026-04-23).
  "curlyUnderline",
  "dottedUnderline",
  "dashedUnderline",
  "doubleUnderline",
  "underlineColor",
  "styledUnderline",
])
// =============================================================================
// Public API
// =============================================================================

/** Convert chalk numeric level (0-3) to {@link ColorLevel}. */
function fromChalkLevel(n: number): import("../types.ts").ColorLevel {
  if (n <= 0) return "mono"
  if (n === 1) return "ansi16"
  if (n === 2) return "256"
  return "truecolor"
}

/** Convert {@link ColorLevel} to chalk numeric level (0-3). */
function toChalkLevel(cl: import("../types.ts").ColorLevel): number {
  if (cl === "mono") return 0
  if (cl === "ansi16") return 1
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
  // Mutable level ref — shared across all chains from this instance.
  // Post km-silvery.terminal-profile-plateau Phase 1: level is the canonical
  // {@link ColorLevel}, where `"mono"` is the no-color state (previously `null`).
  // Post km-silvery.underline-on-style (Phase 6, 2026-04-23): `caps` also
  // lives on the ref — drives the extended-underline methods on the returned
  // Style. When options.caps is absent, the single `createTerminalProfile()`
  // call below populates both level and caps in one pass.
  const ref: {
    level: import("../types.ts").ColorLevel
    theme: ThemeLike | undefined
    caps: { underlineStyles: boolean; underlineColor: boolean }
  } = {
    level: "mono",
    theme: options?.theme as ThemeLike | undefined,
    caps: { underlineStyles: false, underlineColor: false },
  }

  if (options?.level !== undefined && options.level !== null) {
    ref.level = options.level
    ref.caps = options.caps ?? ref.caps
  } else if (options?.level === null) {
    ref.level = "mono"
    ref.caps = options.caps ?? ref.caps
  } else {
    try {
      // Post km-silvery.plateau-delete-legacy-shims (H6): profile factory
      // replaces the `detectColor` shim. Same semantics — env precedence
      // and TTY detection — but routed through the canonical entry point.
      const profile = createTerminalProfile({ stdout: process.stdout })
      ref.level = profile.colorLevel
      ref.caps = options?.caps ?? {
        // Phase 7: profile.caps.underlineStyles is a
        // `readonly UnderlineStyle[]`. Style's internal ref only needs a
        // boolean ("any extended style supported?") so project the length.
        underlineStyles: profile.caps.underlineStyles.length > 0,
        underlineColor: profile.caps.underlineColor,
      }
    } catch {
      ref.level = "mono"
      ref.caps = options?.caps ?? ref.caps
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
  ref: {
    level: import("../types.ts").ColorLevel
    theme: ThemeLike | undefined
    caps: { underlineStyles: boolean; underlineColor: boolean }
  },
): Style {
  // proxyRef lets the handler reference its own proxy (needed for Function.prototype methods)
  const proxyRef: { proxy: Style | null } = { proxy: null }
  const handler: ProxyHandler<(...args: unknown[]) => string> = {
    apply(_target, _thisArg, args) {
      const level = ref.level

      // chalk compat: visible modifier suppresses output when level === 0 (mono)
      if (state.visible && level === "mono") return ""

      // Resolve text from args — supports: string, multiple args (chalk compat), template literals
      let text: string
      if (args.length === 0) {
        text = ""
      } else if (Array.isArray(args[0]) && "raw" in args[0]) {
        text = String.raw(
          args[0] as TemplateStringsArray,
          ...args.slice(1).map((arg) => String(arg ?? "")),
        )
      } else if (args.length > 1) {
        text = args.map((a) => String(a ?? "")).join(" ")
      } else {
        text = String(args[0] ?? "")
      }

      // chalk compat: don't output escape codes if the input is empty
      if (text === "") return ""

      if (level === "mono" || state.opens.length === 0) return text

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
        const proxy = proxyRef.proxy
        if (!proxy) throw new Error("Style proxy has not been initialized")
        return Function.prototype[prop as "call" | "apply" | "bind"].bind(proxy)
      }

      const level = ref.level

      // Color methods
      if (prop === "hex" || prop === "bgHex") {
        return (color: string) => {
          if (level === "mono") return createChainWithRef(state, ref)
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
          if (level === "mono") return createChainWithRef(state, ref)
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
          if (level === "mono") return createChainWithRef(state, ref)
          return createChainWithRef(
            { opens: [...state.opens, `38;5;${code}`], closes: [...state.closes, "39"] },
            ref,
          )
        }
      }

      if (prop === "bgAnsi256") {
        return (code: number) => {
          if (level === "mono") return createChainWithRef(state, ref)
          return createChainWithRef(
            { opens: [...state.opens, `48;5;${code}`], closes: [...state.closes, "49"] },
            ref,
          )
        }
      }

      // Extended underline methods (Phase 6 of the unicode plateau, 2026-04-23).
      // These terminate the chain — they take `text` and return a finished
      // string. Not composable with chain modifiers (that would require
      // interleaving SGR 4:x with other opens, which the close-code dance
      // gets wrong). Consumers who want bold + curly-underline wrap the
      // terminator: `style.bold(style.curlyUnderline("err"))`.
      //
      // Emission gates:
      //   - level === "mono" → return plain text (no ANSI)
      //   - !caps.underlineStyles → fallback to standard SGR 4
      //   - else → SGR 4:x (optionally with SGR 58 color when present)
      if (
        prop === "curlyUnderline" ||
        prop === "dottedUnderline" ||
        prop === "dashedUnderline" ||
        prop === "doubleUnderline"
      ) {
        const styleName = prop.slice(0, prop.length - "Underline".length) as
          | "curly"
          | "dotted"
          | "dashed"
          | "double"
        return (text: string) => applyExtendedUnderline(text, styleName, ref)
      }

      if (prop === "underlineColor") {
        return (r: number, g: number, b: number, text: string) =>
          applyUnderlineColor(text, r, g, b, ref)
      }

      if (prop === "styledUnderline") {
        return (
          styleName: import("../types.ts").UnderlineStyle,
          rgb: import("../types.ts").RGB,
          text: string,
        ) => applyStyledUnderline(text, styleName, rgb, ref)
      }

      // Modifiers
      const modifier = MODIFIERS[prop]
      if (modifier !== undefined) {
        if (level === "mono") return createChainWithRef(state, ref)
        const [open, close] = modifier
        return createChainWithRef(
          { opens: [...state.opens, String(open)], closes: [...state.closes, String(close)] },
          ref,
        )
      }

      // Foreground colors
      const foreground = FG_COLORS[prop]
      if (foreground !== undefined) {
        if (level === "mono") return createChainWithRef(state, ref)
        return createChainWithRef(
          { opens: [...state.opens, String(foreground)], closes: [...state.closes, "39"] },
          ref,
        )
      }

      // Background colors
      const background = BG_COLORS[prop]
      if (background !== undefined) {
        if (level === "mono") return createChainWithRef(state, ref)
        return createChainWithRef(
          { opens: [...state.opens, String(background)], closes: [...state.closes, "49"] },
          ref,
        )
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
      return prop in MODIFIERS || prop in FG_COLORS || prop in BG_COLORS || KNOWN_METHODS.has(prop)
    },
  }

  const target = function () {} as unknown as (...args: unknown[]) => string
  const proxy = new Proxy(target, handler) as unknown as Style
  proxyRef.proxy = proxy
  return proxy
}

// =============================================================================
// Extended underline helpers — internal to the Proxy, terminate chains
// =============================================================================
//
// These are called by the get-trap handlers for .curlyUnderline /
// .dottedUnderline / .dashedUnderline / .doubleUnderline / .underlineColor /
// .styledUnderline. Moved here from the retired
// packages/ansi/src/underline-ext.ts in Phase 6 of the unicode plateau so
// the caps-dependency flows through createStyle's ref instead of being
// threaded per-call.

const UNDERLINE_OPEN = "\x1b[4m"
const UNDERLINE_CLOSE = "\x1b[24m"

/** `style.curlyUnderline(text)` / `.dotted` / `.dashed` / `.double`. */
function applyExtendedUnderline(
  text: string,
  name: "curly" | "dotted" | "dashed" | "double",
  ref: {
    level: import("../types.ts").ColorLevel
    caps: { underlineStyles: boolean; underlineColor: boolean }
  },
): string {
  if (ref.level === "mono") return text
  if (!ref.caps.underlineStyles) {
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }
  return `${UNDERLINE_CODES[name]}${text}${UNDERLINE_CODES.reset}`
}

/** `style.underlineColor(r, g, b, text)`. */
function applyUnderlineColor(
  text: string,
  r: number,
  g: number,
  b: number,
  ref: {
    level: import("../types.ts").ColorLevel
    caps: { underlineStyles: boolean; underlineColor: boolean }
  },
): string {
  if (ref.level === "mono") return text
  if (!ref.caps.underlineColor) {
    // Fallback: standard underline (no color)
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }
  const colorCode = buildUnderlineColorCode(r, g, b)
  return `${UNDERLINE_STANDARD}${colorCode}${text}${UNDERLINE_COLOR_RESET}${UNDERLINE_RESET_STANDARD}`
}

/** `style.styledUnderline(name, [r,g,b], text)`. */
function applyStyledUnderline(
  text: string,
  name: import("../types.ts").UnderlineStyle,
  rgb: import("../types.ts").RGB,
  ref: {
    level: import("../types.ts").ColorLevel
    caps: { underlineStyles: boolean; underlineColor: boolean }
  },
): string {
  if (ref.level === "mono") return text
  if (!ref.caps.underlineStyles) {
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }
  const [r, g, b] = rgb
  const styleCode = UNDERLINE_CODES[name]
  if (!ref.caps.underlineColor) {
    // Style without color
    return `${styleCode}${text}${UNDERLINE_CODES.reset}`
  }
  const colorCode = buildUnderlineColorCode(r, g, b)
  return `${styleCode}${colorCode}${text}${UNDERLINE_CODES.reset}${UNDERLINE_COLOR_RESET}`
}
