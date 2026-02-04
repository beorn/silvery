/**
 * Hit Registry Tests
 *
 * Tests for mouse hit testing infrastructure:
 * - HitRegistry class for region management
 * - useHitRegion hook for React integration
 * - useHitRegionCallback for performance-optimized registration
 */

import React from 'react';
import { beforeEach, describe, expect, test } from 'vitest';
import {
	type HitRegion,
	HitRegistry,
	HitRegistryContext,
	type HitTarget,
	Z_INDEX,
	resetHitRegionIdCounter,
	useHitRegion,
	useHitRegionCallback,
	useHitRegistry,
} from '../src/hit-registry.ts';
import { Box, Text } from '../src/index.ts';
import { createRenderer } from '../src/testing/index.tsx';

const render = createRenderer();

// Reset ID counter before each test for predictable IDs
beforeEach(() => {
	resetHitRegionIdCounter();
});

// ============================================================================
// HitRegistry Class Tests
// ============================================================================

describe('HitRegistry', () => {
	test('register and retrieve a region', () => {
		const registry = new HitRegistry();
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };

		registry.register('card-1', {
			x: 10,
			y: 5,
			width: 30,
			height: 8,
			target,
			zIndex: 10,
		});

		expect(registry.size).toBe(1);
	});

	test('unregister removes a region', () => {
		const registry = new HitRegistry();

		registry.register('card-1', {
			x: 10,
			y: 5,
			width: 30,
			height: 8,
			target: { type: 'node', nodeId: 'abc123' },
			zIndex: 10,
		});

		expect(registry.size).toBe(1);
		registry.unregister('card-1');
		expect(registry.size).toBe(0);
	});

	test('clear removes all regions', () => {
		const registry = new HitRegistry();

		registry.register('card-1', {
			x: 10,
			y: 5,
			width: 30,
			height: 8,
			target: { type: 'node', nodeId: 'abc123' },
			zIndex: 10,
		});
		registry.register('card-2', {
			x: 50,
			y: 5,
			width: 30,
			height: 8,
			target: { type: 'node', nodeId: 'def456' },
			zIndex: 10,
		});

		expect(registry.size).toBe(2);
		registry.clear();
		expect(registry.size).toBe(0);
	});

	describe('hitTest', () => {
		test('returns null when no regions match', () => {
			const registry = new HitRegistry();

			registry.register('card-1', {
				x: 10,
				y: 5,
				width: 30,
				height: 8,
				target: { type: 'node', nodeId: 'abc123' },
				zIndex: 10,
			});

			// Click outside the region
			expect(registry.hitTest(0, 0)).toBeNull();
			expect(registry.hitTest(100, 100)).toBeNull();
		});

		test('returns target when click is inside region', () => {
			const registry = new HitRegistry();
			const target: HitTarget = { type: 'node', nodeId: 'abc123' };

			registry.register('card-1', {
				x: 10,
				y: 5,
				width: 30,
				height: 8,
				target,
				zIndex: 10,
			});

			// Click inside the region
			const result = registry.hitTest(15, 7);
			expect(result).toEqual(target);
		});

		test('handles boundary conditions (inclusive start, exclusive end)', () => {
			const registry = new HitRegistry();
			const target: HitTarget = { type: 'node', nodeId: 'abc123' };

			registry.register('card-1', {
				x: 10,
				y: 5,
				width: 30,
				height: 8,
				target,
				zIndex: 10,
			});

			// Top-left corner (inclusive)
			expect(registry.hitTest(10, 5)).toEqual(target);

			// Bottom-right corner (exclusive - just inside)
			expect(registry.hitTest(39, 12)).toEqual(target);

			// Just outside right edge
			expect(registry.hitTest(40, 7)).toBeNull();

			// Just outside bottom edge
			expect(registry.hitTest(15, 13)).toBeNull();
		});

		test('returns highest z-index match for overlapping regions', () => {
			const registry = new HitRegistry();
			const bgTarget: HitTarget = { type: 'scroll-area' };
			const cardTarget: HitTarget = { type: 'node', nodeId: 'abc123' };
			const dialogTarget: HitTarget = { type: 'button', action: 'close' };

			// Background
			registry.register('bg', {
				x: 0,
				y: 0,
				width: 100,
				height: 50,
				target: bgTarget,
				zIndex: Z_INDEX.BACKGROUND,
			});

			// Card on top of background
			registry.register('card-1', {
				x: 10,
				y: 5,
				width: 30,
				height: 8,
				target: cardTarget,
				zIndex: Z_INDEX.CARD,
			});

			// Dialog on top of everything
			registry.register('dialog', {
				x: 5,
				y: 2,
				width: 40,
				height: 20,
				target: dialogTarget,
				zIndex: Z_INDEX.DIALOG,
			});

			// Click where all three overlap - should get dialog (highest z-index)
			expect(registry.hitTest(15, 7)).toEqual(dialogTarget);

			// Click where only background exists
			expect(registry.hitTest(90, 40)).toEqual(bgTarget);
		});

		test('handles multiple overlapping regions with same z-index', () => {
			const registry = new HitRegistry();
			const target1: HitTarget = { type: 'node', nodeId: 'first' };
			const target2: HitTarget = { type: 'node', nodeId: 'second' };

			// Two overlapping cards at same z-index
			registry.register('card-1', {
				x: 10,
				y: 5,
				width: 30,
				height: 8,
				target: target1,
				zIndex: 10,
			});
			registry.register('card-2', {
				x: 25,
				y: 5,
				width: 30,
				height: 8,
				target: target2,
				zIndex: 10,
			});

			// Click in overlap - either is acceptable (implementation-dependent)
			const result = registry.hitTest(30, 7);
			expect(result?.type).toBe('node');
		});
	});

	describe('hitTestAll', () => {
		test('returns all matching regions sorted by z-index', () => {
			const registry = new HitRegistry();

			registry.register('bg', {
				x: 0,
				y: 0,
				width: 100,
				height: 50,
				target: { type: 'scroll-area' },
				zIndex: 0,
			});

			registry.register('card-1', {
				x: 10,
				y: 5,
				width: 30,
				height: 8,
				target: { type: 'node', nodeId: 'abc123' },
				zIndex: 10,
			});

			registry.register('dialog', {
				x: 5,
				y: 2,
				width: 40,
				height: 20,
				target: { type: 'button', action: 'close' },
				zIndex: 100,
			});

			const results = registry.hitTestAll(15, 7);

			expect(results.length).toBe(3);
			// Should be sorted by z-index descending
			expect(results[0]?.zIndex).toBe(100);
			expect(results[1]?.zIndex).toBe(10);
			expect(results[2]?.zIndex).toBe(0);
		});

		test('returns empty array when no regions match', () => {
			const registry = new HitRegistry();

			registry.register('card-1', {
				x: 10,
				y: 5,
				width: 30,
				height: 8,
				target: { type: 'node', nodeId: 'abc123' },
				zIndex: 10,
			});

			const results = registry.hitTestAll(0, 0);
			expect(results).toEqual([]);
		});
	});

	describe('getAllRegions', () => {
		test('returns a copy of all registered regions', () => {
			const registry = new HitRegistry();

			registry.register('card-1', {
				x: 10,
				y: 5,
				width: 30,
				height: 8,
				target: { type: 'node', nodeId: 'abc123' },
				zIndex: 10,
			});
			registry.register('card-2', {
				x: 50,
				y: 5,
				width: 30,
				height: 8,
				target: { type: 'node', nodeId: 'def456' },
				zIndex: 10,
			});

			const allRegions = registry.getAllRegions();

			expect(allRegions.size).toBe(2);
			expect(allRegions.has('card-1')).toBe(true);
			expect(allRegions.has('card-2')).toBe(true);
		});
	});
});

