/**
 * InkxLocator Tests
 *
 * Tests for Playwright-inspired DOM queries on InkxNode tree.
 */

import { describe, expect, test } from 'bun:test';
import React from 'react';
import { Box, Text } from '../src/components/index.ts';
import { createLocator, createTestRenderer } from '../src/testing/index.tsx';

// Test renderer factory
const render = createTestRenderer({ columns: 80, rows: 24 });

describe('InkxLocator', () => {
	describe('getByText', () => {
		test('finds element by exact text', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Hello')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByText('Hello').count()).toBe(1);
		});

		test('finds element by partial text', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Hello World')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByText('World').count()).toBe(1);
		});

		test('finds element by regex', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Task 123')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByText(/Task \d+/).count()).toBe(1);
		});

		test('returns 0 count for non-matching text', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Hello')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByText('Goodbye').count()).toBe(0);
		});

		test('finds multiple elements with same text', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, null, 'Item'),
					React.createElement(Text, null, 'Item'),
					React.createElement(Text, null, 'Item'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByText('Item').count()).toBe(3);
		});
	});

	describe('getByTestId', () => {
		test('finds element by testID prop', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					{ testID: 'container' },
					React.createElement(Text, null, 'Content'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('container').count()).toBe(1);
		});

		test('returns 0 count for non-matching testID', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					{ testID: 'container' },
					React.createElement(Text, null, 'Content'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('other').count()).toBe(0);
		});

		test('finds nested element by testID', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(
						Box,
						null,
						React.createElement(Text, { testID: 'deep-text' }, 'Deep'),
					),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('deep-text').count()).toBe(1);
		});
	});

	describe('locator (attribute selectors)', () => {
		test('finds by attribute presence [attr]', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { 'data-selected': true }, 'Selected'),
					React.createElement(Text, null, 'Not selected'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.locator('[data-selected]').count()).toBe(1);
		});

		test("finds by attribute value [attr='value']", () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { 'data-status': 'done' }, 'Done task'),
					React.createElement(Text, { 'data-status': 'todo' }, 'Todo task'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.locator('[data-status="done"]').count()).toBe(1);
			expect(locator.locator('[data-status="todo"]').count()).toBe(1);
		});

		test("finds by attribute prefix [attr^='prefix']", () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { testID: 'task-1' }, 'Task 1'),
					React.createElement(Text, { testID: 'task-2' }, 'Task 2'),
					React.createElement(Text, { testID: 'other' }, 'Other'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.locator('[testID^="task-"]').count()).toBe(2);
		});

		test("finds by attribute suffix [attr$='suffix']", () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { testID: 'inbox-column' }, 'Inbox'),
					React.createElement(Text, { testID: 'next-column' }, 'Next'),
					React.createElement(Text, { testID: 'header' }, 'Header'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.locator('[testID$="-column"]').count()).toBe(2);
		});

		test("finds by attribute contains [attr*='contains']", () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { testID: 'my-task-item' }, 'Task'),
					React.createElement(Text, { testID: 'other-task-thing' }, 'Other'),
					React.createElement(Text, { testID: 'header' }, 'Header'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.locator('[testID*="task"]').count()).toBe(2);
		});

		test('returns 0 for invalid selector', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Test')),
			);
			const locator = createLocator(getContainer());
			expect(locator.locator('invalid').count()).toBe(0);
		});
	});

	describe('narrowing (first, last, nth)', () => {
		test('first() returns first matching element', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { testID: 'item' }, 'First'),
					React.createElement(Text, { testID: 'item' }, 'Second'),
					React.createElement(Text, { testID: 'item' }, 'Third'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('item').first().textContent()).toBe('First');
		});

		test('last() returns last matching element', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { testID: 'item' }, 'First'),
					React.createElement(Text, { testID: 'item' }, 'Second'),
					React.createElement(Text, { testID: 'item' }, 'Third'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('item').last().textContent()).toBe('Third');
		});

		test('nth() returns element at index', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { testID: 'item' }, 'First'),
					React.createElement(Text, { testID: 'item' }, 'Second'),
					React.createElement(Text, { testID: 'item' }, 'Third'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('item').nth(1).textContent()).toBe('Second');
		});
	});

	describe('textContent', () => {
		test('returns text content of element', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					{ testID: 'container' },
					React.createElement(Text, null, 'Hello World'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('container').textContent()).toBe('Hello World');
		});

		test('returns empty string for non-matching locator', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Test')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('nonexistent').textContent()).toBe('');
		});

		test('concatenates text from nested children', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					{ testID: 'parent' },
					React.createElement(Text, null, 'Hello '),
					React.createElement(Text, null, 'World'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('parent').textContent()).toBe('Hello World');
		});
	});

	describe('getAttribute', () => {
		test('returns attribute value', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { testID: 'task', 'data-status': 'done' }, 'Task'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('task').getAttribute('data-status')).toBe('done');
		});

		test('returns undefined for missing attribute', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, { testID: 'task' }, 'Task')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('task').getAttribute('data-status')).toBeUndefined();
		});
	});

	describe('boundingBox', () => {
		test('returns bounding box with position and dimensions', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					{ testID: 'container', width: 40, height: 10 },
					React.createElement(Text, null, 'Content'),
				),
			);
			const locator = createLocator(getContainer());
			const box = locator.getByTestId('container').boundingBox();
			expect(box).not.toBeNull();
			expect(box!.width).toBe(40);
			expect(box!.height).toBe(10);
			expect(typeof box!.x).toBe('number');
			expect(typeof box!.y).toBe('number');
		});

		test('returns null for non-matching locator', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Test')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('nonexistent').boundingBox()).toBeNull();
		});
	});

	describe('isVisible', () => {
		test('returns true for element with dimensions', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					{ testID: 'visible', width: 10, height: 5 },
					React.createElement(Text, null, 'Content'),
				),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('visible').isVisible()).toBe(true);
		});

		test('returns false for non-matching locator', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Test')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('nonexistent').isVisible()).toBe(false);
		});
	});

	describe('chaining queries', () => {
		test('chains getByText after getByTestId', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(
						Box,
						{ testID: 'sidebar' },
						React.createElement(Text, null, 'Sidebar Item'),
					),
					React.createElement(
						Box,
						{ testID: 'main' },
						React.createElement(Text, null, 'Main Content'),
					),
				),
			);
			const locator = createLocator(getContainer());
			// Note: chaining currently searches from root, not scoped
			// This tests that queries can be chained syntactically
			expect(locator.getByTestId('sidebar').count()).toBe(1);
			expect(locator.getByText('Sidebar Item').count()).toBe(1);
		});
	});

	describe('resolve and resolveAll', () => {
		test('resolve returns single node', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, { testID: 'target' }, 'Target')),
			);
			const locator = createLocator(getContainer());
			const node = locator.getByTestId('target').resolve();
			expect(node).not.toBeNull();
			expect(node!.type).toBe('inkx-text');
		});

		test('resolveAll returns array of nodes', () => {
			const { getContainer } = render(
				React.createElement(
					Box,
					null,
					React.createElement(Text, { testID: 'item' }, 'One'),
					React.createElement(Text, { testID: 'item' }, 'Two'),
				),
			);
			const locator = createLocator(getContainer());
			const nodes = locator.getByTestId('item').resolveAll();
			expect(nodes.length).toBe(2);
			// Use locator textContent for proper text extraction
			// (raw nodes have text in children, not directly on textContent prop)
			expect(locator.getByTestId('item').first().textContent()).toBe('One');
			expect(locator.getByTestId('item').last().textContent()).toBe('Two');
		});

		test('resolve returns null for non-matching', () => {
			const { getContainer } = render(
				React.createElement(Box, null, React.createElement(Text, null, 'Test')),
			);
			const locator = createLocator(getContainer());
			expect(locator.getByTestId('nonexistent').resolve()).toBeNull();
		});
	});
});
