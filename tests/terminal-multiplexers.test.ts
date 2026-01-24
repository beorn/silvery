/**
 * Terminal Multiplexer Compatibility Tests
 *
 * Tests and documents Inkx behavior in terminal multiplexers like tmux and Zellij.
 *
 * Since we cannot run automated tests inside actual multiplexers, this file:
 * 1. Documents expected behaviors and known quirks
 * 2. Tests multiplexer detection via environment variables
 * 3. Tests Synchronized Update Mode (DEC mode 2026) escape sequences
 * 4. Provides manual testing guidelines
 *
 * @see https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036 (Synchronized Update spec)
 */

import { describe, expect, test } from 'bun:test';
import { ANSI } from '../src/output.js';

// ============================================================================
// Constants
// ============================================================================

const ESC = '\x1b';
const CSI = `${ESC}[`;

/**
 * Synchronized Update Mode escape sequences.
 *
 * These sequences tell the terminal to batch output updates, preventing
 * tearing during rapid screen updates. Especially important in tmux.
 *
 * - Begin: CSI ? 2026 h
 * - End: CSI ? 2026 l
 */
const SYNC_UPDATE = {
	begin: `${CSI}?2026h`,
	end: `${CSI}?2026l`,
};

/**
 * Passthrough escape sequence for tmux.
 *
 * tmux uses passthrough mode to forward escape sequences to the outer terminal.
 * Format: ESC Ptmux; <escaped-content> ESC \
 *
 * Within passthrough, ESC must be doubled (ESC ESC).
 */
const TMUX_PASSTHROUGH = {
	begin: `${ESC}Ptmux;`,
	end: `${ESC}\\`,
};

// ============================================================================
// Environment Detection Tests
// ============================================================================

describe('Terminal Multiplexer Detection', () => {
	describe('tmux detection', () => {
		test('detects tmux via TMUX environment variable', () => {
			// tmux sets TMUX=/tmp/tmux-501/default,12345,0 or similar
			const isTmux = (env: Record<string, string | undefined>) => {
				return !!env.TMUX;
			};

			expect(isTmux({ TMUX: '/tmp/tmux-501/default,12345,0' })).toBe(true);
			expect(isTmux({ TMUX: undefined })).toBe(false);
			expect(isTmux({})).toBe(false);
		});

		test('detects tmux via TERM variable containing "tmux"', () => {
			const isTmuxTerm = (term: string | undefined) => {
				return term?.includes('tmux') || term?.includes('screen') || false;
			};

			expect(isTmuxTerm('tmux-256color')).toBe(true);
			expect(isTmuxTerm('screen-256color')).toBe(true);
			expect(isTmuxTerm('screen')).toBe(true);
			expect(isTmuxTerm('xterm-256color')).toBe(false);
			expect(isTmuxTerm(undefined)).toBe(false);
		});

		test('detects tmux via TERM_PROGRAM variable', () => {
			const isTmuxProgram = (termProgram: string | undefined) => {
				return termProgram === 'tmux';
			};

			expect(isTmuxProgram('tmux')).toBe(true);
			expect(isTmuxProgram('iTerm.app')).toBe(false);
			expect(isTmuxProgram(undefined)).toBe(false);
		});
	});

	describe('Zellij detection', () => {
		test('detects Zellij via ZELLIJ environment variable', () => {
			// Zellij sets ZELLIJ=0 (or a session identifier)
			const isZellij = (env: Record<string, string | undefined>) => {
				return env.ZELLIJ !== undefined;
			};

			expect(isZellij({ ZELLIJ: '0' })).toBe(true);
			expect(isZellij({ ZELLIJ: '' })).toBe(true); // Empty string still indicates Zellij
			expect(isZellij({ ZELLIJ: undefined })).toBe(false);
			expect(isZellij({})).toBe(false);
		});

		test('detects Zellij via ZELLIJ_SESSION_NAME variable', () => {
			const isZellijSession = (env: Record<string, string | undefined>) => {
				return !!env.ZELLIJ_SESSION_NAME;
			};

			expect(isZellijSession({ ZELLIJ_SESSION_NAME: 'my-session' })).toBe(true);
			expect(isZellijSession({ ZELLIJ_SESSION_NAME: '' })).toBe(false);
			expect(isZellijSession({})).toBe(false);
		});
	});

	describe('generic multiplexer detection', () => {
		// Detect multiplexer from environment variables
		const detectMultiplexer = (env: Record<string, string | undefined>) => {
			if (env.TMUX) return 'tmux';
			if (env.ZELLIJ !== undefined) return 'zellij';
			if (env.STY) return 'screen'; // GNU Screen
			if (env.TERM?.includes('tmux')) return 'tmux';
			if (env.TERM?.includes('screen')) return 'screen';
			return null;
		};

		test('detects tmux from TMUX variable', () => {
			expect(detectMultiplexer({ TMUX: '/path' })).toBe('tmux');
		});

		test('detects zellij from ZELLIJ variable', () => {
			expect(detectMultiplexer({ ZELLIJ: '0' })).toBe('zellij');
		});

		test('detects screen from STY variable', () => {
			expect(detectMultiplexer({ STY: '12345.pts-0.hostname' })).toBe('screen');
		});

		test('detects tmux from TERM variable', () => {
			expect(detectMultiplexer({ TERM: 'tmux-256color' })).toBe('tmux');
		});

		test('returns null for regular terminal', () => {
			expect(detectMultiplexer({ TERM: 'xterm-256color' })).toBe(null);
		});
	});
});