// ============================================================================
// Z_INDEX Constants Tests
// ============================================================================

describe('Z_INDEX constants', () => {
	test('are in ascending order for layering', () => {
		expect(Z_INDEX.BACKGROUND).toBeLessThan(Z_INDEX.COLUMN_HEADER);
		expect(Z_INDEX.COLUMN_HEADER).toBeLessThan(Z_INDEX.CARD);
		expect(Z_INDEX.CARD).toBeLessThan(Z_INDEX.FOLD_TOGGLE);
		expect(Z_INDEX.FOLD_TOGGLE).toBeLessThan(Z_INDEX.LINK);
		expect(Z_INDEX.LINK).toBeLessThan(Z_INDEX.FLOATING);
		expect(Z_INDEX.FLOATING).toBeLessThan(Z_INDEX.DIALOG);
		expect(Z_INDEX.DIALOG).toBeLessThan(Z_INDEX.DROPDOWN);
		expect(Z_INDEX.DROPDOWN).toBeLessThan(Z_INDEX.TOOLTIP);
	});
});

// ============================================================================
// useHitRegistry Hook Tests
// ============================================================================

describe('useHitRegistry', () => {
	test('returns null when used outside HitRegistryContext', () => {
		let result: HitRegistry | null = null;

		function TestComponent() {
			result = useHitRegistry();
			return <Text>Test</Text>;
		}

		render(<TestComponent />);
		expect(result).toBeNull();
	});

	test('returns registry when inside HitRegistryContext', () => {
		let result: HitRegistry | null = null;
		const registry = new HitRegistry();

		function TestComponent() {
			result = useHitRegistry();
			return <Text>Test</Text>;
		}

		render(
			<HitRegistryContext.Provider value={registry}>
				<TestComponent />
			</HitRegistryContext.Provider>,
		);

		expect(result).toBe(registry);
	});
});

