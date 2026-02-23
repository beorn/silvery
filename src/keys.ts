/**
 * Keyboard Constants and Utilities
 *
 * Single source of truth for all key parsing, mapping, and matching in inkx.
 *
 * - KEY_MAP: Playwright key names -> ANSI sequences (for sending input)
 * - CODE_TO_KEY: ANSI escape suffixes -> key names (for parsing input)
 * - Key interface: structured key object with boolean flags
 * - parseKeypress(): raw terminal input -> ParsedKeypress
 * - parseKey(): raw terminal input -> [input, Key]
 * - keyToAnsi(): Playwright key string -> ANSI sequence
 * - keyToName(): Key object -> named key string
 * - keyToModifiers(): Key object -> modifier flags
 * - parseHotkey(): "ctrl+shift+a" -> ParsedHotkey
 * - matchHotkey(): match ParsedHotkey against Key
 *
 * @example
 * ```tsx
 * import { keyToAnsi } from 'inkx/testing'
 *
 * // Convert key names to ANSI
 * keyToAnsi('Enter')       // '\r'
 * keyToAnsi('ArrowUp')     // '\x1b[A'
 * keyToAnsi('Control+c')   // '\x03'
 * keyToAnsi('a')           // 'a'
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Key object describing which special keys/modifiers were pressed.
 */
export interface Key {
  /** Up arrow key was pressed */
  upArrow: boolean
  /** Down arrow key was pressed */
  downArrow: boolean
  /** Left arrow key was pressed */
  leftArrow: boolean
  /** Right arrow key was pressed */
  rightArrow: boolean
  /** Page Down key was pressed */
  pageDown: boolean
  /** Page Up key was pressed */
  pageUp: boolean
  /** Home key was pressed */
  home: boolean
  /** End key was pressed */
  end: boolean
  /** Return (Enter) key was pressed */
  return: boolean
  /** Escape key was pressed */
  escape: boolean
  /** Ctrl key was pressed */
  ctrl: boolean
  /** Shift key was pressed */
  shift: boolean
  /** Tab key was pressed */
  tab: boolean
  /** Backspace key was pressed */
  backspace: boolean
  /** Delete key was pressed */
  delete: boolean
  /** Meta key (Alt/Option on macOS, Alt on other platforms) was pressed */
  meta: boolean
  /** Super key (Cmd on macOS, Win on Windows) was pressed. Requires Kitty protocol. */
  super: boolean
  /** Hyper key was pressed. Requires Kitty protocol. */
  hyper: boolean
  /** Kitty event type: 1=press, 2=repeat, 3=release. Only set with Kitty flag 2 (report events). */
  eventType?: 1 | 2 | 3
}

/**
 * Input handler callback type.
 * Return 'exit' to exit the app.
 */
export type InputHandler = (input: string, key: Key) => void | "exit"

/**
 * Parsed hotkey from a string like "ctrl+shift+a" or "Control+ArrowUp".
 */
export interface ParsedHotkey {
  key: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  super: boolean
  hyper: boolean
}

// ============================================================================
// Key -> ANSI Mapping (for sending input)
// ============================================================================

/**
 * Playwright-compatible key names -> ANSI sequences.
 * Keys that are modifier-only (Control, Shift, etc.) are null.
 */
const KEY_MAP: Record<string, string | null> = {
  // Navigation (Playwright names)
  ArrowUp: "\x1b[A",
  ArrowDown: "\x1b[B",
  ArrowLeft: "\x1b[D",
  ArrowRight: "\x1b[C",
  Home: "\x1b[H",
  End: "\x1b[F",
  PageUp: "\x1b[5~",
  PageDown: "\x1b[6~",

  // Editing
  Enter: "\r",
  Tab: "\t",
  Backspace: "\x7f",
  Delete: "\x1b[3~",
  Escape: "\x1b",
  Space: " ",

  // Modifiers (prefix only, not standalone sequences)
  Control: null,
  Shift: null,
  Alt: null,
  Meta: null,
  Super: null,
  Hyper: null,
}

const MODIFIER_ALIASES: Record<string, string> = {
  ctrl: "Control",
  control: "Control",
  "⌃": "Control",
  shift: "Shift",
  "⇧": "Shift",
  alt: "Alt",
  meta: "Meta",
  opt: "Alt",
  option: "Alt",
  "⌥": "Alt",
  cmd: "Super",
  command: "Super",
  super: "Super",
  "⌘": "Super",
  hyper: "Hyper",
  "✦": "Hyper",
}