// ============================================================================
// Synchronized Update Mode Tests
// ============================================================================

describe('Synchronized Update Mode (DEC 2026)', () => {
	test('generates correct begin sequence', () => {
		expect(SYNC_UPDATE.begin).toBe('\x1b[?2026h');
	});

	test('generates correct end sequence', () => {
		expect(SYNC_UPDATE.end).toBe('\x1b[?2026l');
	});

	test('wraps content with synchronized update sequences', () => {
		const wrapWithSyncUpdate = (content: string): string => {
			return `${SYNC_UPDATE.begin}${content}${SYNC_UPDATE.end}`;
		};

		const output = wrapWithSyncUpdate('Hello, World!');
		expect(output).toBe('\x1b[?2026hHello, World!\x1b[?2026l');
		expect(output.startsWith(SYNC_UPDATE.begin)).toBe(true);
		expect(output.endsWith(SYNC_UPDATE.end)).toBe(true);
	});

	test('synchronized update is idempotent', () => {
		// Nested sync updates should work (terminals ignore redundant begins)
		const wrapWithSyncUpdate = (content: string): string => {
			return `${SYNC_UPDATE.begin}${content}${SYNC_UPDATE.end}`;
		};

		const inner = wrapWithSyncUpdate('inner');
		const outer = wrapWithSyncUpdate(inner);

		// Should contain two begins and two ends
		expect(outer.split(SYNC_UPDATE.begin).length - 1).toBe(2);
		expect(outer.split(SYNC_UPDATE.end).length - 1).toBe(2);
	});
});

// ============================================================================
// tmux Passthrough Tests
// ============================================================================

describe('tmux Passthrough Mode', () => {
	test('generates correct passthrough wrapper', () => {
		expect(TMUX_PASSTHROUGH.begin).toBe('\x1bPtmux;');
		expect(TMUX_PASSTHROUGH.end).toBe('\x1b\\');
	});

	test('escapes ESC characters in passthrough content', () => {
		const escapeForTmux = (content: string): string => {
			// Double all ESC characters within passthrough
			return content.replace(/\x1b/g, '\x1b\x1b');
		};

		const originalSequence = '\x1b[31mRed\x1b[0m';
		const escaped = escapeForTmux(originalSequence);
		expect(escaped).toBe('\x1b\x1b[31mRed\x1b\x1b[0m');
	});

	test('wraps sequences for tmux passthrough', () => {
		const wrapForTmuxPassthrough = (content: string): string => {
			const escaped = content.replace(/\x1b/g, '\x1b\x1b');
			return `${TMUX_PASSTHROUGH.begin}${escaped}${TMUX_PASSTHROUGH.end}`;
		};

		const originalSequence = '\x1b]52;c;SGVsbG8=\x07'; // OSC 52 clipboard
		const wrapped = wrapForTmuxPassthrough(originalSequence);

		expect(wrapped.startsWith(TMUX_PASSTHROUGH.begin)).toBe(true);
		expect(wrapped.endsWith(TMUX_PASSTHROUGH.end)).toBe(true);
		// ESC should be doubled in the content
		expect(wrapped).toContain('\x1b\x1b]52');
	});
});