// ============================================================================
// useHitRegion Hook Tests
// ============================================================================

describe('useHitRegion', () => {
	test('registers region when rect is provided', () => {
		const registry = new HitRegistry();
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };
		const rect = { x: 10, y: 5, width: 30, height: 8 };

		function TestComponent() {
			useHitRegion(target, rect, Z_INDEX.CARD);
			return <Text>Test</Text>;
		}

		render(
			<HitRegistryContext.Provider value={registry}>
				<TestComponent />
			</HitRegistryContext.Provider>,
		);

		expect(registry.size).toBe(1);
		expect(registry.hitTest(15, 7)).toEqual(target);
	});

	test('does not register when rect is null', () => {
		const registry = new HitRegistry();
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };

		function TestComponent() {
			useHitRegion(target, null, Z_INDEX.CARD);
			return <Text>Test</Text>;
		}

		render(
			<HitRegistryContext.Provider value={registry}>
				<TestComponent />
			</HitRegistryContext.Provider>,
		);

		expect(registry.size).toBe(0);
	});

	test('does not register when enabled is false', () => {
		const registry = new HitRegistry();
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };
		const rect = { x: 10, y: 5, width: 30, height: 8 };

		function TestComponent() {
			useHitRegion(target, rect, Z_INDEX.CARD, false);
			return <Text>Test</Text>;
		}

		render(
			<HitRegistryContext.Provider value={registry}>
				<TestComponent />
			</HitRegistryContext.Provider>,
		);

		expect(registry.size).toBe(0);
	});

	test('unregisters on unmount', () => {
		const registry = new HitRegistry();
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };
		const rect = { x: 10, y: 5, width: 30, height: 8 };

		function TestComponent() {
			useHitRegion(target, rect, Z_INDEX.CARD);
			return <Text>Test</Text>;
		}

		const app = render(
			<HitRegistryContext.Provider value={registry}>
				<TestComponent />
			</HitRegistryContext.Provider>,
		);

		expect(registry.size).toBe(1);
		app.unmount();
		expect(registry.size).toBe(0);
	});

	test('works without registry context (no-op)', () => {
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };
		const rect = { x: 10, y: 5, width: 30, height: 8 };

		function TestComponent() {
			// Should not throw when no registry context
			useHitRegion(target, rect, Z_INDEX.CARD);
			return <Text>Test</Text>;
		}

		// Should render without error
		const app = render(<TestComponent />);
		expect(app.text).toContain('Test');
	});
});