/** Modifier symbols that can be used as prefixes without + separator (e.g. ⌘J, ⌃⇧J) */
const MODIFIER_SYMBOLS = new Set(["⌃", "⇧", "⌥", "⌘", "✦"])

function normalizeModifier(mod: string): string {
  return MODIFIER_ALIASES[mod.toLowerCase()] ?? mod
}

/**
 * Convert Playwright-style key string to ANSI sequence.
 *
 * Supports:
 * - Single characters: 'a', 'A', '1', etc.
 * - Named keys: 'Enter', 'ArrowUp', 'Escape', etc.
 * - Modifier combos: 'Control+c', 'Shift+Tab', 'Control+Shift+a'
 * - Lowercase modifier aliases: 'ctrl+c', 'shift+Tab', 'alt+x'
 *
 * @example
 * ```tsx
 * keyToAnsi('Enter')       // '\r'
 * keyToAnsi('ArrowUp')     // '\x1b[A'
 * keyToAnsi('Control+c')   // '\x03'
 * keyToAnsi('j')           // 'j'
 * ```
 */
export function keyToAnsi(key: string): string {
  // Split on + for combos: 'Control+Shift+a' -> ['Control', 'Shift', 'a']
  const parts = key.split("+")
  const mainKey = parts.pop()!
  // Normalize modifier aliases: ctrl->Control, shift->Shift, alt->Alt, meta->Meta
  const modifiers = parts.map(normalizeModifier)

  // Super/Hyper modifiers require Kitty keyboard protocol encoding
  // (standard ANSI cannot represent Cmd/Super)
  if (modifiers.includes("Super") || modifiers.includes("Hyper")) {
    return keyToKittyAnsi(key)
  }

  // Single char without modifiers
  if (!modifiers.length && mainKey.length === 1) {
    return mainKey
  }

  // Ctrl+letter -> control code (ASCII 1-26)
  if (modifiers.includes("Control") && mainKey.length === 1) {
    const code = mainKey.toLowerCase().charCodeAt(0) - 96
    if (code >= 1 && code <= 26) return String.fromCharCode(code)
  }

  // Ctrl+/ -> \x1f (Unit Separator, standard terminal convention)
  if (modifiers.includes("Control") && mainKey === "/") {
    return "\x1f"
  }

  // Ctrl+Enter -> \n (legacy terminal: \r = Enter, \n = Ctrl+Enter/Ctrl+J)
  if (modifiers.includes("Control") && mainKey === "Enter") {
    return "\n"
  }

  // Alt+key -> ESC prefix (standard terminal convention)
  // Alt/Meta/Option keys send ESC followed by the key
  if ((modifiers.includes("Alt") || modifiers.includes("Meta")) && mainKey.length === 1) {
    return `\x1b${mainKey}`
  }

  // Shift+Tab -> backtab (universally \x1b[Z across all terminal emulators)
  if (modifiers.includes("Shift") && mainKey === "Tab") {
    return "\x1b[Z"
  }

  // Modified arrow/function keys -> xterm-style CSI 1;modifier sequences
  // E.g. Shift+ArrowUp -> \x1b[1;2A, Ctrl+ArrowDown -> \x1b[1;5B
  const ARROW_SUFFIX: Record<string, string> = {
    ArrowUp: "A",
    ArrowDown: "B",
    ArrowRight: "C",
    ArrowLeft: "D",
    Home: "H",
    End: "F",
  }
  if (modifiers.length > 0 && mainKey in ARROW_SUFFIX) {
    let mod = 1
    if (modifiers.includes("Shift")) mod += 1
    if (modifiers.includes("Alt") || modifiers.includes("Meta")) mod += 2
    if (modifiers.includes("Control")) mod += 4
    if (modifiers.includes("Super")) mod += 8
    if (modifiers.includes("Hyper")) mod += 16
    return `\x1b[1;${mod}${ARROW_SUFFIX[mainKey]}`
  }

  // Look up base key in map
  const base = KEY_MAP[mainKey]
  if (base !== undefined && base !== null) return base

  // Fallback: return as-is (single char or unknown key)
  return mainKey
}

// ============================================================================
// ANSI -> Key Mapping (for parsing input)
// ============================================================================

/**
 * ANSI escape code suffix -> key name mapping.
 * Used by useInput to parse incoming key sequences.
 *
 * The key is the escape sequence suffix (after ESC or ESC[).
 * Multiple terminal emulators may use different sequences for the same key.
 */
