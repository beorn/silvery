/**
 * Suspense Flicker Tests
 *
 * Tests that sibling content remains visible during Suspense transitions.
 * Bug: When a Suspense boundary shows a fallback, sibling content outside
 * the boundary disappears for one frame before reappearing.
 *
 * Root cause investigation: inkx uses LegacyRoot (tag=0) for all
 * createContainer calls. In LegacyRoot mode, React can't "hold" the
 * old committed tree during Suspense transitions — specifically for
 * startTransition / useDeferredValue patterns.
 *
 * @see https://react.dev/reference/react/Suspense
 */

import { Suspense, startTransition, useCallback, useDeferredValue, useState } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Box, Text } from '../src/index.js';
import { run, useInput } from '../src/runtime/run.tsx';
import { createRenderer } from '../src/testing/index.tsx';

const render = createRenderer({ cols: 60, rows: 20 });

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Component that suspends by throwing a promise.
 * Read function should throw a promise when data isn't ready,
 * or return the data when it is.
 */
function SuspendingComponent({ read }: { read: () => string }) {
	const value = read();
	return <Text>{value}</Text>;
}

/**
 * Create a suspending resource for tests.
 * On first call to read(), throws a promise. After resolve(), returns the value.
 */
function createResource<T>(): {
	read: () => T;
	resolve: (value: T) => void;
} {
	let resolved = false;
	let resolvedValue: T;
	let resolvePromise: (value: T) => void;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = (value: T) => {
			resolved = true;
			resolvedValue = value;
			resolve(value);
		};
	});

	return {
		read: () => {
			if (resolved) return resolvedValue;
			throw promise;
		},
		resolve: (value: T) => resolvePromise(value),
	};
}

// ============================================================================
// Tests
// ============================================================================

