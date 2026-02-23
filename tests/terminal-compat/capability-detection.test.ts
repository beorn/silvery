/**
 * Terminal Capability Detection Tests
 *
 * Verifies that detectTerminalCaps() correctly identifies capabilities
 * for various terminal emulators based on environment variables.
 *
 * Each terminal is tested by mocking TERM, TERM_PROGRAM, and COLORTERM
 * to match what that terminal sets in practice.
 */

import { afterEach, describe, expect, test } from "vitest";
import {
	detectTerminalCaps,
	type TerminalCaps,
} from "../../src/terminal-caps.js";

// ============================================================================
// Helpers
// ============================================================================

const savedEnv = { ...process.env };

afterEach(() => {
	process.env = { ...savedEnv };
});

/** Set env vars for a terminal, clearing others that might interfere */
function setTerminalEnv(vars: Record<string, string | undefined>): void {
	// Clear detection-relevant vars
	delete process.env.TERM;
	delete process.env.TERM_PROGRAM;
	delete process.env.COLORTERM;
	delete process.env.NO_COLOR;

	for (const [key, value] of Object.entries(vars)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

// ============================================================================
// Terminal-Specific Detection
// ============================================================================

describe("detectTerminalCaps", () => {
	describe("Ghostty", () => {
		test("detects full capabilities", () => {
			setTerminalEnv({
				TERM: "xterm-ghostty",
				TERM_PROGRAM: "ghostty",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			expect(caps.program).toBe("ghostty");
			expect(caps.colorLevel).toBe("truecolor");
			expect(caps.kittyKeyboard).toBe(true);
			expect(caps.kittyGraphics).toBe(true);
			expect(caps.osc52).toBe(true);
			expect(caps.hyperlinks).toBe(true);
			expect(caps.syncOutput).toBe(true);
			expect(caps.bracketedPaste).toBe(true);
			expect(caps.mouse).toBe(true);
		});

		test("sixel is not reported for Ghostty", () => {
			setTerminalEnv({ TERM_PROGRAM: "ghostty", COLORTERM: "truecolor" });
			const caps = detectTerminalCaps();
			expect(caps.sixel).toBe(false);
		});

		test("notifications are not reported for Ghostty", () => {
			setTerminalEnv({ TERM_PROGRAM: "ghostty", COLORTERM: "truecolor" });
			const caps = detectTerminalCaps();
			// Ghostty doesn't implement OSC 9 or OSC 99
			expect(caps.notifications).toBe(false);
		});
	});

	describe("iTerm2", () => {
		test("detects full capabilities", () => {
			setTerminalEnv({
				TERM: "xterm-256color",
				TERM_PROGRAM: "iTerm.app",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			expect(caps.program).toBe("iTerm.app");
			expect(caps.colorLevel).toBe("truecolor");
			expect(caps.kittyKeyboard).toBe(false); // iTerm2 doesn't support kitty keyboard
			expect(caps.osc52).toBe(true);
			expect(caps.hyperlinks).toBe(true);
			expect(caps.notifications).toBe(true); // OSC 9
			expect(caps.syncOutput).toBe(true);
			expect(caps.bracketedPaste).toBe(true);
			expect(caps.mouse).toBe(true);
		});

		test("kittyGraphics is not reported for iTerm2", () => {
			setTerminalEnv({ TERM_PROGRAM: "iTerm.app", COLORTERM: "truecolor" });
			const caps = detectTerminalCaps();
			// iTerm2 has its own image protocol, not kitty graphics
			expect(caps.kittyGraphics).toBe(false);
		});

		test("sixel is not reported for iTerm2", () => {
			setTerminalEnv({ TERM_PROGRAM: "iTerm.app", COLORTERM: "truecolor" });
			const caps = detectTerminalCaps();
			expect(caps.sixel).toBe(false);
		});
	});

	describe("kitty", () => {
		test("detects full capabilities", () => {
			setTerminalEnv({
				TERM: "xterm-kitty",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			expect(caps.term).toBe("xterm-kitty");
			expect(caps.colorLevel).toBe("truecolor");
			expect(caps.kittyKeyboard).toBe(true);
			expect(caps.kittyGraphics).toBe(true);
			expect(caps.osc52).toBe(true);
			expect(caps.hyperlinks).toBe(true);
			expect(caps.notifications).toBe(true); // OSC 99
			expect(caps.syncOutput).toBe(true);
			expect(caps.bracketedPaste).toBe(true);
			expect(caps.mouse).toBe(true);
		});

		test("sixel is not reported for kitty", () => {
			setTerminalEnv({ TERM: "xterm-kitty", COLORTERM: "truecolor" });
			const caps = detectTerminalCaps();
			// kitty uses its own graphics protocol, not sixel
			expect(caps.sixel).toBe(false);
		});
	});

	describe("Alacritty", () => {
		test("detects capabilities (no kitty keyboard, no images)", () => {
			setTerminalEnv({
				TERM: "alacritty",
				TERM_PROGRAM: "Alacritty",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			expect(caps.program).toBe("Alacritty");
			expect(caps.colorLevel).toBe("truecolor");
			expect(caps.kittyKeyboard).toBe(false);
			expect(caps.kittyGraphics).toBe(false);
			expect(caps.sixel).toBe(false);
			expect(caps.osc52).toBe(true);
			expect(caps.hyperlinks).toBe(true);
			expect(caps.syncOutput).toBe(true);
			expect(caps.bracketedPaste).toBe(true);
			expect(caps.mouse).toBe(true);
		});

		test("notifications are not reported for Alacritty", () => {
			setTerminalEnv({ TERM_PROGRAM: "Alacritty", COLORTERM: "truecolor" });
			const caps = detectTerminalCaps();
			expect(caps.notifications).toBe(false);
		});
	});

	describe("Terminal.app (macOS)", () => {
		test("detects limited capabilities", () => {
			setTerminalEnv({
				TERM: "xterm-256color",
				TERM_PROGRAM: "Apple_Terminal",
			});

			const caps = detectTerminalCaps();

			expect(caps.program).toBe("Apple_Terminal");
			expect(caps.colorLevel).toBe("256"); // From TERM, no COLORTERM
			expect(caps.kittyKeyboard).toBe(false);
			expect(caps.kittyGraphics).toBe(false);
			expect(caps.sixel).toBe(false);
			expect(caps.osc52).toBe(false); // Terminal.app doesn't support OSC 52
			expect(caps.hyperlinks).toBe(false);
			expect(caps.notifications).toBe(false);
			expect(caps.syncOutput).toBe(false);
		});
	});

	describe("WezTerm", () => {
		test("detects full capabilities", () => {
			setTerminalEnv({
				TERM: "xterm-256color",
				TERM_PROGRAM: "WezTerm",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			expect(caps.program).toBe("WezTerm");
			expect(caps.colorLevel).toBe("truecolor");
			expect(caps.kittyKeyboard).toBe(true);
			expect(caps.osc52).toBe(true);
			expect(caps.hyperlinks).toBe(true);
			expect(caps.syncOutput).toBe(true);
			expect(caps.sixel).toBe(true); // WezTerm supports sixel
		});
	});

	describe("foot", () => {
		test("detects full capabilities via TERM=foot", () => {
			setTerminalEnv({
				TERM: "foot",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			expect(caps.term).toBe("foot");
			expect(caps.colorLevel).toBe("truecolor");
			expect(caps.kittyKeyboard).toBe(true);
			expect(caps.osc52).toBe(true);
			expect(caps.hyperlinks).toBe(true);
			expect(caps.syncOutput).toBe(true);
			expect(caps.sixel).toBe(true); // foot supports sixel
		});

		test("detects via TERM=foot-extra", () => {
			setTerminalEnv({ TERM: "foot-extra", COLORTERM: "truecolor" });
			const caps = detectTerminalCaps();
			expect(caps.kittyKeyboard).toBe(true);
			expect(caps.sixel).toBe(true);
		});
	});

	describe("VS Code integrated terminal", () => {
		test("detects capabilities via TERM_PROGRAM=vscode", () => {
			setTerminalEnv({
				TERM: "xterm-256color",
				TERM_PROGRAM: "vscode",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			expect(caps.program).toBe("vscode");
			expect(caps.colorLevel).toBe("truecolor");
			expect(caps.kittyKeyboard).toBe(false);
			expect(caps.kittyGraphics).toBe(false);
			expect(caps.sixel).toBe(false);
			expect(caps.bracketedPaste).toBe(true);
			expect(caps.mouse).toBe(true);
		});
	});

	describe("tmux", () => {
		test("color level depends on COLORTERM passthrough", () => {
			setTerminalEnv({
				TERM: "tmux-256color",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			// tmux passes through COLORTERM from outer terminal
			expect(caps.colorLevel).toBe("truecolor");
		});

		test("256 color when COLORTERM not set", () => {
			setTerminalEnv({
				TERM: "tmux-256color",
			});

			const caps = detectTerminalCaps();

			expect(caps.colorLevel).toBe("256");
		});

		test("no kitty keyboard in tmux", () => {
			setTerminalEnv({
				TERM: "tmux-256color",
				COLORTERM: "truecolor",
			});

			const caps = detectTerminalCaps();

			// tmux doesn't pass through kitty keyboard protocol
			expect(caps.kittyKeyboard).toBe(false);
		});
	});

	describe("CI / headless (TERM=dumb)", () => {
		test("minimal capabilities with TERM=dumb", () => {
			setTerminalEnv({
				TERM: "dumb",
			});

			const caps = detectTerminalCaps();

			expect(caps.term).toBe("dumb");
			expect(caps.kittyKeyboard).toBe(false);
			expect(caps.kittyGraphics).toBe(false);
			expect(caps.sixel).toBe(false);
			expect(caps.osc52).toBe(false);
			expect(caps.hyperlinks).toBe(false);
			expect(caps.notifications).toBe(false);
			expect(caps.syncOutput).toBe(false);
		});

		test("no TERM at all (empty string)", () => {
			setTerminalEnv({});
			const caps = detectTerminalCaps();

			expect(caps.term).toBe("");
			expect(caps.program).toBe("");
			expect(caps.kittyKeyboard).toBe(false);
			expect(caps.kittyGraphics).toBe(false);
		});
	});

	// ============================================================================
	// Color Detection
	// ============================================================================

	describe("color detection", () => {
		test("truecolor from COLORTERM=truecolor", () => {
			setTerminalEnv({ COLORTERM: "truecolor" });
			expect(detectTerminalCaps().colorLevel).toBe("truecolor");
		});

		test("truecolor from COLORTERM=24bit", () => {
			setTerminalEnv({ COLORTERM: "24bit" });
			expect(detectTerminalCaps().colorLevel).toBe("truecolor");
		});

		test("256 from TERM containing 256color", () => {
			setTerminalEnv({ TERM: "xterm-256color" });
			expect(detectTerminalCaps().colorLevel).toBe("256");
		});

		test("none when NO_COLOR is set", () => {
			setTerminalEnv({ NO_COLOR: "1", COLORTERM: "truecolor" });
			expect(detectTerminalCaps().colorLevel).toBe("none");
		});

		test("none when NO_COLOR is empty string (still counts as set)", () => {
			setTerminalEnv({ NO_COLOR: "", COLORTERM: "truecolor" });
			expect(detectTerminalCaps().colorLevel).toBe("none");
		});
	});

	// ============================================================================
	// Cross-Terminal Capability Matrix Verification
	// ============================================================================

	describe("capability matrix consistency", () => {
		type TerminalProfile = {
			env: Record<string, string>;
			expected: Partial<TerminalCaps>;
		};

		const profiles: Record<string, TerminalProfile> = {
			ghostty: {
				env: { TERM_PROGRAM: "ghostty", COLORTERM: "truecolor" },
				expected: {
					kittyKeyboard: true,
					kittyGraphics: true,
					sixel: false,
					osc52: true,
					hyperlinks: true,
					syncOutput: true,
				},
			},
			kitty: {
				env: { TERM: "xterm-kitty", COLORTERM: "truecolor" },
				expected: {
					kittyKeyboard: true,
					kittyGraphics: true,
					sixel: false,
					osc52: true,
					hyperlinks: true,
					notifications: true,
					syncOutput: true,
				},
			},
			iterm2: {
				env: { TERM_PROGRAM: "iTerm.app", COLORTERM: "truecolor" },
				expected: {
					kittyKeyboard: false,
					kittyGraphics: false,
					sixel: false,
					osc52: true,
					hyperlinks: true,
					notifications: true,
					syncOutput: true,
				},
			},
			alacritty: {
				env: { TERM_PROGRAM: "Alacritty", COLORTERM: "truecolor" },
				expected: {
					kittyKeyboard: false,
					kittyGraphics: false,
					sixel: false,
					osc52: true,
					hyperlinks: true,
					notifications: false,
					syncOutput: true,
				},
			},
			wezterm: {
				env: { TERM_PROGRAM: "WezTerm", COLORTERM: "truecolor" },
				expected: {
					kittyKeyboard: true,
					kittyGraphics: false,
					sixel: true,
					osc52: true,
					hyperlinks: true,
					syncOutput: true,
				},
			},
			foot: {
				env: { TERM: "foot", COLORTERM: "truecolor" },
				expected: {
					kittyKeyboard: true,
					kittyGraphics: false,
					sixel: true,
					osc52: true,
					hyperlinks: true,
					syncOutput: true,
				},
			},
		};

		for (const [name, profile] of Object.entries(profiles)) {
			test(`${name}: matches expected capability profile`, () => {
				setTerminalEnv(profile.env);
				const caps = detectTerminalCaps();

				for (const [key, value] of Object.entries(profile.expected)) {
					expect(caps[key as keyof TerminalCaps], `${name}.${key}`).toBe(value);
				}
			});
		}

		test("all modern terminals support bracketedPaste and mouse", () => {
			for (const [name, profile] of Object.entries(profiles)) {
				setTerminalEnv(profile.env);
				const caps = detectTerminalCaps();
				expect(caps.bracketedPaste, `${name}.bracketedPaste`).toBe(true);
				expect(caps.mouse, `${name}.mouse`).toBe(true);
			}
		});

		test("all modern terminals support unicode", () => {
			for (const [name, profile] of Object.entries(profiles)) {
				setTerminalEnv(profile.env);
				const caps = detectTerminalCaps();
				expect(caps.unicode, `${name}.unicode`).toBe(true);
			}
		});
	});
});