export const CODE_TO_KEY: Record<string, string> = {
  // Arrow keys (xterm ESC [ letter)
  "[A": "up",
  "[B": "down",
  "[C": "right",
  "[D": "left",
  "[E": "clear",
  "[F": "end",
  "[H": "home",

  // Arrow keys (xterm/gnome ESC O letter)
  OA: "up",
  OB: "down",
  OC: "right",
  OD: "left",
  OE: "clear",
  OF: "end",
  OH: "home",

  // Function keys (xterm/gnome ESC O letter)
  OP: "f1",
  OQ: "f2",
  OR: "f3",
  OS: "f4",

  // Function keys (xterm/rxvt ESC [ number ~)
  "[11~": "f1",
  "[12~": "f2",
  "[13~": "f3",
  "[14~": "f4",
  "[15~": "f5",
  "[17~": "f6",
  "[18~": "f7",
  "[19~": "f8",
  "[20~": "f9",
  "[21~": "f10",
  "[23~": "f11",
  "[24~": "f12",

  // Function keys (Cygwin/libuv)
  "[[A": "f1",
  "[[B": "f2",
  "[[C": "f3",
  "[[D": "f4",
  "[[E": "f5",

  // Navigation keys (xterm/rxvt ESC [ number ~)
  "[1~": "home",
  "[2~": "insert",
  "[3~": "delete",
  "[4~": "end",
  "[5~": "pageup",
  "[6~": "pagedown",

  // Navigation keys (putty)
  "[[5~": "pageup",
  "[[6~": "pagedown",

  // Navigation keys (rxvt)
  "[7~": "home",
  "[8~": "end",

  // Arrow keys with shift (rxvt lowercase)
  "[a": "up",
  "[b": "down",
  "[c": "right",
  "[d": "left",
  "[e": "clear",

  // Navigation keys with shift (rxvt $)
  "[2$": "insert",
  "[3$": "delete",
  "[5$": "pageup",
  "[6$": "pagedown",
  "[7$": "home",
  "[8$": "end",

  // Arrow keys with ctrl (rxvt O lowercase)
  Oa: "up",
  Ob: "down",
  Oc: "right",
  Od: "left",
  Oe: "clear",

  // Navigation keys with ctrl (rxvt ^)
  "[2^": "insert",
  "[3^": "delete",
  "[5^": "pageup",
  "[6^": "pagedown",
  "[7^": "home",
  "[8^": "end",

  // Shift+Tab
  "[Z": "tab",
}

// ============================================================================
// Key Parsing Constants
// ============================================================================

const NON_ALPHANUMERIC_KEYS = [
  ...Object.values(CODE_TO_KEY),
  "backspace",
  "return",
  "enter",
  "tab",
  "escape",
  "delete",
  // Note: 'space' is intentionally NOT included - users typically want ' ' as input
]

const SHIFT_CODES = new Set(["[a", "[b", "[c", "[d", "[e", "[2$", "[3$", "[5$", "[6$", "[7$", "[8$", "[Z"])

const CTRL_CODES = new Set(["Oa", "Ob", "Oc", "Od", "Oe", "[2^", "[3^", "[5^", "[6^", "[7^", "[8^"])

const META_KEY_CODE_RE = /^(?:\x1b)([a-zA-Z0-9])$/
const FN_KEY_RE = /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/

// ============================================================================
// Kitty Keyboard Protocol
// ============================================================================

/**
 * Matches Kitty keyboard protocol sequences:
 * CSI codepoint[:shifted[:base]][;modifiers[:event_type][;text_codepoints]] u
 *
 * Groups:
 *  1: codepoint
 *  2: shifted_codepoint (optional)
 *  3: base_layout_key (optional)
 *  4: modifiers (optional, defaults to 1)
 *  5: event_type (optional)
 *  6: text_codepoints (colon-separated, optional — requires REPORT_TEXT flag)
 */
