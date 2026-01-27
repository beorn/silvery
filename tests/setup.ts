/**
 * Inkx Test Setup and Utilities
 *
 * Provides test helpers for Inkx component testing.
 * Import this file in tests for common utilities.
 */

import { expect } from 'bun:test';

// Re-export utilities from the testing module
export {
	createTestRenderer,
	normalizeFrame,
	stripAnsi,
	waitFor,
} from '../src/testing/index.js';

// Import for local use
import { normalizeFrame } from '../src/testing/index.js';

/**
 * Create a matcher for frame content that ignores ANSI codes.
 */
export function expectFrame(actual: string | undefined) {
	const normalized = actual ? normalizeFrame(actual) : '';

	return {
		toContain(expected: string) {
			expect(normalized).toContain(expected);
		},
		toBe(expected: string) {
			expect(normalized).toBe(normalizeFrame(expected));
		},
		toMatch(pattern: RegExp) {
			expect(normalized).toMatch(pattern);
		},
		toBeEmpty() {
			expect(normalized).toBe('');
		},
	};
}

/**
 * Create a simple text component for testing.
 * Useful when you need a minimal component.
 */
export function createTextComponent(text: string) {
	// This will be implemented once we have proper React integration
	return () => text;
}

/**
 * Delays execution for a specified number of milliseconds.
 * Useful for waiting for renders to complete.
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