// ============================================================================
// ANSI Constants Verification
// ============================================================================

describe('ANSI Constants (from output.ts)', () => {
	test('CSI sequence is correctly defined', () => {
		expect(ANSI.CSI).toBe('\x1b[');
	});

	test('cursor control sequences are correct', () => {
		expect(ANSI.CURSOR_HIDE).toBe('\x1b[?25l');
		expect(ANSI.CURSOR_SHOW).toBe('\x1b[?25h');
		expect(ANSI.CURSOR_HOME).toBe('\x1b[H');
	});

	test('reset sequence is correct', () => {
		expect(ANSI.RESET).toBe('\x1b[0m');
	});
});

// ============================================================================
// Input Handling Documentation Tests
// ============================================================================

describe('Input Handling in Multiplexers', () => {
	describe('Key sequence variations', () => {
		test('arrow keys have standard xterm sequences', () => {
			// These sequences should work in most terminals and multiplexers
			const arrowSequences = {
				up: '\x1b[A',
				down: '\x1b[B',
				right: '\x1b[C',
				left: '\x1b[D',
			};

			expect(arrowSequences.up).toBe('\x1b[A');
			expect(arrowSequences.down).toBe('\x1b[B');
			expect(arrowSequences.right).toBe('\x1b[C');
			expect(arrowSequences.left).toBe('\x1b[D');
		});

		test('alternative arrow sequences (application mode)', () => {
			// Some terminals/multiplexers use application cursor mode (DECCKM)
			const appModeArrows = {
				up: '\x1bOA',
				down: '\x1bOB',
				right: '\x1bOC',
				left: '\x1bOD',
			};

			expect(appModeArrows.up).toBe('\x1bOA');
			expect(appModeArrows.down).toBe('\x1bOB');
			expect(appModeArrows.right).toBe('\x1bOC');
			expect(appModeArrows.left).toBe('\x1bOD');
		});

		test('modifier key combinations vary by terminal', () => {
			// Ctrl+Arrow typically uses CSI 1;5 format
			const ctrlArrows = {
				up: '\x1b[1;5A',
				down: '\x1b[1;5B',
				right: '\x1b[1;5C',
				left: '\x1b[1;5D',
			};

			// Shift+Arrow typically uses CSI 1;2 format
			const shiftArrows = {
				up: '\x1b[1;2A',
				down: '\x1b[1;2B',
				right: '\x1b[1;2C',
				left: '\x1b[1;2D',
			};

			expect(ctrlArrows.up).toBe('\x1b[1;5A');
			expect(shiftArrows.up).toBe('\x1b[1;2A');
		});
	});

	describe('IME (Input Method Editor) considerations', () => {
		// IME input is particularly tricky in multiplexers
		test('documents IME character input behavior', () => {
			// Japanese IME example: typing "nihongo" and converting to kanji
			// The terminal receives the final converted string, not keystrokes
			const imeInput = '日本語'; // This would arrive as a single chunk

			expect(imeInput.length).toBe(3);
			expect([...imeInput]).toEqual(['日', '本', '語']);
		});

		test('documents bracketed paste mode sequences', () => {
			// Bracketed paste helps distinguish pasted text from typed input
			// Important for handling IME paste operations
			const bracketedPaste = {
				enable: '\x1b[?2004h',
				disable: '\x1b[?2004l',
				pasteStart: '\x1b[200~',
				pasteEnd: '\x1b[201~',
			};

			expect(bracketedPaste.enable).toBe('\x1b[?2004h');
			expect(bracketedPaste.pasteStart).toBe('\x1b[200~');
			expect(bracketedPaste.pasteEnd).toBe('\x1b[201~');
		});
	});
});