const KITTY_RE = /^\x1b\[(\d+)(?::(\d+))?(?::(\d+))?(?:;(\d+)(?::(\d+))?(?:;([\d:]+))?)?u$/

/** Matches xterm modifyOtherKeys format: CSI 27 ; modifier ; keycode ~ */
const MODIFY_OTHER_KEYS_RE = /^\x1b\[27;(\d+);(\d+)~$/

/** Maps Kitty codepoints to key names for non-printable/functional keys */
const KITTY_CODEPOINT_MAP: Record<number, string> = {
  // Standard control keys
  9: "tab",
  13: "return",
  27: "escape",
  127: "backspace",
  // Function keys F1-F12
  57376: "f1",
  57377: "f2",
  57378: "f3",
  57379: "f4",
  57380: "f5",
  57381: "f6",
  57382: "f7",
  57383: "f8",
  57384: "f9",
  57385: "f10",
  57386: "f11",
  57387: "f12",
  // Function keys F13-F35
  57388: "f13",
  57389: "f14",
  57390: "f15",
  57391: "f16",
  57392: "f17",
  57393: "f18",
  57394: "f19",
  57395: "f20",
  57396: "f21",
  57397: "f22",
  57398: "f23",
  57399: "f24",
  57400: "f25",
  57401: "f26",
  57402: "f27",
  57403: "f28",
  57404: "f29",
  57405: "f30",
  57406: "f31",
  57407: "f32",
  57408: "f33",
  57409: "f34",
  57410: "f35",
  // Navigation keys
  57352: "insert",
  57353: "delete",
  57354: "home", // not in legacy sequences
  57355: "end",
  57356: "pageup",
  57357: "pagedown",
  57358: "up",
  57359: "down",
  57360: "left",
  57361: "right",
  // Lock/misc keys
  57412: "capslock",
  57413: "scrolllock",
  57414: "numlock",
  57415: "printscreen",
  57416: "pause",
  57417: "menu",
}

/** Lookup a Kitty codepoint to a key name */
function kittyCodepointToName(cp: number): string | undefined {
  return KITTY_CODEPOINT_MAP[cp]
}

// ============================================================================
// Key Parsing
// ============================================================================

export interface ParsedKeypress {
  name: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  option: boolean
  super: boolean
  hyper: boolean
  /** Kitty event type: 1=press, 2=repeat, 3=release. Only set with Kitty flag 2 (report events). */
  eventType?: 1 | 2 | 3
  /** The character when Shift is held. From Kitty shifted_codepoint. */
  shiftedKey?: string
  /** The key on a standard US layout (for non-Latin keyboards). From Kitty base_layout_key. */
  baseLayoutKey?: string
  /** CapsLock is active. Kitty modifier bit 6. */
  capsLock?: boolean
  /** NumLock is active. Kitty modifier bit 7. */
  numLock?: boolean
  /** Decoded text from Kitty REPORT_TEXT mode. */
  associatedText?: string
  sequence: string
  code?: string
}

/**
 * Parse a raw input sequence into a structured keypress object.
 * Accepts string or Buffer (Buffer support for stdin compatibility).
 */
export function parseKeypress(s: string | Buffer): ParsedKeypress {
  let input: string

  if (Buffer.isBuffer(s)) {
    if (s[0] !== undefined && s[0]! > 127 && s[1] === undefined) {
      const buf = Buffer.from(s)
      buf[0]! -= 128
      input = `\x1b${buf.toString()}`
    } else {
      input = s.toString()
    }
  } else {
    input = s ?? ""
  }

  const key: ParsedKeypress = {
    name: "",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    hyper: false,
    sequence: input,
  }

  if (input === "\r") {
    key.name = "return"
  } else if (input === "\n") {
    // In legacy terminal mode, Enter sends \r. The only way to get \n is
    // Ctrl+Enter (or Ctrl+J, same byte). Treat it as ctrl+return so
    // TextArea's submitKey="ctrl+enter" works without Kitty protocol.
    key.name = "return"
    key.ctrl = true
  } else if (input === "\t") {
    key.name = "tab"
  } else if (input === "\b" || input === "\x1b\b") {
    key.name = "backspace"
    key.meta = input.charAt(0) === "\x1b"
  } else if (input === "\x7f" || input === "\x1b\x7f") {
    // Modern terminals send \x7f for Backspace key (not \x08).
    // The actual Delete key sends \x1b[3~ (handled by CODE_TO_KEY).
    key.name = "backspace"
    key.meta = input.charAt(0) === "\x1b"
  } else if (input === "\x1b" || input === "\x1b\x1b") {
    key.name = "escape"
    key.meta = input.length === 2
  } else if (input === " " || input === "\x1b ") {
    key.name = "space"
    key.meta = input.length === 2
  } else if (input.length === 1 && input <= "\x1a") {
    // ctrl+letter
    key.name = String.fromCharCode(input.charCodeAt(0) + "a".charCodeAt(0) - 1)
    key.ctrl = true
  } else if (input === "\x1f") {
    // Ctrl+/ sends 0x1F (Unit Separator) in terminals
    key.name = "/"
    key.ctrl = true
  } else if (input.length === 1 && input >= "0" && input <= "9") {
    key.name = "number"
  } else if (input.length === 1 && input >= "a" && input <= "z") {
    key.name = input
  } else if (input.length === 1 && input >= "A" && input <= "Z") {
    key.name = input.toLowerCase()
    key.shift = true
  } else {
    // Try Kitty keyboard protocol first (CSI codepoint ; modifiers u)
    // Must be checked before FN_KEY_RE because 'u' matches [a-zA-Z]
    const kittyParts = KITTY_RE.exec(input)
    // xterm modifyOtherKeys format: CSI 27 ; modifier ; keycode ~
    // Sent by Ghostty, xterm, and others for modified keys like Ctrl+Enter
    const modifyOtherKeysParts = !kittyParts && MODIFY_OTHER_KEYS_RE.exec(input)
    if (kittyParts || modifyOtherKeysParts) {
      let codepoint: number
      let modifier: number
      if (kittyParts) {
        codepoint = Number(kittyParts[1])
        modifier = (Number(kittyParts[4] || 1) - 1) as number
      } else {
        const mokParts = modifyOtherKeysParts as RegExpExecArray
        modifier = (Number(mokParts[1]) - 1) as number
        codepoint = Number(mokParts[2])
      }

      key.shift = !!(modifier & 1)
      key.meta = !!(modifier & 2) // alt
      key.ctrl = !!(modifier & 4)
      key.super = !!(modifier & 8) // super (Cmd on macOS)
      key.hyper = !!(modifier & 16) // hyper
      key.capsLock = !!(modifier & 64)
      key.numLock = !!(modifier & 128)

      // Event type from Kitty protocol (group 5): 1=press, 2=repeat, 3=release
      if (kittyParts?.[5]) {
        const et = Number(kittyParts[5]) as 1 | 2 | 3
        if (et >= 1 && et <= 3) key.eventType = et
      }

      // Shifted codepoint (group 2)
      if (kittyParts?.[2]) {
        key.shiftedKey = String.fromCodePoint(Number(kittyParts[2]))
      }

      // Base layout key (group 3)
      if (kittyParts?.[3]) {
        key.baseLayoutKey = String.fromCodePoint(Number(kittyParts[3]))
      }

      // Text-as-codepoints (group 6) — requires REPORT_TEXT flag
      if (kittyParts?.[6]) {
        key.associatedText = kittyParts[6]
          .split(":")
          .map((cp) => String.fromCodePoint(Number(cp)))
          .join("")
      }

      // Map codepoint to key name
      const mapped = kittyCodepointToName(codepoint)
      if (mapped) {
        key.name = mapped
      } else if (codepoint >= 32 && codepoint <= 126) {
        // Printable ASCII
        key.name = String.fromCharCode(codepoint).toLowerCase()
        if (codepoint >= 65 && codepoint <= 90) {
          key.shift = true
          key.name = String.fromCharCode(codepoint + 32)
        }
      } else {
        key.name = String.fromCharCode(codepoint)
      }
    } else {
      let parts = META_KEY_CODE_RE.exec(input)
      if (parts) {
        key.meta = true
        key.shift = /^[A-Z]$/.test(parts[1] ?? "")
      } else {
        parts = FN_KEY_RE.exec(input)
        if (parts) {
          const segs = input.split("")
          if (segs[0] === "\u001b" && segs[1] === "\u001b") {
            key.option = true
          }

          // Reassemble key code
          const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join("")
          const modifier = (Number(parts[3] || parts[5] || 1) - 1) as number

          key.ctrl = !!(modifier & 4)
          key.meta = !!(modifier & 2) // alt
          key.super = !!(modifier & 8) // super (Cmd on macOS)
          key.hyper = !!(modifier & 16) // hyper
          key.shift = !!(modifier & 1)
          key.capsLock = !!(modifier & 64)
          key.numLock = !!(modifier & 128)
          key.code = code
          key.name = CODE_TO_KEY[code] ?? ""
          key.shift = SHIFT_CODES.has(code) || key.shift
          key.ctrl = CTRL_CODES.has(code) || key.ctrl
        }
      }
    }
  }

  return key
}

/**
 * Parse raw terminal input into a Key object and cleaned input string.
 *
 * @param rawInput Raw terminal input (string or Buffer)
 * @returns Tuple of [cleanedInput, Key]
 */
export function parseKey(rawInput: string | Buffer): [string, Key] {
  const keypress = parseKeypress(rawInput)

  const key: Key = {
    upArrow: keypress.name === "up",
    downArrow: keypress.name === "down",
    leftArrow: keypress.name === "left",
    rightArrow: keypress.name === "right",
    pageDown: keypress.name === "pagedown",
    pageUp: keypress.name === "pageup",
    home: keypress.name === "home",
    end: keypress.name === "end",
    return: keypress.name === "return",
    escape: keypress.name === "escape",
    ctrl: keypress.ctrl,
    shift: keypress.shift,
    tab: keypress.name === "tab",
    backspace: keypress.name === "backspace",
    delete: keypress.name === "delete",
    meta: keypress.name !== "escape" && (keypress.meta || keypress.option),
    super: keypress.super,
    hyper: keypress.hyper,
    eventType: keypress.eventType,
  }

  let input = keypress.ctrl ? keypress.name : keypress.sequence

  if (NON_ALPHANUMERIC_KEYS.includes(keypress.name)) {
    input = ""
  }

  // Strip meta prefix if remaining
  if (input.startsWith("\u001b")) {
    input = input.slice(1)
  }

  // Filter out escape sequence fragments that leak through
  // e.g., "[2~" from Insert key, "[A" from arrows when not fully parsed
  // Single "[" and "]" are allowed — they're valid key bindings
  if ((input.startsWith("[") && input.length > 1) || (input.startsWith("O") && input.length > 1)) {
    // For Kitty-encoded keys (Super/Hyper modifiers), preserve the key name
    // since the raw sequence was CSI codepoint;modifiers u
    if (keypress.super || keypress.hyper) {
      input = keypress.name
    } else {
      input = ""
    }
  }

  // Detect shift for uppercase letters
  if (input.length === 1 && typeof input[0] === "string" && /[A-Z]/.test(input[0])) {
    key.shift = true
  }

  return [input, key]
}

/**
 * Create an empty Key object (all fields false).
 */
export function emptyKey(): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
  }
}