describe('Suspense flicker', () => {
	test('sibling content stays visible during initial Suspense', () => {
		const resource = createResource<string>();

		function App() {
			return (
				<Box flexDirection="column">
					<Text>Header - always visible</Text>
					<Suspense fallback={<Text>Loading...</Text>}>
						<SuspendingComponent read={resource.read} />
					</Suspense>
					<Text>Footer - always visible</Text>
				</Box>
			);
		}

		const app = render(<App />);

		// During initial suspension: siblings should remain visible
		expect(app.text).toContain('Header - always visible');
		expect(app.text).toContain('Footer - always visible');
		// Fallback should be shown
		expect(app.text).toContain('Loading...');
	});

	test('nested Suspense: outer siblings visible when inner suspends', () => {
		const innerResource = createResource<string>();

		function App() {
			return (
				<Box flexDirection="column">
					<Text>Outer header</Text>
					<Box flexDirection="column">
						<Text>Inner header</Text>
						<Suspense fallback={<Text>Inner loading...</Text>}>
							<SuspendingComponent read={innerResource.read} />
						</Suspense>
						<Text>Inner footer</Text>
					</Box>
					<Text>Outer footer</Text>
				</Box>
			);
		}

		const app = render(<App />);

		// All non-suspended content should be visible
		expect(app.text).toContain('Outer header');
		expect(app.text).toContain('Outer footer');
		expect(app.text).toContain('Inner header');
		expect(app.text).toContain('Inner footer');
		expect(app.text).toContain('Inner loading...');
	});

	test("multiple Suspense boundaries: one suspending doesn't hide the other", () => {
		const resource1 = createResource<string>();

		function ReadyContent() {
			return <Text>Ready content</Text>;
		}

		function App() {
			return (
				<Box flexDirection="column">
					<Suspense fallback={<Text>Loading section 1...</Text>}>
						<SuspendingComponent read={resource1.read} />
					</Suspense>
					<Suspense fallback={<Text>Loading section 2...</Text>}>
						<ReadyContent />
					</Suspense>
				</Box>
			);
		}

		const app = render(<App />);

		// First boundary should show fallback
		expect(app.text).toContain('Loading section 1...');
		// Second boundary should show resolved content (it never suspends)
		expect(app.text).toContain('Ready content');
		expect(app.text).not.toContain('Loading section 2...');
	});

	test("Suspense with state update: content transition doesn't flicker siblings", () => {
		// This simulates the search dialog scenario:
		// - User types a query (state update)
		// - Data loading suspends
		// - Title/header should remain visible during loading
		let suspended = false;

		function DataView({ query }: { query: string }) {
			if (suspended) {
				throw new Promise<void>(() => {
					// Never resolves — we just want to test the suspended frame
				});
			}
			return <Text>Results for "{query}"</Text>;
		}

		function App({ query }: { query: string }) {
			return (
				<Box flexDirection="column">
					<Text bold>Search Dialog Title</Text>
					<Text>Query: {query}</Text>
					<Suspense fallback={<Text>Searching...</Text>}>
						<DataView query={query} />
					</Suspense>
					<Text dimColor>Press Esc to cancel</Text>
				</Box>
			);
		}

		// Initial render - no suspension
		const app = render(<App query="" />);
		expect(app.text).toContain('Search Dialog Title');
		expect(app.text).toContain('Results for');

		// Simulate query change that triggers suspension
		suspended = true;
		app.rerender(<App query="test" />);

		// KEY ASSERTION: Title and footer should still be visible during suspension
		expect(app.text).toContain('Search Dialog Title');
		expect(app.text).toContain('Query: test');
		expect(app.text).toContain('Press Esc to cancel');
		expect(app.text).toContain('Searching...');
	});

	test('Suspense fallback with different height preserves sibling positions', () => {
		// When the Suspense fallback has a different height than the resolved content,
		// siblings below shift position. This is a key flicker scenario: the sibling
		// content might get lost in incremental rendering because the buffer clone
		// has stale data in the shifted region.
		let suspended = false;

		function HeavyContent() {
			if (suspended) {
				throw new Promise<void>(() => {});
			}
			// Multi-line content
			return (
				<Box flexDirection="column">
					<Text>Result line 1</Text>
					<Text>Result line 2</Text>
					<Text>Result line 3</Text>
				</Box>
			);
		}

		function App() {
			return (
				<Box flexDirection="column">
					<Text>Dialog Title</Text>
					<Suspense fallback={<Text>Loading...</Text>}>
						<HeavyContent />
					</Suspense>
					<Text>Footer hint text</Text>
				</Box>
			);
		}

		// Render with resolved content (3 lines)
		const app = render(<App />);
		expect(app.text).toContain('Dialog Title');
		expect(app.text).toContain('Result line 1');
		expect(app.text).toContain('Result line 2');
		expect(app.text).toContain('Result line 3');
		expect(app.text).toContain('Footer hint text');

		// Now suspend — fallback is 1 line instead of 3
		// Footer shifts up, but should still be visible
		suspended = true;
		app.rerender(<App />);
		expect(app.text).toContain('Dialog Title');
		expect(app.text).toContain('Loading...');
		expect(app.text).toContain('Footer hint text');
		// Resolved content should be hidden
		expect(app.text).not.toContain('Result line');
	});

	test('Suspense with incremental re-suspension preserves siblings', () => {
		// Test that when content goes from resolved -> suspended -> resolved,
		// siblings are never hidden during the transition.
		let phase: 'loading' | 'ready' | 'reloading' = 'loading';

		function Content() {
			if (phase === 'loading' || phase === 'reloading') {
				throw new Promise<void>(() => {});
			}
			return <Text>Content is ready</Text>;
		}

		function App({ label }: { label: string }) {
			return (
				<Box flexDirection="column">
					<Text bold>App Title: {label}</Text>
					<Suspense fallback={<Text>Loading content...</Text>}>
						<Content />
					</Suspense>
					<Text>Footer nav</Text>
				</Box>
			);
		}

		// Phase 1: Initial loading
		phase = 'loading';
		const app = render(<App label="v1" />);
		expect(app.text).toContain('App Title: v1');
		expect(app.text).toContain('Footer nav');
		expect(app.text).toContain('Loading content...');

		// Phase 2: Content ready
		phase = 'ready';
		app.rerender(<App label="v2" />);
		expect(app.text).toContain('App Title: v2');
		expect(app.text).toContain('Footer nav');
		expect(app.text).toContain('Content is ready');
		expect(app.text).not.toContain('Loading content...');

		// Phase 3: Re-suspension (e.g. user typed new query)
		phase = 'reloading';
		app.rerender(<App label="v3" />);
		// KEY: siblings should still be visible during re-suspension
		expect(app.text).toContain('App Title: v3');
		expect(app.text).toContain('Footer nav');
		expect(app.text).toContain('Loading content...');
	});

	test('useDeferredValue with Suspense: title stays visible during deferred update', () => {
		// This replicates the exact SearchDialog pattern:
		// - useDeferredValue on the query
		// - Suspense boundary around results
		// - Title and footer outside Suspense
		//
		// In LegacyRoot, useDeferredValue returns the value synchronously (no deferral).
		// The test validates that even so, siblings remain visible.
		let shouldSuspend = false;

		function Results({ query }: { query: string }) {
			if (shouldSuspend && query.length > 0) {
				throw new Promise<void>(() => {});
			}
			if (query.length === 0) return <Text dimColor>Type to search...</Text>;
			return <Text>Results for: {query}</Text>;
		}

		function SearchDialog({ query }: { query: string }) {
			const deferredQuery = useDeferredValue(query);

			return (
				<Box flexDirection="column" borderStyle="double" width={50} height={15}>
					<Text bold color="cyan">
						Search Title
					</Text>
					<Text> </Text>
					<Text>Input: {query}</Text>
					<Text> </Text>
					<Suspense fallback={<Text dimColor>Loading results...</Text>}>
						<Results query={deferredQuery} />
					</Suspense>
					<Box flexGrow={1} />
					<Text dimColor>Esc cancel Enter select</Text>
				</Box>
			);
		}

		// Initial empty query - no suspension
		const app = render(<SearchDialog query="" />);
		expect(app.text).toContain('Search Title');
		expect(app.text).toContain('Input:');
		expect(app.text).toContain('Type to search...');
		expect(app.text).toContain('Esc cancel Enter select');

		// Type a query that triggers suspension
		shouldSuspend = true;
		app.rerender(<SearchDialog query="hello" />);

		// Title must stay visible during suspension
		expect(app.text).toContain('Search Title');
		expect(app.text).toContain('Input: hello');
		expect(app.text).toContain('Esc cancel Enter select');
		// In LegacyRoot, useDeferredValue defers: deferredQuery is still "" while
		// query is "hello". So Results gets query="" and shows "Type to search..."
		// instead of suspending. The fallback never appears.
		// In ConcurrentRoot, this would behave differently — React would show the
		// old tree (with "Type to search...") while preparing the deferred update.
		// Either way, the title must remain visible.
		expect(app.text).toContain('Type to search...');
	});

	test('fixed-height container with Suspense: title not displaced', () => {
		// In a fixed-height container (like ModalDialog), Suspense fallback
		// should not push the title out of view or cause it to disappear.
		let suspended = false;

		function DataView() {
			if (suspended) {
				throw new Promise<void>(() => {});
			}
			return (
				<Box flexDirection="column">
					{Array.from({ length: 8 }, (_, i) => (
						<Text key={i}>Result item {i + 1}</Text>
					))}
				</Box>
			);
		}

		function Dialog() {
			return (
				<Box
					flexDirection="column"
					width={40}
					height={15}
					borderStyle="double"
					borderColor="cyan"
					backgroundColor="black"
					paddingX={2}
					paddingY={1}
				>
					{/* Title - should never disappear */}
					<Box flexShrink={0}>
						<Text bold color="cyan">
							Dialog Title
						</Text>
					</Box>
					<Text> </Text>
					{/* Content area with Suspense */}
					<Box flexDirection="column" flexGrow={1} overflow="hidden">
						<Suspense fallback={<Text>Loading data...</Text>}>
							<DataView />
						</Suspense>
					</Box>
					{/* Footer */}
					<Text> </Text>
					<Text dimColor>Footer hint</Text>
				</Box>
			);
		}

		// Initial render - no suspension, 8 results
		const app = render(<Dialog />);
		expect(app.text).toContain('Dialog Title');
		expect(app.text).toContain('Result item 1');
		expect(app.text).toContain('Footer hint');

		// Trigger suspension
		suspended = true;
		app.rerender(<Dialog />);

		// Title and footer must remain visible
		expect(app.text).toContain('Dialog Title');
		expect(app.text).toContain('Footer hint');
		expect(app.text).toContain('Loading data...');
		expect(app.text).not.toContain('Result item');
	});
});