// ============================================================================
// useHitRegionCallback Hook Tests
// ============================================================================

describe('useHitRegionCallback', () => {
	test('returns a callback that registers regions', () => {
		const registry = new HitRegistry();
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };
		let callback:
			| ((rect: {
					x: number;
					y: number;
					width: number;
					height: number;
			  }) => void)
			| null = null;

		function TestComponent() {
			callback = useHitRegionCallback(target, Z_INDEX.CARD);
			return <Text>Test</Text>;
		}

		render(
			<HitRegistryContext.Provider value={registry}>
				<TestComponent />
			</HitRegistryContext.Provider>,
		);

		expect(callback).not.toBeNull();

		// Call the callback with a rect
		callback!({ x: 10, y: 5, width: 30, height: 8 });

		expect(registry.size).toBe(1);
		expect(registry.hitTest(15, 7)).toEqual(target);
	});

	test('callback updates region on subsequent calls', () => {
		const registry = new HitRegistry();
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };
		let callback:
			| ((rect: {
					x: number;
					y: number;
					width: number;
					height: number;
			  }) => void)
			| null = null;

		function TestComponent() {
			callback = useHitRegionCallback(target, Z_INDEX.CARD);
			return <Text>Test</Text>;
		}

		render(
			<HitRegistryContext.Provider value={registry}>
				<TestComponent />
			</HitRegistryContext.Provider>,
		);

		// First call
		callback!({ x: 10, y: 5, width: 30, height: 8 });
		expect(registry.hitTest(15, 7)).toEqual(target);
		expect(registry.hitTest(60, 7)).toBeNull();

		// Update position
		callback!({ x: 50, y: 5, width: 30, height: 8 });

		// Should still have only one region (updated, not added)
		expect(registry.size).toBe(1);
		// Old position should no longer hit
		expect(registry.hitTest(15, 7)).toBeNull();
		// New position should hit
		expect(registry.hitTest(60, 7)).toEqual(target);
	});

	test('unregisters on unmount', () => {
		const registry = new HitRegistry();
		const target: HitTarget = { type: 'node', nodeId: 'abc123' };
		let callback:
			| ((rect: {
					x: number;
					y: number;
					width: number;
					height: number;
			  }) => void)
			| null = null;

		function TestComponent() {
			callback = useHitRegionCallback(target, Z_INDEX.CARD);
			return <Text>Test</Text>;
		}

		const app = render(
			<HitRegistryContext.Provider value={registry}>
				<TestComponent />
			</HitRegistryContext.Provider>,
		);

		callback!({ x: 10, y: 5, width: 30, height: 8 });
		expect(registry.size).toBe(1);

		app.unmount();
		expect(registry.size).toBe(0);
	});
});

// ============================================================================
// HitTarget Types Tests
// ============================================================================

describe('HitTarget types', () => {
	test('supports node targets', () => {
		const target: HitTarget = {
			type: 'node',
			nodeId: 'abc123',
			colIndex: 0,
			cardIndex: 2,
		};
		expect(target.type).toBe('node');
		expect(target.nodeId).toBe('abc123');
	});

	test('supports fold-toggle targets', () => {
		const target: HitTarget = {
			type: 'fold-toggle',
			nodeId: 'abc123',
		};
		expect(target.type).toBe('fold-toggle');
	});

	test('supports link targets', () => {
		const target: HitTarget = {
			type: 'link',
			linkUrl: 'https://example.com',
		};
		expect(target.type).toBe('link');
		expect(target.linkUrl).toBe('https://example.com');
	});

	test('supports column-header targets', () => {
		const target: HitTarget = {
			type: 'column-header',
			colIndex: 2,
		};
		expect(target.type).toBe('column-header');
		expect(target.colIndex).toBe(2);
	});

	test('supports button targets with action', () => {
		const target: HitTarget = {
			type: 'button',
			action: 'close',
		};
		expect(target.type).toBe('button');
		expect(target.action).toBe('close');
	});
});
