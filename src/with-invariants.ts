/**
 * withInvariants - Plugin for buffer and rendering invariant checks
 *
 * Wraps the `cmd` object to check invariants after command execution:
 * - All commands: Check incremental vs fresh render
 * - Cursor moves: Also check buffer content stability
 * - Optional: ANSI replay verification (simulates terminal receiving diff)
 *
 * ## Design Note: Why wrap `cmd` instead of `sendInput`?
 *
 * The two approaches are complementary:
 *
 * 1. **`sendInput()` level** (in renderer.ts) — Already has `INKX_CHECK_INCREMENTAL`
 *    which catches ALL inputs regardless of how they arrive (raw key presses,
 *    type(), press(), etc.). This is the right place for incremental render checks.
 *
 * 2. **`cmd` level** (this plugin) — Command-aware, can selectively check stability
 *    for cursor moves only. Raw sendInput doesn't know which inputs are cursor
 *    commands that should preserve content. Another option would be `withInput()`
 *    which could wrap sendInput with awareness of what input was sent.
 *
 * This plugin focuses on the command-aware checks. For comprehensive incremental
 * render checking, use `INKX_CHECK_INCREMENTAL=1` environment variable which
 * operates at the sendInput level.
 *
 * @example
 * ```typescript
 * import { withInvariants } from 'inkx';
 *
 * const driver = withInvariants(
 *   createBoardDriver(repo, rootId),
 *   { checkIncremental: true, checkStability: true, checkReplay: true }
 * );
 *
 * // Commands now run invariant checks automatically
 * await driver.cmd.down();  // Checks incremental + stability + replay
 * await driver.cmd.search();  // Checks incremental + replay
 * ```
 *
 * Environment variables:
 * - INKX_CHECK_INCREMENTAL: Enable incremental render check for all commands
 * - INKX_CHECK_STABILITY: Enable content stability check for cursor commands
 * - INKX_CHECK_REPLAY: Enable ANSI replay verification
 * - INKX_STABILITY_SKIP_LINES: Lines to skip (e.g., "0,-1" for breadcrumb/statusbar)
 */

import type { AppWithCommands, Cmd, Command } from './with-commands.js';
import type { TerminalBuffer } from './buffer.js';
import { compareBuffers, formatMismatch } from './testing/compare-buffers.js';
import { outputPhase } from './pipeline/index.js';

// =============================================================================
// Types
// =============================================================================

export interface InvariantOptions {
	/** Check incremental vs fresh render (default: true if INKX_CHECK_INCREMENTAL) */
	checkIncremental?: boolean;
	/** Check buffer stability for cursor commands (default: true if INKX_CHECK_STABILITY) */
	checkStability?: boolean;
	/** Check ANSI replay produces correct result (default: true if INKX_CHECK_REPLAY) */
	checkReplay?: boolean;
	/** Lines to skip for stability check (e.g., [0, -1] for breadcrumb/statusbar) */
	skipLines?: number[];
}

/**
 * Text mismatch between before and after states
 */
interface TextMismatch {
	line: number;
	before: string;
	after: string;
}

/**
 * ANSI replay mismatch
 */
interface ReplayMismatch {
	x: number;
	y: number;
	expected: string;
	actual: string;
}

// =============================================================================
// VirtualTerminal - ANSI Replay Simulator
// =============================================================================

/**
 * Virtual terminal simulator for testing ANSI replay equivalence.
 *
 * Parses ANSI sequences and applies them to a 2D character grid.
 * Used to verify the Replay Equivalence invariant: applying the ANSI
 * diff to the previous buffer state should produce the target buffer.
 *
 * Handles:
 * - Cursor positioning (H, G, A, B, C, D)
 * - Line clear (K)
 * - Wide characters (emojis, CJK)
 * - CR/LF
 */
export class VirtualTerminal {
	private grid: string[][];
	private wideMarker: boolean[][];
	private cursorX = 0;
	private cursorY = 0;

	constructor(
		public readonly width: number,
		public readonly height: number,
	) {
		this.grid = Array.from({ length: height }, () => Array(width).fill(' '));
		this.wideMarker = Array.from({ length: height }, () => Array(width).fill(false));
	}

