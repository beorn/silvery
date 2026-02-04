/**
 * Tests for defensive guards in the unified render API.
 *
 * Verifies that misuse patterns throw clear error messages.
 */

import React from 'react';
import { describe, expect, test } from 'vitest';
import { Text } from '../src/index.js';
import { ensureEngine } from '../src/renderer.js';

// Initialize layout engine before tests (normally done by testing module's top-level await)
await ensureEngine();

// Import after engine init to avoid hoisting issues
const { render, createRenderer, createStore, run, getActiveRenderCount } = await import(
	'../src/renderer.js'
);

describe('renderer guards', () => {
	// ========================================================================
	// Use-after-unmount guards
	// ========================================================================

	test('press after unmount throws', () => {
		const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 });
		app.unmount();
		expect(() => app.stdin.write('j')).toThrow('Cannot write to stdin after unmount');
	});

	test('rerender after unmount throws', () => {
		const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 });
		app.unmount();
		expect(() => app.rerender(<Text>World</Text>)).toThrow('Cannot rerender after unmount');
	});

	test('double unmount throws', () => {
		const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 });
		app.unmount();
		expect(() => app.unmount()).toThrow('Already unmounted');
	});

	// ========================================================================
	// Active render tracking
	// ========================================================================

	test('getActiveRenderCount tracks active renders', () => {
		const before = getActiveRenderCount();
		const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 });
		expect(getActiveRenderCount()).toBe(before + 1);
		app.unmount();
		expect(getActiveRenderCount()).toBe(before);
	});

	test('createRenderer auto-cleans previous render', () => {
		const r = createRenderer({ cols: 40, rows: 10 });
		const before = getActiveRenderCount();
		r(<Text>First</Text>);
		expect(getActiveRenderCount()).toBe(before + 1);
		r(<Text>Second</Text>); // should unmount first
		expect(getActiveRenderCount()).toBe(before + 1); // still just 1
	});

	// ========================================================================
	// createStore
	// ========================================================================

	test('createStore produces valid store', () => {
		const store = createStore({ cols: 120, rows: 40 });
		expect(store.cols).toBe(120);
		expect(store.rows).toBe(40);
		expect(store.events).toBeUndefined();
	});

	test('render with store uses store dimensions', () => {
		const store = createStore({ cols: 120, rows: 40 });
		const app = render(<Text>Hello</Text>, store);
		expect(app.text).toContain('Hello');
		app.unmount();
	});

	// ========================================================================
	// run() sync
	// ========================================================================

	test('run with empty array returns immediately', () => {
		const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 });
		const result = run(app, []);
		expect(result.text).toContain('Hello');
		app.unmount();
	});
});
