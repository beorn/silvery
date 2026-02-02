/**
 * Core types for the inkx-loop runtime.
 */

import type { TerminalBuffer } from '../buffer.js';
import type { InkxNode } from '../types.js';

/**
 * Dimensions for rendering.
 */
export interface Dims {
	cols: number;
	rows: number;
}

/**
 * Immutable render output buffer.
 *
 * Contains:
 * - text: Plain text without ANSI codes (for assertions)
 * - ansi: Styled output with ANSI escape codes
 * - nodes: Internal node tree for locator queries
 */
export interface Buffer {
	/** Plain text without ANSI codes */
	readonly text: string;
	/** Styled output with ANSI escape codes */
	readonly ansi: string;
	/** Internal node tree for locator queries */
	readonly nodes: InkxNode;
	/** Raw terminal buffer for diffing */
	readonly _buffer: TerminalBuffer;
}

/**
 * Event types from the runtime.
 */
export type Event =
	| { type: 'key'; key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }
	| { type: 'resize'; cols: number; rows: number }
	| { type: 'tick'; time: number }
	| { type: 'effect'; id: string; result: unknown }
	| { type: 'error'; error: Error };

/**
 * Render target interface - abstracts terminal output.
 */
export interface RenderTarget {
	/** Write rendered frame to output */
	write(frame: string): void;
	/** Get current dimensions */
	getDims(): Dims;
	/** Subscribe to resize events */
	onResize?(handler: (dims: Dims) => void): () => void;
}

/**
 * Runtime options for createRuntime().
 */
export interface RuntimeOptions {
	/** Render target (terminal, test mock, etc.) */
	target: RenderTarget;
	/** Abort signal for cleanup */
	signal?: AbortSignal;
}

/**
 * The runtime kernel interface.
 */
export interface Runtime {
	/** Event stream - yields until disposed */
	events(): AsyncIterable<Event>;

	/** Schedule an effect with optional cancellation */
	schedule<T>(effect: () => Promise<T>, opts?: { signal?: AbortSignal }): void;

	/** Render a buffer to the target */
	render(buffer: Buffer): void;

	/** Get current dimensions */
	getDims(): Dims;

	/** Dispose and cleanup - idempotent */
	[Symbol.dispose](): void;
}
