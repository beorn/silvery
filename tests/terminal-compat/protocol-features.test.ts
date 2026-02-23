/**
 * Terminal Protocol Feature Tests
 *
 * Verifies that escape sequence generators produce correct ANSI codes
 * for all terminal protocols supported by inkx.
 *
 * These are pure unit tests -- they don't require a terminal, just verify
 * that the string output matches the expected escape sequences.
 */

import { afterEach, describe, expect, test } from "vitest";
import {
	ANSI,
	KittyFlags,
	enableKittyKeyboard,
	disableKittyKeyboard,
	queryKittyKeyboard,
} from "../../src/output.js";
import { enableMouse, disableMouse } from "../../src/output.js";
import {
	PASTE_START,
	PASTE_END,
	enableBracketedPaste,
	disableBracketedPaste,
	parseBracketedPaste,
} from "../../src/bracketed-paste.js";
import {
	copyToClipboard,
	requestClipboard,
	parseClipboardResponse,
} from "../../src/clipboard.js";
import {
	setScrollRegion,
	resetScrollRegion,
	scrollUp,
	scrollDown,
	supportsScrollRegions,
} from "../../src/scroll-region.js";
import { Writable } from "node:stream";

// ============================================================================
// Helpers
// ============================================================================

const ESC = "\x1b";
const CSI = `${ESC}[`;

/** Create a mock stdout that captures writes */
function createMockStdout(): NodeJS.WriteStream & { written: string } {
	const chunks: string[] = [];
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(chunk.toString());
			callback();
		},
	}) as NodeJS.WriteStream & { written: string };

	Object.defineProperty(stream, "written", {
		get: () => chunks.join(""),
	});

	return stream;
}

// ============================================================================
// ANSI Escape Constants
// ============================================================================

describe("ANSI escape constants", () => {
	test("CSI is ESC [", () => {
		expect(ANSI.CSI).toBe("\x1b[");
	});

	test("cursor control sequences", () => {
		expect(ANSI.CURSOR_HIDE).toBe(`${CSI}?25l`);
		expect(ANSI.CURSOR_SHOW).toBe(`${CSI}?25h`);
		expect(ANSI.CURSOR_HOME).toBe(`${CSI}H`);
	});

	test("synchronized output sequences (DEC 2026)", () => {
		expect(ANSI.SYNC_BEGIN).toBe(`${CSI}?2026h`);
		expect(ANSI.SYNC_END).toBe(`${CSI}?2026l`);
	});

	test("SGR reset", () => {
		expect(ANSI.RESET).toBe(`${CSI}0m`);
	});
});

// ============================================================================
// Cursor Movement
// ============================================================================

describe("cursor movement sequences", () => {
	test("moveCursor generates CUP (Cursor Position)", () => {
		// moveCursor takes 0-indexed coords, output is 1-indexed
		expect(ANSI.moveCursor(0, 0)).toBe(`${CSI}1;1H`);
		expect(ANSI.moveCursor(9, 4)).toBe(`${CSI}5;10H`);
		expect(ANSI.moveCursor(79, 23)).toBe(`${CSI}24;80H`);
	});

	test("cursorUp generates CUU (Cursor Up)", () => {
		expect(ANSI.cursorUp(1)).toBe(`${CSI}A`);
		expect(ANSI.cursorUp(5)).toBe(`${CSI}5A`);
		expect(ANSI.cursorUp(0)).toBe("");
	});

	test("cursorDown generates CUD (Cursor Down)", () => {
		expect(ANSI.cursorDown(1)).toBe(`${CSI}B`);
		expect(ANSI.cursorDown(5)).toBe(`${CSI}5B`);
		expect(ANSI.cursorDown(0)).toBe("");
	});

	test("cursorRight generates CUF (Cursor Forward)", () => {
		expect(ANSI.cursorRight(1)).toBe(`${CSI}C`);
		expect(ANSI.cursorRight(5)).toBe(`${CSI}5C`);
		expect(ANSI.cursorRight(0)).toBe("");
	});

	test("cursorLeft generates CUB (Cursor Back)", () => {
		expect(ANSI.cursorLeft(1)).toBe(`${CSI}D`);
		expect(ANSI.cursorLeft(5)).toBe(`${CSI}5D`);
		expect(ANSI.cursorLeft(0)).toBe("");
	});

	test("cursorToColumn generates CHA (Cursor Horizontal Absolute)", () => {
		// 0-indexed input, 1-indexed output
		expect(ANSI.cursorToColumn(0)).toBe(`${CSI}1G`);
		expect(ANSI.cursorToColumn(39)).toBe(`${CSI}40G`);
	});
});

