/**
 * Key parsing for inkx-loop runtime.
 *
 * Parses raw terminal input into structured Key objects.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Key object describing which special keys/modifiers were pressed.
 */
export interface Key {
	/** Up arrow key was pressed */
	upArrow: boolean;
	/** Down arrow key was pressed */
	downArrow: boolean;
	/** Left arrow key was pressed */
	leftArrow: boolean;
	/** Right arrow key was pressed */
	rightArrow: boolean;
	/** Page Down key was pressed */
	pageDown: boolean;
	/** Page Up key was pressed */
	pageUp: boolean;
	/** Home key was pressed */
	home: boolean;
	/** End key was pressed */
	end: boolean;
	/** Return (Enter) key was pressed */
	return: boolean;
	/** Escape key was pressed */
	escape: boolean;
	/** Ctrl key was pressed */
	ctrl: boolean;
	/** Shift key was pressed */
	shift: boolean;
	/** Tab key was pressed */
	tab: boolean;
	/** Backspace key was pressed */
	backspace: boolean;
	/** Delete key was pressed */
	delete: boolean;
	/** Meta key (Cmd on macOS, Win on Windows) was pressed */
	meta: boolean;
}

/**
 * Input handler callback type.
 * Return 'exit' to exit the app.
 */
export type InputHandler = (input: string, key: Key) => void | 'exit';

// ============================================================================
// Key Mappings
// ============================================================================

/**
 * ANSI escape code suffix → key name mapping.
 */
const CODE_TO_KEY: Record<string, string> = {
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

const NON_ALPHANUMERIC_KEYS = [
	...Object.values(CODE_TO_KEY),
	'backspace',
	'return',
	'enter',
	'tab',
	'escape',
	'delete',
	// Note: 'space' is intentionally NOT included - users typically want ' ' as input
];

const SHIFT_CODES = new Set([
	'[a',
	'[b',
	'[c',
	'[d',
	'[e',
	'[2$',
	'[3$',
	'[5$',
	'[6$',
	'[7$',
	'[8$',
	'[Z',
]);

const CTRL_CODES = new Set([
	'Oa',
	'Ob',
	'Oc',
	'Od',
	'Oe',
	'[2^',
	'[3^',
	'[5^',
	'[6^',
	'[7^',
	'[8^',
]);

const META_KEY_CODE_RE = /^(?:\x1b)([a-zA-Z0-9])$/;
const FN_KEY_RE = /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;

// ============================================================================
// Key Parsing
// ============================================================================

interface ParsedKeypress {
	name: string;
	ctrl: boolean;
	meta: boolean;
	shift: boolean;
	option: boolean;
	sequence: string;
	code?: string;
}

/**
 * Parse a raw input sequence into a structured keypress object.
 */
function parseKeypress(s: string): ParsedKeypress {
	const input = s ?? '';

	const key: ParsedKeypress = {
		name: '',
		ctrl: false,
		meta: false,
		shift: false,
		option: false,
		sequence: input,
	};

	if (input === '\r') {
		key.name = 'return';
	} else if (input === '\n') {
		key.name = 'enter';
	} else if (input === '\t') {
		key.name = 'tab';
	} else if (input === '\b' || input === '\x1b\b') {
		key.name = 'backspace';
		key.meta = input.charAt(0) === '\x1b';
	} else if (input === '\x7f' || input === '\x1b\x7f') {
		// Modern terminals send \x7f for Backspace key (not \x08).
		// The actual Delete key sends \x1b[3~ (handled by CODE_TO_KEY).
		key.name = 'backspace';
		key.meta = input.charAt(0) === '\x1b';
	} else if (input === '\x1b' || input === '\x1b\x1b') {
		key.name = 'escape';
		key.meta = input.length === 2;
	} else if (input === ' ' || input === '\x1b ') {
		key.name = 'space';
		key.meta = input.length === 2;
	} else if (input.length === 1 && input <= '\x1a') {
		// ctrl+letter
		key.name = String.fromCharCode(input.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
		key.ctrl = true;
	} else if (input.length === 1 && input >= '0' && input <= '9') {
		key.name = 'number';
	} else if (input.length === 1 && input >= 'a' && input <= 'z') {
		key.name = input;
	} else if (input.length === 1 && input >= 'A' && input <= 'Z') {
		key.name = input.toLowerCase();
		key.shift = true;
	} else {
		let parts = META_KEY_CODE_RE.exec(input);
		if (parts) {
			key.meta = true;
			key.shift = /^[A-Z]$/.test(parts[1] ?? '');
		} else {
			parts = FN_KEY_RE.exec(input);
			if (parts) {
				const segs = input.split('');
				if (segs[0] === '\u001b' && segs[1] === '\u001b') {
					key.option = true;
				}

				// Reassemble key code
				const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join('');
				const modifier = (Number(parts[3] || parts[5] || 1) - 1) as number;

				key.ctrl = !!(modifier & 4);
				key.meta = !!(modifier & 10);
				key.shift = !!(modifier & 1);
				key.code = code;
				key.name = CODE_TO_KEY[code] ?? '';
				key.shift = SHIFT_CODES.has(code) || key.shift;
				key.ctrl = CTRL_CODES.has(code) || key.ctrl;
			}
		}
	}

	return key;
}

/**
 * Parse raw terminal input into a Key object and cleaned input string.
 *
 * @param rawInput Raw terminal input string
 * @returns Tuple of [cleanedInput, Key]
 */
export function parseKey(rawInput: string): [string, Key] {
	const keypress = parseKeypress(rawInput);

	const key: Key = {
		upArrow: keypress.name === 'up',
		downArrow: keypress.name === 'down',
		leftArrow: keypress.name === 'left',
		rightArrow: keypress.name === 'right',
		pageDown: keypress.name === 'pagedown',
		pageUp: keypress.name === 'pageup',
		home: keypress.name === 'home',
		end: keypress.name === 'end',
		return: keypress.name === 'return',
		escape: keypress.name === 'escape',
		ctrl: keypress.ctrl,
		shift: keypress.shift,
		tab: keypress.name === 'tab',
		backspace: keypress.name === 'backspace',
		delete: keypress.name === 'delete',
		meta: keypress.meta || keypress.name === 'escape' || keypress.option,
	};

	let input = keypress.ctrl ? keypress.name : keypress.sequence;

	if (NON_ALPHANUMERIC_KEYS.includes(keypress.name)) {
		input = '';
	}

	// Strip meta prefix if remaining
	if (input.startsWith('\u001b')) {
		input = input.slice(1);
	}

	// Detect shift for uppercase letters
	if (input.length === 1 && typeof input[0] === 'string' && /[A-Z]/.test(input[0])) {
		key.shift = true;
	}

	return [input, key];
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
	};
}