// ============================================================================
// Key Utility Functions
// ============================================================================

/**
 * Convert a Key object to a named key string.
 *
 * Returns the Playwright-compatible name for special keys (ArrowUp, Enter, etc.)
 * or "" if no special key is pressed.
 */
export function keyToName(key: Key): string {
  if (key.upArrow) return "ArrowUp"
  if (key.downArrow) return "ArrowDown"
  if (key.leftArrow) return "ArrowLeft"
  if (key.rightArrow) return "ArrowRight"
  if (key.return) return "Enter"
  if (key.escape) return "Escape"
  if (key.backspace) return "Backspace"
  if (key.delete) return "Delete"
  if (key.tab) return "Tab"
  if (key.pageUp) return "PageUp"
  if (key.pageDown) return "PageDown"
  if (key.home) return "Home"
  if (key.end) return "End"
  return ""
}

/**
 * Extract modifier flags from a Key object.
 * `alt` is always false (terminals cannot distinguish alt from meta).
 */
export function keyToModifiers(key: Key): {
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  super: boolean
  hyper: boolean
} {
  return {
    ctrl: !!key.ctrl,
    meta: !!key.meta,
    shift: !!key.shift,
    alt: false,
    super: !!key.super,
    hyper: !!key.hyper,
  }
}

/**
 * Parse a hotkey string into base key and modifiers.
 *
 * Supports Playwright-style ("Control+c", "Shift+ArrowUp") and
 * lowercase aliases ("ctrl+c", "shift+tab", "cmd+a").
 *
 * @example
 * ```tsx
 * parseHotkey('j')           // { key: 'j', ctrl: false, meta: false, shift: false, alt: false }
 * parseHotkey('Control+c')   // { key: 'c', ctrl: true, ... }
 * parseHotkey('Shift+ArrowUp') // { key: 'ArrowUp', shift: true, ... }
 * parseHotkey('⌘j')          // { key: 'j', super: true, ... } (macOS symbol prefix)
 * parseHotkey('⌃⇧a')         // { key: 'a', ctrl: true, shift: true, ... }
 * ```
 */