// ============================================================================
// SGR (Select Graphic Rendition)
// ============================================================================

describe("SGR color codes", () => {
	test("standard foreground colors (30-37)", () => {
		expect(ANSI.SGR.fgBlack).toBe(30);
		expect(ANSI.SGR.fgRed).toBe(31);
		expect(ANSI.SGR.fgGreen).toBe(32);
		expect(ANSI.SGR.fgYellow).toBe(33);
		expect(ANSI.SGR.fgBlue).toBe(34);
		expect(ANSI.SGR.fgMagenta).toBe(35);
		expect(ANSI.SGR.fgCyan).toBe(36);
		expect(ANSI.SGR.fgWhite).toBe(37);
	});

	test("bright foreground colors (90-97)", () => {
		expect(ANSI.SGR.fgBrightBlack).toBe(90);
		expect(ANSI.SGR.fgBrightRed).toBe(91);
		expect(ANSI.SGR.fgBrightWhite).toBe(97);
	});

	test("standard background colors (40-47)", () => {
		expect(ANSI.SGR.bgBlack).toBe(40);
		expect(ANSI.SGR.bgRed).toBe(41);
		expect(ANSI.SGR.bgWhite).toBe(47);
	});

	test("bright background colors (100-107)", () => {
		expect(ANSI.SGR.bgBrightBlack).toBe(100);
		expect(ANSI.SGR.bgBrightWhite).toBe(107);
	});

	test("default color resets", () => {
		expect(ANSI.SGR.fgDefault).toBe(39);
		expect(ANSI.SGR.bgDefault).toBe(49);
	});

	test("256-color escape format (CSI 38;5;N m)", () => {
		// Verify the expected format for 256-color mode
		const fg256 = (n: number) => `${CSI}38;5;${n}m`;
		const bg256 = (n: number) => `${CSI}48;5;${n}m`;

		expect(fg256(196)).toBe("\x1b[38;5;196m"); // Bright red
		expect(bg256(21)).toBe("\x1b[48;5;21m"); // Blue
		expect(fg256(0)).toBe("\x1b[38;5;0m"); // Black
		expect(fg256(255)).toBe("\x1b[38;5;255m"); // White
	});

	test("truecolor escape format (CSI 38;2;R;G;B m)", () => {
		const fgRgb = (r: number, g: number, b: number) =>
			`${CSI}38;2;${r};${g};${b}m`;
		const bgRgb = (r: number, g: number, b: number) =>
			`${CSI}48;2;${r};${g};${b}m`;

		expect(fgRgb(255, 128, 64)).toBe("\x1b[38;2;255;128;64m");
		expect(bgRgb(0, 100, 200)).toBe("\x1b[48;2;0;100;200m");
	});

	test("attribute codes", () => {
		expect(ANSI.SGR.bold).toBe(1);
		expect(ANSI.SGR.dim).toBe(2);
		expect(ANSI.SGR.italic).toBe(3);
		expect(ANSI.SGR.underline).toBe(4);
		expect(ANSI.SGR.inverse).toBe(7);
		expect(ANSI.SGR.strikethrough).toBe(9);
	});

	test("attribute reset codes", () => {
		expect(ANSI.SGR.boldOff).toBe(22);
		expect(ANSI.SGR.italicOff).toBe(23);
		expect(ANSI.SGR.underlineOff).toBe(24);
		expect(ANSI.SGR.inverseOff).toBe(27);
		expect(ANSI.SGR.strikethroughOff).toBe(29);
	});
});

// ============================================================================
// Kitty Keyboard Protocol
// ============================================================================

describe("Kitty keyboard protocol sequences", () => {
	test("KittyFlags are correct bit values", () => {
		expect(KittyFlags.DISAMBIGUATE).toBe(1);
		expect(KittyFlags.REPORT_EVENTS).toBe(2);
		expect(KittyFlags.REPORT_ALTERNATE).toBe(4);
		expect(KittyFlags.REPORT_ALL_KEYS).toBe(8);
		expect(KittyFlags.REPORT_TEXT).toBe(16);
	});

	test("flags can be combined as a bitfield", () => {
		const combined = KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS;
		expect(combined).toBe(3);

		const all =
			KittyFlags.DISAMBIGUATE |
			KittyFlags.REPORT_EVENTS |
			KittyFlags.REPORT_ALTERNATE |
			KittyFlags.REPORT_ALL_KEYS |
			KittyFlags.REPORT_TEXT;
		expect(all).toBe(31);
	});

	test("enableKittyKeyboard sends CSI > flags u", () => {
		// Default: DISAMBIGUATE (1)
		expect(enableKittyKeyboard()).toBe(`${CSI}>1u`);

		// Specific flags
		expect(enableKittyKeyboard(KittyFlags.DISAMBIGUATE)).toBe(`${CSI}>1u`);
		expect(
			enableKittyKeyboard(KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS),
		).toBe(`${CSI}>3u`);
		expect(enableKittyKeyboard(31)).toBe(`${CSI}>31u`);
	});

	test("queryKittyKeyboard sends CSI ? u", () => {
		expect(queryKittyKeyboard()).toBe(`${CSI}?u`);
	});

	test("disableKittyKeyboard sends CSI < u", () => {
		expect(disableKittyKeyboard()).toBe(`${CSI}<u`);
	});
});