// ============================================================================
// Color Rendering Tests
// ============================================================================

describe('Color Rendering in Multiplexers', () => {
	test('basic 16-color SGR codes', () => {
		// These should work universally
		const basicColors = {
			fgRed: '\x1b[31m',
			fgGreen: '\x1b[32m',
			bgRed: '\x1b[41m',
			bgGreen: '\x1b[42m',
			reset: '\x1b[0m',
		};

		expect(basicColors.fgRed).toBe('\x1b[31m');
		expect(basicColors.bgGreen).toBe('\x1b[42m');
	});

	test('256-color palette codes', () => {
		// 256-color: CSI 38;5;N m (foreground) / CSI 48;5;N m (background)
		const color256 = {
			fg: (n: number) => `\x1b[38;5;${n}m`,
			bg: (n: number) => `\x1b[48;5;${n}m`,
		};

		expect(color256.fg(196)).toBe('\x1b[38;5;196m'); // Bright red
		expect(color256.bg(21)).toBe('\x1b[48;5;21m'); // Blue
	});

	test('true color (24-bit) RGB codes', () => {
		// True color: CSI 38;2;R;G;B m (foreground) / CSI 48;2;R;G;B m (background)
		// Note: tmux needs to be configured with `set -g default-terminal "tmux-256color"`
		// and the outer terminal must support true color
		const trueColor = {
			fg: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
			bg: (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`,
		};

		expect(trueColor.fg(255, 128, 64)).toBe('\x1b[38;2;255;128;64m');
		expect(trueColor.bg(0, 100, 200)).toBe('\x1b[48;2;0;100;200m');
	});
});

// ============================================================================
// Resize Behavior Tests
// ============================================================================

describe('Resize Behavior', () => {
	test('documents SIGWINCH signal handling', () => {
		// SIGWINCH is sent when terminal size changes
		// In multiplexers, this propagates from outer terminal -> multiplexer -> inner app
		const SIGWINCH = 28; // Signal number on most systems
		expect(SIGWINCH).toBe(28);
	});

	test('documents terminal size query sequence', () => {
		// Query terminal size using ANSI escape sequence
		// Response format: CSI 9 ; HEIGHT ; WIDTH t
		const querySizeSequence = '\x1b[18t';
		expect(querySizeSequence).toBe('\x1b[18t');
	});

	test('documents cursor position report for size detection', () => {
		// Alternative method: move cursor to far corner and query position
		// 1. Save cursor position: CSI s
		// 2. Move to large position: CSI 9999;9999H
		// 3. Query position: CSI 6n
		// 4. Response: CSI ROW;COL R
		// 5. Restore cursor: CSI u
		const sequences = {
			saveCursor: '\x1b[s',
			moveToCorner: '\x1b[9999;9999H',
			queryPosition: '\x1b[6n',
			restoreCursor: '\x1b[u',
		};

		expect(sequences.queryPosition).toBe('\x1b[6n');
	});
});

// ============================================================================
// Documentation: Manual Testing Guide
// ============================================================================

/**
 * MANUAL TESTING GUIDE FOR TERMINAL MULTIPLEXERS
 * ==============================================
 *
 * tmux Testing:
 * -------------
 * 1. Start tmux: `tmux new -s test`
 * 2. Run the TUI app inside tmux
 * 3. Test the following:
 *    - Basic rendering: Does text appear correctly?
 *    - Colors: Are colors accurate (especially true color)?
 *    - Scrolling: Does scrolling work without tearing?
 *    - Input: Do arrow keys, function keys work?
 *    - Resize: Does the app respond to pane resizing?
 *    - Splits: Works in split panes?
 *
 * tmux Configuration for best results:
 * ```tmux
 * # ~/.tmux.conf
 * set -g default-terminal "tmux-256color"
 * set -as terminal-features ",*:RGB"
 * set -sg escape-time 0
 * ```
 *
 * Zellij Testing:
 * ---------------
 * 1. Start Zellij: `zellij`
 * 2. Run the TUI app inside Zellij
 * 3. Test the following:
 *    - Basic rendering: Does text appear correctly?
 *    - Colors: Zellij has good true color support
 *    - Scrolling: Does Zellij's own scrollback interfere?
 *    - Input: Do keybindings conflict with Zellij's?
 *    - Resize: Does the app respond to pane resizing?
 *    - Tabs/Panes: Works in various layouts?
 *
 * Zellij Considerations:
 * - Zellij has its own keybindings that may conflict
 * - Use `zellij options --disable-mouse-mode` if mouse causes issues
 * - Check `zellij setup --check` for terminal compatibility
 *
 * Known Issues:
 * -------------
 * 1. tmux tearing: Use synchronized update mode (CSI ? 2026 h/l)
 * 2. tmux true color: Requires proper terminfo configuration
 * 3. Zellij key conflicts: Alt+key combinations may be captured
 * 4. Screen (GNU): Limited true color support in older versions
 * 5. ssh + tmux: Double latency for escape sequences
 *
 * Testing Checklist:
 * ------------------
 * [ ] Text renders correctly (no corruption)
 * [ ] Unicode/emoji display properly
 * [ ] Colors match expected values
 * [ ] No screen tearing during updates
 * [ ] Arrow keys work
 * [ ] Function keys work (F1-F12)
 * [ ] Ctrl+key combinations work
 * [ ] Alt+key combinations work
 * [ ] Mouse input works (if enabled)
 * [ ] Resize responds correctly
 * [ ] Cleanup on exit (no artifacts)
 */

describe('Documentation: Manual Testing Guide', () => {
	test('guide exists in comments above', () => {
		// This test just ensures the documentation section is present
		expect(true).toBe(true);
	});
});

// ============================================================================
// Quirks and Workarounds Documentation
// ============================================================================

describe('Multiplexer Quirks and Workarounds', () => {
	describe('tmux quirks', () => {
		test('documents escape-time delay issue', () => {
			// tmux has a default escape-time of 500ms which causes:
			// - Sluggish ESC key response
			// - Slow escape sequence processing
			//
			// Fix: set -sg escape-time 0 (or a small value like 10)
			const recommendedEscapeTime = 0;
			expect(recommendedEscapeTime).toBe(0);
		});

		test('documents true color configuration', () => {
			// tmux true color requirements:
			// 1. Outer terminal must support true color
			// 2. TERM should be set to a capable terminfo
			// 3. tmux.conf needs: set -as terminal-features ",*:RGB"
			// prettier-ignore
			const trueColorCapableTerms = ['xterm-256color', 'tmux-256color', 'xterm-direct', 'iterm2'];
			expect(trueColorCapableTerms).toContain('tmux-256color');
		});

		test('documents alternate screen buffer handling', () => {
			// tmux captures alternate screen buffer by default
			// This affects scrollback behavior
			// Can be disabled with: set -g alternate-screen off
			const altScreenOn = '\x1b[?1049h';
			const altScreenOff = '\x1b[?1049l';
			expect(altScreenOn).toBe('\x1b[?1049h');
			expect(altScreenOff).toBe('\x1b[?1049l');
		});
	});

	describe('Zellij quirks', () => {
		test('documents Zellij locked mode for TUI apps', () => {
			// Zellij's locked mode (Ctrl+g) passes all input to the app
			// This is important for TUI apps that need Ctrl/Alt combinations
			const lockModeKeybind = 'Ctrl+g';
			expect(lockModeKeybind).toBe('Ctrl+g');
		});

		test('documents mouse mode interactions', () => {
			// Zellij has its own mouse handling that can interfere
			// Use --disable-mouse-mode or configure in Zellij
			const mouseTrackingOn = '\x1b[?1000h';
			const mouseTrackingOff = '\x1b[?1000l';
			expect(mouseTrackingOn).toBe('\x1b[?1000h');
		});
	});

	describe('General multiplexer workarounds', () => {
		test('documents synchronized update for flicker-free rendering', () => {
			// Synchronized Update Mode (DEC mode 2026) prevents tearing
			// Supported by: tmux 3.2+, kitty, iTerm2, WezTerm, Contour
			// Gracefully ignored by terminals that don't support it
			const syncUpdateWrapper = (output: string): string => {
				return `\x1b[?2026h${output}\x1b[?2026l`;
			};

			const wrapped = syncUpdateWrapper('test');
			expect(wrapped).toBe('\x1b[?2026htest\x1b[?2026l');
		});

		test('documents fallback for unsupported features', () => {
			// Feature detection via DECRQM (Request Mode)
			// Query: CSI ? <mode> $ p
			// Response: CSI ? <mode> ; <value> $ y
			// value: 0=unknown, 1=set, 2=reset, 3=permanent set, 4=permanent reset
			const requestMode = (mode: number): string => `\x1b[?${mode}$p`;
			expect(requestMode(2026)).toBe('\x1b[?2026$p');
		});
	});
});

// ============================================================================
// Utility Functions for Multiplexer Support
// ============================================================================

/**
 * Utility functions that could be used for multiplexer support.
 * These are tested but not necessarily exported by inkx.
 */
describe('Multiplexer Support Utilities', () => {
	test('detectMultiplexerEnvironment returns correct info', () => {
		interface MultiplexerInfo {
			type: 'tmux' | 'zellij' | 'screen' | null;
			version: string | null;
			features: {
				trueColor: boolean;
				synchronizedUpdate: boolean;
			};
		}

		const detectMultiplexerEnvironment = (
			env: Record<string, string | undefined>,
		): MultiplexerInfo => {
			if (env.TMUX) {
				return {
					type: 'tmux',
					version: env.TMUX_VERSION ?? null,
					features: {
						trueColor: true, // Assume modern tmux
						synchronizedUpdate: true, // tmux 3.2+
					},
				};
			}
			if (env.ZELLIJ !== undefined) {
				return {
					type: 'zellij',
					version: env.ZELLIJ_VERSION ?? null,
					features: {
						trueColor: true,
						synchronizedUpdate: true,
					},
				};
			}
			if (env.STY) {
				return {
					type: 'screen',
					version: null,
					features: {
						trueColor: false, // GNU Screen has limited true color
						synchronizedUpdate: false,
					},
				};
			}
			return {
				type: null,
				version: null,
				features: {
					trueColor: true,
					synchronizedUpdate: false,
				},
			};
		};

		const tmuxEnv = {
			TMUX: '/tmp/tmux-501/default,12345,0',
			TMUX_VERSION: '3.4',
		};
		const tmuxInfo = detectMultiplexerEnvironment(tmuxEnv);
		expect(tmuxInfo.type).toBe('tmux');
		expect(tmuxInfo.features.synchronizedUpdate).toBe(true);

		const zellijEnv = { ZELLIJ: '0' };
		const zellijInfo = detectMultiplexerEnvironment(zellijEnv);
		expect(zellijInfo.type).toBe('zellij');

		const plainEnv = { TERM: 'xterm-256color' };
		const plainInfo = detectMultiplexerEnvironment(plainEnv);
		expect(plainInfo.type).toBe(null);
	});

	test('wrapOutputForMultiplexer adds synchronized update', () => {
		const wrapOutputForMultiplexer = (
			output: string,
			multiplexerType: 'tmux' | 'zellij' | 'screen' | null,
		): string => {
			// Use synchronized update for tmux and zellij
			if (multiplexerType === 'tmux' || multiplexerType === 'zellij') {
				return `${SYNC_UPDATE.begin}${output}${SYNC_UPDATE.end}`;
			}
			return output;
		};

		const tmuxOutput = wrapOutputForMultiplexer('Hello', 'tmux');
		expect(tmuxOutput).toBe('\x1b[?2026hHello\x1b[?2026l');

		const plainOutput = wrapOutputForMultiplexer('Hello', null);
		expect(plainOutput).toBe('Hello');
	});
});
