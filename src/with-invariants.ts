/**
 * withInvariants - Plugin for buffer and rendering invariant checks
 *
 * Wraps the `cmd` object to check invariants after command execution:
 * - All commands: Check incremental vs fresh render
 * - Cursor moves: Also check buffer content stability
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
 *   { checkIncremental: true, checkStability: true }
 * );
 *
 * // Commands now run invariant checks automatically
 * await driver.cmd.down();  // Checks incremental + stability
 * await driver.cmd.search();  // Checks incremental only
 * ```
 *
 * Environment variables:
 * - INKX_CHECK_INCREMENTAL: Enable incremental render check for all commands
 * - INKX_CHECK_STABILITY: Enable content stability check for cursor commands
 * - INKX_STABILITY_SKIP_LINES: Lines to skip (e.g., "0,-1" for breadcrumb/statusbar)
 */

import type { AppWithCommands, Cmd, Command } from './with-commands.js';
import { compareBuffers, formatMismatch } from './testing/compare-buffers.js';

// =============================================================================
// Types
// =============================================================================

export interface InvariantOptions {
	/** Check incremental vs fresh render (default: true if INKX_CHECK_INCREMENTAL) */
	checkIncremental?: boolean;
	/** Check buffer stability for cursor commands (default: true if INKX_CHECK_STABILITY) */
	checkStability?: boolean;
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
		skipLines = parseSkipLines(process.env.INKX_STABILITY_SKIP_LINES),
	} = options;

	// If no checks enabled, return app unchanged
	if (!checkIncremental && !checkStability) return app;

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