// ============================================================================
// SGR Mouse Protocol
// ============================================================================

describe("SGR mouse protocol sequences", () => {
	test("enableMouse enables X10 + button tracking + SGR encoding", () => {
		const seq = enableMouse();

		// Should contain all three modes
		expect(seq).toContain(`${CSI}?1000h`); // X10 basic
		expect(seq).toContain(`${CSI}?1002h`); // Button tracking
		expect(seq).toContain(`${CSI}?1006h`); // SGR encoding

		// Verify order: 1000 -> 1002 -> 1006
		expect(seq).toBe(`${CSI}?1000h${CSI}?1002h${CSI}?1006h`);
	});

	test("disableMouse disables in reverse order", () => {
		const seq = disableMouse();

		// Should contain all three disable sequences
		expect(seq).toContain(`${CSI}?1006l`);
		expect(seq).toContain(`${CSI}?1002l`);
		expect(seq).toContain(`${CSI}?1000l`);

		// Verify reverse order: 1006 -> 1002 -> 1000
		expect(seq).toBe(`${CSI}?1006l${CSI}?1002l${CSI}?1000l`);
	});

	test("SGR mouse event format: CSI < button;col;row M/m", () => {
		// These are the raw sequences terminals send
		const press = `${CSI}<0;10;5M`; // Left click at col 10, row 5
		const release = `${CSI}<0;10;5m`; // Left release

		// Verify format
		expect(press).toMatch(/^\x1b\[<\d+;\d+;\d+M$/);
		expect(release).toMatch(/^\x1b\[<\d+;\d+;\d+m$/);
	});
});

// ============================================================================
// Bracketed Paste
// ============================================================================

describe("bracketed paste sequences", () => {
	test("enable sends CSI ? 2004 h", () => {
		const stdout = createMockStdout();
		enableBracketedPaste(stdout);
		expect(stdout.written).toBe(`${CSI}?2004h`);
	});

	test("disable sends CSI ? 2004 l", () => {
		const stdout = createMockStdout();
		disableBracketedPaste(stdout);
		expect(stdout.written).toBe(`${CSI}?2004l`);
	});

	test("paste start marker is CSI 200 ~", () => {
		expect(PASTE_START).toBe(`${CSI}200~`);
	});

	test("paste end marker is CSI 201 ~", () => {
		expect(PASTE_END).toBe(`${CSI}201~`);
	});

	test("parseBracketedPaste extracts content between markers", () => {
		const input = `${PASTE_START}pasted text${PASTE_END}`;
		const result = parseBracketedPaste(input);
		expect(result).toEqual({ type: "paste", content: "pasted text" });
	});

	test("parseBracketedPaste returns null without markers", () => {
		expect(parseBracketedPaste("normal input")).toBeNull();
	});
});

// ============================================================================
// OSC 52 Clipboard
// ============================================================================

describe("OSC 52 clipboard sequences", () => {
	test("copy generates ESC ] 52 ; c ; <base64> BEL", () => {
		const stdout = createMockStdout();
		copyToClipboard(stdout, "test");
		const base64 = Buffer.from("test").toString("base64");
		expect(stdout.written).toBe(`${ESC}]52;c;${base64}\x07`);
	});

	test("query generates ESC ] 52 ; c ; ? BEL", () => {
		const stdout = createMockStdout();
		requestClipboard(stdout);
		expect(stdout.written).toBe(`${ESC}]52;c;?\x07`);
	});

	test("parseClipboardResponse decodes base64 from BEL-terminated response", () => {
		const base64 = Buffer.from("clipboard content").toString("base64");
		const response = `${ESC}]52;c;${base64}\x07`;
		expect(parseClipboardResponse(response)).toBe("clipboard content");
	});

	test("parseClipboardResponse decodes base64 from ST-terminated response", () => {
		const base64 = Buffer.from("clipboard content").toString("base64");
		const response = `${ESC}]52;c;${base64}${ESC}\\`;
		expect(parseClipboardResponse(response)).toBe("clipboard content");
	});

	test("parseClipboardResponse rejects query marker as response", () => {
		expect(parseClipboardResponse(`${ESC}]52;c;?\x07`)).toBeNull();
	});
});

// ============================================================================
// DECSTBM Scroll Regions
// ============================================================================

describe("DECSTBM scroll region sequences", () => {
	test("setScrollRegion sends ESC [ top ; bottom r", () => {
		const stdout = createMockStdout();
		setScrollRegion(stdout, 5, 20);
		expect(stdout.written).toBe(`${ESC}[5;20r`);
	});

	test("resetScrollRegion sends ESC [ r", () => {
		const stdout = createMockStdout();
		resetScrollRegion(stdout);
		expect(stdout.written).toBe(`${ESC}[r`);
	});

	test("scrollUp sends ESC [ N S", () => {
		const stdout = createMockStdout();
		scrollUp(stdout, 3);
		expect(stdout.written).toBe(`${ESC}[3S`);
	});

	test("scrollDown sends ESC [ N T", () => {
		const stdout = createMockStdout();
		scrollDown(stdout, 2);
		expect(stdout.written).toBe(`${ESC}[2T`);
	});

	test("scrollUp defaults to 1 line", () => {
		const stdout = createMockStdout();
		scrollUp(stdout);
		expect(stdout.written).toBe(`${ESC}[1S`);
	});

	test("scrollDown defaults to 1 line", () => {
		const stdout = createMockStdout();
		scrollDown(stdout);
		expect(stdout.written).toBe(`${ESC}[1T`);
	});

	describe("supportsScrollRegions", () => {
		const savedEnv = { ...process.env };

		afterEach(() => {
			process.env = { ...savedEnv };
		});

		test("returns true for known-good terminal programs", () => {
			for (const prog of ["iTerm.app", "WezTerm", "ghostty", "vscode"]) {
				process.env.TERM_PROGRAM = prog;
				expect(supportsScrollRegions(), prog).toBe(true);
			}
		});

		test("returns true for xterm-compatible TERM values", () => {
			delete process.env.TERM_PROGRAM;
			for (const term of [
				"xterm-256color",
				"screen-256color",
				"tmux-256color",
				"xterm-kitty",
			]) {
				process.env.TERM = term;
				expect(supportsScrollRegions(), term).toBe(true);
			}
		});

		test("returns false for Linux console", () => {
			delete process.env.TERM_PROGRAM;
			process.env.TERM = "linux";
			expect(supportsScrollRegions()).toBe(false);
		});

		test("returns false for empty TERM", () => {
			delete process.env.TERM_PROGRAM;
			process.env.TERM = "";
			expect(supportsScrollRegions()).toBe(false);
		});
	});
});

// ============================================================================
// Alternate Screen Buffer
// ============================================================================

describe("alternate screen buffer", () => {
	test("enter/leave sequences use DEC private mode 1049", () => {
		// These are the standard sequences used by fullscreen TUI apps
		const enterAlt = `${CSI}?1049h`;
		const leaveAlt = `${CSI}?1049l`;

		expect(enterAlt).toBe("\x1b[?1049h");
		expect(leaveAlt).toBe("\x1b[?1049l");
	});
});

// ============================================================================
// Synchronized Output (DEC 2026)
// ============================================================================

describe("synchronized output (DEC 2026)", () => {
	test("begin and end sequences", () => {
		expect(ANSI.SYNC_BEGIN).toBe(`${CSI}?2026h`);
		expect(ANSI.SYNC_END).toBe(`${CSI}?2026l`);
	});

	test("wrapping content in sync markers", () => {
		const content = "Hello";
		const wrapped = `${ANSI.SYNC_BEGIN}${content}${ANSI.SYNC_END}`;
		expect(wrapped).toBe("\x1b[?2026hHello\x1b[?2026l");
	});

	test("DECRPM query for DEC 2026 support", () => {
		// Query format: CSI ? mode $ p
		const query = `${CSI}?2026$p`;
		expect(query).toBe("\x1b[?2026$p");

		// Response format: CSI ? mode ; value $ y
		// value: 0=unknown, 1=set, 2=reset, 3=permanent set, 4=permanent reset
		const responseSet = `${CSI}?2026;1$y`;
		expect(responseSet).toBe("\x1b[?2026;1$y");
	});
});