export function parseHotkey(keyStr: string): ParsedHotkey {
  // Support macOS symbol prefix format: ⌘J, ⌃⇧J, ✦⌘J
  let remaining = keyStr
  const symbolMods = new Set<string>()
  for (const char of remaining) {
    if (MODIFIER_SYMBOLS.has(char)) {
      symbolMods.add(char)
    } else {
      break
    }
  }

  if (symbolMods.size > 0) {
    remaining = remaining.slice(symbolMods.size)
    if (remaining.startsWith("+")) remaining = remaining.slice(1)
  }

  const parts = remaining.split("+")
  const key = parts.pop() || keyStr
  const modifiers = new Set([...parts.map((p) => p.toLowerCase()), ...symbolMods])

  return {
    key,
    ctrl: modifiers.has("control") || modifiers.has("ctrl") || modifiers.has("⌃"),
    meta:
      modifiers.has("meta") ||
      modifiers.has("alt") ||
      modifiers.has("opt") ||
      modifiers.has("option") ||
      modifiers.has("⌥"),
    shift: modifiers.has("shift") || modifiers.has("⇧"),
    alt: false, // alt and meta are indistinguishable in terminals; use meta
    super: modifiers.has("super") || modifiers.has("cmd") || modifiers.has("command") || modifiers.has("⌘"),
    hyper: modifiers.has("hyper") || modifiers.has("✦"),
  }
}

