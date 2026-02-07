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
  /** Meta key (Cmd on macOS, Win on Windows) was pressed */
  meta: boolean
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
}

const MODIFIER_ALIASES: Record<string, string> = {
  ctrl: "Control",
  control: "Control",
  shift: "Shift",
  alt: "Alt",
  meta: "Meta",
  cmd: "Meta",
  option: "Alt",
}

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

  // Single char without modifiers
  if (!modifiers.length && mainKey.length === 1) {
    return mainKey
  }

  // Ctrl+letter -> control code (ASCII 1-26)
  if (modifiers.includes("Control") && mainKey.length === 1) {
    const code = mainKey.toLowerCase().charCodeAt(0) - 96
    if (code >= 1 && code <= 26) return String.fromCharCode(code)
  }

  // Alt+key -> ESC prefix (standard terminal convention)
  // Alt/Meta/Option keys send ESC followed by the key
  if (
    (modifiers.includes("Alt") || modifiers.includes("Meta")) &&
    mainKey.length === 1
  ) {
    return `\x1b${mainKey}`
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

const SHIFT_CODES = new Set([
  "[a",
  "[b",
  "[c",
  "[d",
  "[e",
  "[2$",
  "[3$",
  "[5$",
  "[6$",
  "[7$",
  "[8$",
  "[Z",
])

const CTRL_CODES = new Set([
  "Oa",
  "Ob",
  "Oc",
  "Od",
  "Oe",
  "[2^",
  "[3^",
  "[5^",
  "[6^",
  "[7^",
  "[8^",
])

const META_KEY_CODE_RE = /^(?:\x1b)([a-zA-Z0-9])$/
const FN_KEY_RE =
  /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/

// ============================================================================
// Key Parsing
// ============================================================================

export interface ParsedKeypress {
  name: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  option: boolean
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
    sequence: input,
  }

  if (input === "\r") {
    key.name = "return"
  } else if (input === "\n") {
    key.name = "enter"
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
  } else if (input.length === 1 && input >= "0" && input <= "9") {
    key.name = "number"
  } else if (input.length === 1 && input >= "a" && input <= "z") {
    key.name = input
  } else if (input.length === 1 && input >= "A" && input <= "Z") {
    key.name = input.toLowerCase()
    key.shift = true
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
        const code = [parts[1], parts[2], parts[4], parts[6]]
          .filter(Boolean)
          .join("")
        const modifier = (Number(parts[3] || parts[5] || 1) - 1) as number

        key.ctrl = !!(modifier & 4)
        key.meta = !!(modifier & 10)
        key.shift = !!(modifier & 1)
        key.code = code
        key.name = CODE_TO_KEY[code] ?? ""
        key.shift = SHIFT_CODES.has(code) || key.shift
        key.ctrl = CTRL_CODES.has(code) || key.ctrl
      }
    }
  }

  return key
}

/**
 * Parse raw terminal input into a Key object and cleaned input string.
 *
 * @param rawInput Raw terminal input string
 * @returns Tuple of [cleanedInput, Key]
 */
export function parseKey(rawInput: string): [string, Key] {
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
    meta: keypress.meta || keypress.name === "escape" || keypress.option,
  }

  let input = keypress.ctrl ? keypress.name : keypress.sequence

  if (NON_ALPHANUMERIC_KEYS.includes(keypress.name)) {
    input = ""
  }

  // Strip meta prefix if remaining
  if (input.startsWith("\u001b")) {
    input = input.slice(1)
  }

  // Detect shift for uppercase letters
  if (
    input.length === 1 &&
    typeof input[0] === "string" &&
    /[A-Z]/.test(input[0])
  ) {
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
} {
  return {
    ctrl: !!key.ctrl,
    meta: !!key.meta,
    shift: !!key.shift,
    alt: false,
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
 * ```
 */
export function parseHotkey(keyStr: string): ParsedHotkey {
  const parts = keyStr.split("+")
  const key = parts.pop() || keyStr
  const modifiers = new Set(parts.map((p) => p.toLowerCase()))

  return {
    key,
    ctrl: modifiers.has("control") || modifiers.has("ctrl"),
    meta:
      modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt") || modifiers.has("option"),
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
export function matchHotkey(
  hotkey: ParsedHotkey,
  key: Key,
  input?: string,
): boolean {
  // Check modifiers
  if (!!hotkey.ctrl !== !!key.ctrl) return false
  if (!!hotkey.meta !== !!key.meta) return false
  if (!!hotkey.alt !== false) return false // terminals can't distinguish alt from meta

  // For single uppercase letters (A-Z), shift is implicit
  const isUppercaseLetter =
    hotkey.key.length === 1 &&
    hotkey.key >= "A" &&
    hotkey.key <= "Z" &&
    !hotkey.shift
  if (!isUppercaseLetter && !!hotkey.shift !== !!key.shift) return false

  // Check key name against Key boolean fields
  const name = keyToName(key)
  if (name && name === hotkey.key) return true

  // Check against input string
  if (input !== undefined && input === hotkey.key) return true

  return false
}
