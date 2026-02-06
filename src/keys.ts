/**
 * Keyboard Constants and Utilities
 *
 * Playwright-compatible key names mapped to ANSI sequences.
 * Provides bidirectional mapping for keyboard handling.
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
// Key → ANSI Mapping (for sending input)
// ============================================================================

/**
 * Playwright-compatible key names → ANSI sequences.
 * Keys that are modifier-only (Control, Shift, etc.) are null.
 */
const KEY_MAP: Record<string, string | null> = {
	// Navigation (Playwright names)
	ArrowUp: '\x1b[A',
	ArrowDown: '\x1b[B',
	ArrowLeft: '\x1b[D',
	ArrowRight: '\x1b[C',
	Home: '\x1b[H',
	End: '\x1b[F',
	PageUp: '\x1b[5~',
	PageDown: '\x1b[6~',

	// Editing
	Enter: '\r',
	Tab: '\t',
	Backspace: '\x08',
	Delete: '\x7f',
	Escape: '\x1b',
	Space: ' ',

	// Modifiers (prefix only, not standalone sequences)
	Control: null,
	Shift: null,
	Alt: null,
	Meta: null,
};

const MODIFIER_ALIASES: Record<string, string> = {
	ctrl: 'Control',
	control: 'Control',
	shift: 'Shift',
	alt: 'Alt',
	meta: 'Meta',
	cmd: 'Meta',
	option: 'Alt',
};

function normalizeModifier(mod: string): string {
	return MODIFIER_ALIASES[mod.toLowerCase()] ?? mod;
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
	// Split on + for combos: 'Control+Shift+a' → ['Control', 'Shift', 'a']
	const parts = key.split('+');
	const mainKey = parts.pop()!;
	// Normalize modifier aliases: ctrl→Control, shift→Shift, alt→Alt, meta→Meta
	const modifiers = parts.map(normalizeModifier);

	// Single char without modifiers
	if (!modifiers.length && mainKey.length === 1) {
		return mainKey;
	}

	// Ctrl+letter → control code (ASCII 1-26)
	if (modifiers.includes('Control') && mainKey.length === 1) {
		const code = mainKey.toLowerCase().charCodeAt(0) - 96;
		if (code >= 1 && code <= 26) return String.fromCharCode(code);
	}

	// Alt+key → ESC prefix (standard terminal convention)
	// Alt/Meta/Option keys send ESC followed by the key
	if ((modifiers.includes('Alt') || modifiers.includes('Meta')) && mainKey.length === 1) {
		return `\x1b${mainKey}`;
	}

	// Look up base key in map
	const base = KEY_MAP[mainKey];
	if (base !== undefined && base !== null) return base;

	// Fallback: return as-is (single char or unknown key)
	return mainKey;
}

// ============================================================================
// ANSI → Key Mapping (for parsing input)
// ============================================================================

/**
 * ANSI escape code suffix → key name mapping.
 * Used by useInput to parse incoming key sequences.
 *
 * The key is the escape sequence suffix (after ESC or ESC[).
 * Multiple terminal emulators may use different sequences for the same key.
 */
export const CODE_TO_KEY: Record<string, string> = {
	// Arrow keys (xterm ESC [ letter)
	'[A': 'up',
	'[B': 'down',
	'[C': 'right',
	'[D': 'left',
	'[E': 'clear',
	'[F': 'end',
	'[H': 'home',

	// Arrow keys (xterm/gnome ESC O letter)
	OA: 'up',
	OB: 'down',
	OC: 'right',
	OD: 'left',
	OE: 'clear',
	OF: 'end',
	OH: 'home',

	// Function keys (xterm/gnome ESC O letter)
	OP: 'f1',
	OQ: 'f2',
	OR: 'f3',
	OS: 'f4',

	// Function keys (xterm/rxvt ESC [ number ~)
	'[11~': 'f1',
	'[12~': 'f2',
	'[13~': 'f3',
	'[14~': 'f4',
	'[15~': 'f5',
	'[17~': 'f6',
	'[18~': 'f7',
	'[19~': 'f8',
	'[20~': 'f9',
	'[21~': 'f10',
	'[23~': 'f11',
	'[24~': 'f12',

	// Function keys (Cygwin/libuv)
	'[[A': 'f1',
	'[[B': 'f2',
	'[[C': 'f3',
	'[[D': 'f4',
	'[[E': 'f5',

	// Navigation keys (xterm/rxvt ESC [ number ~)
	'[1~': 'home',
	'[2~': 'insert',
	'[3~': 'delete',
	'[4~': 'end',
	'[5~': 'pageup',
	'[6~': 'pagedown',

	// Navigation keys (putty)
	'[[5~': 'pageup',
	'[[6~': 'pagedown',

	// Navigation keys (rxvt)
	'[7~': 'home',
	'[8~': 'end',

	// Arrow keys with shift (rxvt lowercase)
	'[a': 'up',
	'[b': 'down',
	'[c': 'right',
	'[d': 'left',
	'[e': 'clear',

	// Navigation keys with shift (rxvt $)
	'[2$': 'insert',
	'[3$': 'delete',
	'[5$': 'pageup',
	'[6$': 'pagedown',
	'[7$': 'home',
	'[8$': 'end',

	// Arrow keys with ctrl (rxvt O lowercase)
	Oa: 'up',
	Ob: 'down',
	Oc: 'right',
	Od: 'left',
	Oe: 'clear',

	// Navigation keys with ctrl (rxvt ^)
	'[2^': 'insert',
	'[3^': 'delete',
	'[5^': 'pageup',
	'[6^': 'pagedown',
	'[7^': 'home',
	'[8^': 'end',

	// Shift+Tab
	'[Z': 'tab',
};