/**
 * Match a parsed hotkey against a Key object and input string.
 *
 * @param hotkey Parsed hotkey to match
 * @param key Key object from input event
 * @param input Optional input string (for matching character keys)
 * @returns true if the hotkey matches the key event
 */
export function matchHotkey(hotkey: ParsedHotkey, key: Key, input?: string): boolean {
  // Check modifiers
  if (!!hotkey.ctrl !== !!key.ctrl) return false
  if (!!hotkey.meta !== !!key.meta) return false
  if (!!hotkey.super !== !!key.super) return false
  if (!!hotkey.hyper !== !!key.hyper) return false
  if (!!hotkey.alt !== false) return false // terminals can't distinguish alt from meta

  // For single uppercase letters (A-Z), shift is implicit
  const isUppercaseLetter = hotkey.key.length === 1 && hotkey.key >= "A" && hotkey.key <= "Z" && !hotkey.shift
  if (!isUppercaseLetter && !!hotkey.shift !== !!key.shift) return false

  // Check key name against Key boolean fields
  const name = keyToName(key)
  if (name && name === hotkey.key) return true

  // Check against input string
  if (input !== undefined && input === hotkey.key) return true

  return false
}

// ============================================================================
// Kitty Protocol Output
// ============================================================================

/** Reverse map: key name → Kitty codepoint */
const NAME_TO_KITTY_CODEPOINT: Record<string, number> = {}
for (const [cp, name] of Object.entries(KITTY_CODEPOINT_MAP)) {
  NAME_TO_KITTY_CODEPOINT[name] = Number(cp)
}

/** Playwright-style key name → Kitty key name for special keys */
const PLAYWRIGHT_TO_KITTY_NAME: Record<string, string> = {
  Enter: "return",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Escape: "escape",
  Backspace: "backspace",
  Tab: "tab",
  Delete: "delete",
  Insert: "insert",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  F1: "f1",
  F2: "f2",
  F3: "f3",
  F4: "f4",
  F5: "f5",
  F6: "f6",
  F7: "f7",
  F8: "f8",
  F9: "f9",
  F10: "f10",
  F11: "f11",
  F12: "f12",
}

/**
 * Convert a Playwright-style key string to a Kitty keyboard protocol ANSI sequence.
 *
 * Format: CSI codepoint ; modifiers u
 * Where modifiers = 1 + bitfield (shift=1, alt=2, ctrl=4, super=8)
 *
 * @example
 * ```tsx
 * keyToKittyAnsi('a')            // '\x1b[97u'       (no modifiers → bare)
 * keyToKittyAnsi('Enter')        // '\x1b[13u'
 * keyToKittyAnsi('Control+c')    // '\x1b[99;5u'     (ctrl = 4, modifier = 5)
 * keyToKittyAnsi('Shift+Enter')  // '\x1b[13;2u'     (shift = 1, modifier = 2)
 * keyToKittyAnsi('ArrowUp')      // '\x1b[57358u'
 * ```
 */