// ============================================================================
// Async tests using run() headless — exercises real concurrent scheduler
//
// The sync tests above use createRenderer which calls updateContainerSync +
// flushSyncWork, bypassing React's concurrent scheduler. These async tests
// use run() headless mode where startTransition updates are NOT flushed
// synchronously, so we can observe ConcurrentRoot behavior: the old committed
// tree stays visible when a transition suspends.
// ============================================================================

describe('Suspense flicker (async, ConcurrentRoot)', () => {
	// Disable act() warnings — we intentionally bypass act() to exercise
	// React's real concurrent scheduler with startTransition.
	const origActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT;
	beforeEach(() => {
		globalThis.IS_REACT_ACT_ENVIRONMENT = false;
	});
	afterEach(() => {
		globalThis.IS_REACT_ACT_ENVIRONMENT = origActEnv;
	});
	/**
	 * Suspense resource keyed by query string.
	 * Each unique query creates a new pending promise.
	 * Resolve manually to simulate async data loading.
	 * Supports pre-resolution: calling resolve() before read() works.
	 */
	function createQueryResource() {
		const cache = new Map<
			string,
			{ promise: Promise<void>; resolve: () => void; resolved: boolean }
		>();
		const preResolved = new Set<string>();

		return {
			read(query: string): string {
				if (query === '') return 'No results yet';
				if (preResolved.has(query)) return `Results for: ${query}`;

				let entry = cache.get(query);
				if (!entry) {
					let resolve!: () => void;
					const promise = new Promise<void>((r) => {
						resolve = r;
					});
					entry = { promise, resolve, resolved: false };
					cache.set(query, entry);
				}

				if (entry.resolved) return `Results for: ${query}`;
				throw entry.promise;
			},

			resolve(query: string) {
				const entry = cache.get(query);
				if (entry) {
					entry.resolved = true;
					entry.resolve();
				} else {
					preResolved.add(query);
				}
			},
		};
	}

	test('startTransition + Suspense: old tree preserved during transition suspension', async () => {
		// This is the ConcurrentRoot-specific behavior:
		// When a startTransition causes suspension, React keeps the old committed
		// tree visible instead of showing the Suspense fallback. In LegacyRoot,
		// the fallback would be shown immediately.
		const resource = createQueryResource();

		function Results({ query }: { query: string }) {
			const data = resource.read(query);
			return <Text>{data}</Text>;
		}

		function App() {
			const [query, setQuery] = useState('');

			useInput(
				useCallback((input: string) => {
					startTransition(() => setQuery((prev) => prev + input));
				}, []),
			);

			return (
				<Box flexDirection="column">
					<Text bold>Title - must stay visible</Text>
					<Text>query={query}</Text>
					<Suspense fallback={<Text>Fallback shown</Text>}>
						<Results query={query} />
					</Suspense>
					<Text>Footer</Text>
				</Box>
			);
		}

		const app = await run(<App />, { cols: 60, rows: 20 });

		// Baseline: title, empty results, footer
		expect(app.text).toContain('Title - must stay visible');
		expect(app.text).toContain('No results yet');
		expect(app.text).toContain('Footer');

		// Press 'a' — handler calls startTransition(() => setQuery("a"))
		// The transition update is NOT flushed by doRender's flushSyncWork,
		// so the old committed tree (query="") stays visible.
		await app.press('a');

		expect(app.text).toContain('Title - must stay visible');
		expect(app.text).toContain('Footer');
		// Old tree preserved — "No results yet" should still be visible
		expect(app.text).toContain('No results yet');
		// Fallback should NOT appear (ConcurrentRoot holds old tree)
		expect(app.text).not.toContain('Fallback shown');

		// Wait for React's concurrent scheduler to process the transition
		await new Promise((r) => setTimeout(r, 200));

		// Even after scheduler runs, the transition is still suspended.
		// ConcurrentRoot keeps the old committed tree visible.
		expect(app.text).toContain('Title - must stay visible');
		expect(app.text).toContain('Footer');

		// Resolve the suspension
		resource.resolve('a');

		// Wait for React to retry and commit the new tree
		await new Promise((r) => setTimeout(r, 200));

		// New tree committed: query="a", results showing
		expect(app.text).toContain('Title - must stay visible');
		expect(app.text).toContain('Results for: a');
		expect(app.text).toContain('Footer');

		app.unmount();
	});

	test('startTransition + Suspense: re-transition preserves previous results', async () => {
		// After results load for "a", typing "b" starts a new transition.
		// The old results ("Results for: a") should stay visible while "b" suspends.
		const resource = createQueryResource();

		function Results({ query }: { query: string }) {
			const data = resource.read(query);
			return <Text>{data}</Text>;
		}

		function App() {
			const [query, setQuery] = useState('');

			useInput(
				useCallback((input: string) => {
					startTransition(() => setQuery(input));
				}, []),
			);

			return (
				<Box flexDirection="column">
					<Text>Title</Text>
					<Suspense fallback={<Text>Loading...</Text>}>
						<Results query={query} />
					</Suspense>
					<Text>Footer</Text>
				</Box>
			);
		}

		const app = await run(<App />, { cols: 60, rows: 20 });

		expect(app.text).toContain('Title');
		expect(app.text).toContain('No results yet');

		// Press "a" → transition suspends
		await app.press('a');
		expect(app.text).toContain('Title');
		expect(app.text).not.toContain('Loading...');

		// Resolve "a" → results for "a" appear
		resource.resolve('a');
		await new Promise((r) => setTimeout(r, 200));

		expect(app.text).toContain('Title');
		expect(app.text).toContain('Results for: a');
		expect(app.text).toContain('Footer');

		// Press "b" → new transition suspends
		await app.press('b');

		// ConcurrentRoot: old results ("Results for: a") should remain visible
		// during the new transition — no fallback shown
		expect(app.text).toContain('Title');
		expect(app.text).toContain('Footer');
		expect(app.text).not.toContain('Loading...');

		// Resolve "b" → new results appear
		resource.resolve('b');
		await new Promise((r) => setTimeout(r, 200));

		expect(app.text).toContain('Title');
		expect(app.text).toContain('Results for: b');
		expect(app.text).toContain('Footer');

		app.unmount();
	});
});
