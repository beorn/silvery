/**
 * inkx-loop Runtime Module
 *
 * Provides the core primitives for the inkx-loop architecture:
 *
 * Layer 0: Pure render functions
 * - layout() - React element → Buffer
 * - diff() - Buffer diff → ANSI patch
 *
 * Layer 1: Runtime kernel (createRuntime)
 * - events() - AsyncIterable event stream
 * - schedule() - Effect scheduling
 * - render() - Output to target
 *
 * Stream helpers
 * - merge, map, filter, takeUntil, etc.
 */

// Types
export type {
	Buffer,
	Dims,
	Event,
	RenderTarget,
	Runtime,
	RuntimeOptions,
} from './types.js';

// Layer 0: Pure render functions
export { layout, layoutSync, ensureLayoutEngine, type LayoutOptions } from './layout.js';
export { diff, render, type DiffMode } from './diff.js';

// Stream helpers (re-export from streams module)
export {
	merge,
	map,
	filter,
	filterMap,
	takeUntil,
	take,
	throttle,
	debounce,
	batch,
	concat,
	zip,
	fromArray,
	fromArrayWithDelay,
} from '../streams/index.js';