export function keyToKittyAnsi(key: string): string {
  const parts = key.split("+")
  const mainKey = parts.pop()!
  const modifiers = parts.map(normalizeModifier)

  // Calculate modifier bitfield
  let mod = 0
  if (modifiers.includes("Shift")) mod |= 1
  if (modifiers.includes("Alt") || modifiers.includes("Meta")) mod |= 2
  if (modifiers.includes("Control")) mod |= 4
  if (modifiers.includes("Super")) mod |= 8
  if (modifiers.includes("Hyper")) mod |= 16

  // Resolve codepoint
  let codepoint: number

  // Check Playwright-style names first (ArrowUp → up → codepoint)
  const kittyName = PLAYWRIGHT_TO_KITTY_NAME[mainKey]
  if (kittyName) {
    codepoint = NAME_TO_KITTY_CODEPOINT[kittyName]!
  } else if (mainKey.length === 1) {
    // Single character — use its Unicode codepoint
    codepoint = mainKey.charCodeAt(0)
  } else {
    // Try lowercase as direct kitty name (e.g., "return", "escape")
    const cp = NAME_TO_KITTY_CODEPOINT[mainKey.toLowerCase()]
    if (cp !== undefined) {
      codepoint = cp
    } else {
      // Fallback: return as-is (not a kitty key)
      return keyToAnsi(key)
    }
  }

  // Format: CSI codepoint ; modifiers u (modifiers omitted when 0)
  if (mod > 0) {
    return `\x1b[${codepoint};${mod + 1}u`
  }
  return `\x1b[${codepoint}u`
}

// ============================================================================
// Raw Input Splitting
// ============================================================================

/** Grapheme segmenter for splitting non-escape text into visual characters */
const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" })

/**
 * Split raw terminal input into individual keypresses.
 *
 * When stdin.read() returns multiple characters buffered together (e.g., rapid
 * typing, paste, or auto-repeat during heavy renders), this tokenizer splits
 * them into individual keypresses so each can be parsed and handled separately.
 *
 * Uses grapheme segmentation for non-escape text, so emoji with variation
 * selectors (❤️), ZWJ sequences (👨‍👩‍👧‍👦), and combining marks stay intact.
 *
 * Handles:
 * - CSI sequences: ESC [ ... (arrow keys, function keys, Kitty protocol)
 * - SS3 sequences: ESC O + letter
 * - Meta sequences: ESC + single char
 * - Double ESC
 * - Grapheme clusters (emoji, combining marks, CJK)
 */
export function* splitRawInput(data: string): Generator<string> {
  // Single character fast path (most common case in real terminal I/O)
  if (data.length <= 1) {
    if (data.length === 1) yield data
    return
  }

  let i = 0
  let textStart = -1 // start of accumulated non-escape text

  while (i < data.length) {
    if (data.charCodeAt(i) === 0x1b) {
      // Flush accumulated text before this escape sequence
      if (textStart >= 0) {
        yield* splitGraphemes(data.slice(textStart, i))
        textStart = -1
      }

      // ESC — start of escape sequence
      if (i + 1 >= data.length) {
        // Bare ESC at end of chunk
        yield "\x1b"
        i++
        continue
      }

      const next = data.charCodeAt(i + 1)

      if (next === 0x5b) {
        // CSI sequence: ESC [ params final-byte
        // Final byte is in range 0x40-0x7E (@A-Z[\]^_`a-z{|}~)
        let j = i + 2
        while (j < data.length) {
          const c = data.charCodeAt(j)
          if (c >= 0x40 && c <= 0x7e) {
            j++ // include the final byte
            break
          }
          j++
        }
        yield data.slice(i, j)
        i = j
      } else if (next === 0x4f) {
        // SS3 sequence: ESC O + one letter
        const end = Math.min(i + 3, data.length)
        yield data.slice(i, end)
        i = end
      } else if (next === 0x1b) {
        // Double ESC
        yield "\x1b\x1b"
        i += 2
      } else {
        // Meta + single char (Alt+key)
        yield data.slice(i, i + 2)
        i += 2
      }
    } else {
      // Non-escape: accumulate into text run for grapheme splitting
      if (textStart < 0) textStart = i
      i++
    }
  }

  // Flush final text run
  if (textStart >= 0) {
    yield* splitGraphemes(data.slice(textStart))
  }
}

/** Split a non-escape text run into grapheme clusters */
function* splitGraphemes(text: string): Generator<string> {
  for (const { segment } of graphemeSegmenter.segment(text)) {
    yield segment
  }
}