	/**
	 * Initialize grid from a TerminalBuffer (for incremental replay).
	 */
	loadFromBuffer(buffer: TerminalBuffer): void {
		for (let y = 0; y < Math.min(this.height, buffer.height); y++) {
			for (let x = 0; x < Math.min(this.width, buffer.width); x++) {
				const cell = buffer.getCell(x, y);
				if (cell.continuation) {
					this.wideMarker[y]![x] = true;
					this.grid[y]![x] = '';
				} else {
					this.grid[y]![x] = cell.char;
					this.wideMarker[y]![x] = false;
				}
			}
		}
	}

	/**
	 * Apply ANSI escape sequence string to the virtual terminal.
	 */
	applyAnsi(ansi: string): void {
		let i = 0;
		while (i < ansi.length) {
			if (ansi[i] === '\x1b' && ansi[i + 1] === '[') {
				const match = ansi.slice(i).match(/^\x1b\[([0-9;:?]*)([A-Za-z])/);
				if (match) {
					this.handleCsi(match[1] || '', match[2]!);
					i += match[0].length;
					continue;
				}
			}

			if (ansi[i] === '\r') {
				this.cursorX = 0;
				i++;
				continue;
			}

			if (ansi[i] === '\n') {
				this.cursorY = Math.min(this.cursorY + 1, this.height - 1);
				i++;
				continue;
			}

			// Handle multi-byte Unicode characters
			const char = this.extractChar(ansi, i);
			if (this.cursorX < this.width && this.cursorY < this.height) {
				this.grid[this.cursorY]![this.cursorX] = char;
				this.wideMarker[this.cursorY]![this.cursorX] = false;
				this.cursorX++;

				// Wide characters take 2 columns
				if (this.isWideChar(char) && this.cursorX < this.width) {
					this.grid[this.cursorY]![this.cursorX] = '';
					this.wideMarker[this.cursorY]![this.cursorX] = true;
					this.cursorX++;
				}
			}
			i += char.length;
		}
	}

	/**
	 * Check if a character is wide (emoji, CJK, etc).
	 */
	private isWideChar(char: string): boolean {
		if (char.length === 0) return false;
		const code = char.codePointAt(0) || 0;

		// Emoji ranges
		if (code >= 0x1f300 && code <= 0x1f9ff) return true;
		if (code >= 0x2600 && code <= 0x26ff) return true;
		if (code >= 0x2700 && code <= 0x27bf) return true;

		// CJK ranges
		if (code >= 0x4e00 && code <= 0x9fff) return true;
		if (code >= 0x3000 && code <= 0x303f) return true;
		if (code >= 0xff00 && code <= 0xffef) return true;

		return false;
	}

	/**
	 * Extract a single Unicode character (which may be multiple bytes).
	 */
	private extractChar(str: string, start: number): string {
		const code = str.codePointAt(start);
		if (code === undefined) return str[start] || '';
		if (code > 0xffff) return String.fromCodePoint(code);
		return str[start] || '';
	}

	private handleCsi(params: string, cmd: string): void {
		switch (cmd) {
			case 'H': {
				const parts = params.split(';');
				this.cursorY = Math.max(0, (parseInt(parts[0] || '1', 10) || 1) - 1);
				this.cursorX = Math.max(0, (parseInt(parts[1] || '1', 10) || 1) - 1);
				break;
			}
			case 'G': {
				this.cursorX = Math.max(0, (parseInt(params || '1', 10) || 1) - 1);
				break;
			}
			case 'A': {
				const n = parseInt(params || '1', 10) || 1;
				this.cursorY = Math.max(0, this.cursorY - n);
				break;
			}
			case 'B': {
				const n = parseInt(params || '1', 10) || 1;
				this.cursorY = Math.min(this.height - 1, this.cursorY + n);
				break;
			}
			case 'C': {
				const n = parseInt(params || '1', 10) || 1;
				this.cursorX = Math.min(this.width - 1, this.cursorX + n);
				break;
			}
			case 'D': {
				const n = parseInt(params || '1', 10) || 1;
				this.cursorX = Math.max(0, this.cursorX - n);
				break;
			}
			case 'K': {
				const mode = parseInt(params || '0', 10);
				if (mode === 0) {
					for (let x = this.cursorX; x < this.width; x++) {
						this.grid[this.cursorY]![x] = ' ';
						this.wideMarker[this.cursorY]![x] = false;
					}
				} else if (mode === 1) {
					for (let x = 0; x <= this.cursorX; x++) {
						this.grid[this.cursorY]![x] = ' ';
						this.wideMarker[this.cursorY]![x] = false;
					}
				} else if (mode === 2) {
					for (let x = 0; x < this.width; x++) {
						this.grid[this.cursorY]![x] = ' ';
						this.wideMarker[this.cursorY]![x] = false;
					}
				}
				break;
			}
			case 'm':
			case 'l':
			case 'h':
				// SGR (style) and private modes - ignore for character comparison
				break;
		}
	}

	/**
	 * Get the character at a position.
	 */
	getChar(x: number, y: number): string {
		if (this.wideMarker[y]?.[x]) return '';
		return this.grid[y]?.[x] ?? ' ';
	}

	/**
	 * Compare with a TerminalBuffer and return mismatches.
	 */
	compareToBuffer(buffer: TerminalBuffer): ReplayMismatch[] {
		const mismatches: ReplayMismatch[] = [];
		for (let y = 0; y < Math.min(this.height, buffer.height); y++) {
			for (let x = 0; x < Math.min(this.width, buffer.width); x++) {
				const cell = buffer.getCell(x, y);
				if (cell.continuation) continue;

				const expected = cell.char;
				const actual = this.getChar(x, y);
				if (expected !== actual) {
					mismatches.push({ x, y, expected, actual });
				}
			}
		}
		return mismatches;
	}
}

// =============================================================================
// Constants
// =============================================================================

/** Commands that should preserve buffer content (only cursor position changes) */
const CURSOR_COMMANDS = new Set([
	// Full names
	'cursor_up',
	'cursor_down',
	'cursor_left',
	'cursor_right',
	// Short names
	'up',
	'down',
	'left',
	'right',
]);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse INKX_STABILITY_SKIP_LINES environment variable.
 * Format: comma-separated integers, e.g., "0,-1"
 */
function parseSkipLines(env?: string): number[] {
	if (!env) return [];
	return env
		.split(',')
		.map((s) => parseInt(s.trim(), 10))
		.filter((n) => !isNaN(n));
}

/**
 * Compare text content before and after a command.
 * Returns the first mismatch found, or null if content matches.
 *
 * @param before - Text before command execution
 * @param after - Text after command execution
 * @param skipLines - Line indices to skip (supports negative indices from end)
 */
function compareText(before: string, after: string, skipLines: number[]): TextMismatch | null {
	const beforeLines = before.split('\n');
	const afterLines = after.split('\n');
	const maxLines = Math.max(beforeLines.length, afterLines.length);

	// Build set of lines to skip, resolving negative indices
	const skipSet = new Set<number>();
	for (const line of skipLines) {
		if (line >= 0) {
			skipSet.add(line);
		} else {
			// Negative index: -1 = last line, -2 = second to last, etc.
			skipSet.add(maxLines + line);
		}
	}

	for (let i = 0; i < maxLines; i++) {
		if (skipSet.has(i)) continue;
		const b = beforeLines[i] ?? '';
		const a = afterLines[i] ?? '';
		if (b !== a) {
			return { line: i, before: b, after: a };
		}
	}
	return null;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Add invariant checking to an app with commands.
 *
 * Wraps the `cmd` proxy to intercept all command executions and run checks:
 * - **All commands**: Check that incremental render matches fresh render
 * - **Cursor commands**: Also check that buffer content didn't change
 *
 * @param app - App with command system (from withCommands)
 * @param options - Invariant check configuration
 * @returns App with wrapped cmd that runs invariant checks
 */
export function withInvariants<T extends AppWithCommands>(
	app: T,
	options: InvariantOptions = {},
): T {
	const {
		checkIncremental = !!process.env.INKX_CHECK_INCREMENTAL,
		checkStability = !!process.env.INKX_CHECK_STABILITY,
		checkReplay = !!process.env.INKX_CHECK_REPLAY,
		skipLines = parseSkipLines(process.env.INKX_STABILITY_SKIP_LINES),
	} = options;

	// If no checks enabled, return app unchanged
	if (!checkIncremental && !checkStability && !checkReplay) return app;

	// Wrap the cmd proxy
	const wrappedCmd = new Proxy(app.cmd, {
		get(target, prop: string | symbol): unknown {
			// Handle symbol access (for JS internals)
			if (typeof prop === 'symbol') return Reflect.get(target, prop);

			const original = Reflect.get(target, prop);

			// Pass through non-function properties and special methods
			if (typeof original !== 'function') return original;
			if (prop === 'all' || prop === 'describe') return original;

			// Wrap command execution
			const command = original as Command;
			const wrapped = async () => {
				// Capture state before command
				const beforeText = app.text;
				const beforeBuffer = checkReplay ? app.lastBuffer() : null;

				// Execute the original command
				await command();

				// Check 1: Incremental vs fresh render
				if (checkIncremental) {
					const incremental = app.lastBuffer();
					// freshRender() may throw if not available (non-test renderer)
					try {
						const fresh = app.freshRender();
						if (incremental && fresh) {
							const mismatch = compareBuffers(incremental, fresh);
							if (mismatch) {
								throw new Error(
									`INKX_INVARIANT: Incremental/fresh mismatch after ${command.id}\n` +
										formatMismatch(mismatch, { key: command.id }),
								);
							}
						}
					} catch (e) {
						// If freshRender isn't available, skip the check
						if (!(e instanceof Error) || !e.message.includes('only available in test renderer')) {
							throw e;
						}
					}
				}

				// Check 2: Content stability for cursor commands
				if (checkStability && CURSOR_COMMANDS.has(command.id)) {
					const afterText = app.text;
					const mismatch = compareText(beforeText, afterText, skipLines);
					if (mismatch) {
						throw new Error(
							`INKX_INVARIANT: Content changed after cursor move ${command.id}\n` +
								`  Line ${mismatch.line}: "${mismatch.before}" → "${mismatch.after}"`,
						);
					}
				}

				// Check 3: ANSI replay produces correct result
				if (checkReplay && beforeBuffer) {
					const afterBuffer = app.lastBuffer();
					if (afterBuffer) {
						// Get the ANSI diff that would be sent to terminal
						const ansiDiff = outputPhase(beforeBuffer, afterBuffer);

						// Create virtual terminal initialized with previous state
						const vterm = new VirtualTerminal(afterBuffer.width, afterBuffer.height);
						vterm.loadFromBuffer(beforeBuffer);

						// Apply the ANSI diff
						vterm.applyAnsi(ansiDiff);

						// Compare result to expected buffer
						const mismatches = vterm.compareToBuffer(afterBuffer);
						if (mismatches.length > 0) {
							const first5 = mismatches.slice(0, 5);
							const details = first5
								.map((m) => `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`)
								.join('\n');
							throw new Error(
								`INKX_INVARIANT: ANSI replay mismatch after ${command.id}\n` +
									`  ${mismatches.length} cells differ:\n${details}` +
									(mismatches.length > 5 ? `\n  ... and ${mismatches.length - 5} more` : ''),
							);
						}
					}
				}
			};

			// Copy metadata from original command
			Object.defineProperties(wrapped, {
				id: { value: command.id, enumerable: true },
				name: { value: command.name, enumerable: true },
				help: { value: command.help, enumerable: true },
				keys: { value: command.keys, enumerable: true },
			});

			return wrapped;
		},

		has(target, prop): boolean {
			return Reflect.has(target, prop);
		},

		ownKeys(target): (string | symbol)[] {
			return Reflect.ownKeys(target);
		},

		getOwnPropertyDescriptor(target, prop): PropertyDescriptor | undefined {
			return Reflect.getOwnPropertyDescriptor(target, prop);
		},
	});

	return { ...app, cmd: wrappedCmd as Cmd } as T;
}
