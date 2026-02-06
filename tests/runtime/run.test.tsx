/**
 * Tests for run() - Layer 2 React integration.
 */

import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Text } from '../../src/index.js';
import { type Key, run, useExit, useInput } from '../../src/runtime/index.js';

describe('run() - Layer 2', () => {
	describe('basic rendering', () => {
		it('renders a simple component', async () => {
			const controller = new AbortController();

			function App() {
				return <Text>Hello from run()</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			expect(handle.text).toContain('Hello from run()');

			// Cleanup
			handle.unmount();
		});

		it('provides text accessor', async () => {
			const controller = new AbortController();

			function App() {
				return <Text>Test content</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			expect(handle.text).toContain('Test content');
			handle.unmount();
		});
	});

	describe('useInput', () => {
		it('handles key presses with input string', async () => {
			const controller = new AbortController();
			const inputs: string[] = [];

			function App() {
				useInput((input) => {
					inputs.push(input);
				});
				return <Text>Press keys</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			await handle.press('a');
			await handle.press('b');
			await handle.press('c');

			expect(inputs).toEqual(['a', 'b', 'c']);

			handle.unmount();
		});

		it('provides Key object with special keys', async () => {
			const controller = new AbortController();
			const keys: Key[] = [];

			function App() {
				useInput((input, key) => {
					keys.push({ ...key });
				});
				return <Text>Press keys</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			await handle.press('\r'); // return
			await handle.press('\x1b'); // escape
			await handle.press('\t'); // tab

			expect(keys[0]?.return).toBe(true);
			expect(keys[1]?.escape).toBe(true);
			expect(keys[2]?.tab).toBe(true);

			handle.unmount();
		});

		it('detects arrow keys', async () => {
			const controller = new AbortController();
			const keys: Key[] = [];

			function App() {
				useInput((input, key) => {
					keys.push({ ...key });
				});
				return <Text>Press arrow keys</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			await handle.press('\x1b[A'); // up arrow
			await handle.press('\x1b[B'); // down arrow
			await handle.press('\x1b[C'); // right arrow
			await handle.press('\x1b[D'); // left arrow

			expect(keys[0]?.upArrow).toBe(true);
			expect(keys[1]?.downArrow).toBe(true);
			expect(keys[2]?.rightArrow).toBe(true);
			expect(keys[3]?.leftArrow).toBe(true);

			handle.unmount();
		});

		it('detects ctrl modifier', async () => {
			const controller = new AbortController();
			const results: { input: string; ctrl: boolean }[] = [];

			function App() {
				useInput((input, key) => {
					results.push({ input, ctrl: key.ctrl });
				});
				return <Text>Press ctrl+c</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			await handle.press('\x03'); // ctrl+c

			expect(results[0]?.input).toBe('c');
			expect(results[0]?.ctrl).toBe(true);

			handle.unmount();
		});

		it('detects shift modifier for uppercase', async () => {
			const controller = new AbortController();
			const results: { input: string; shift: boolean }[] = [];

			function App() {
				useInput((input, key) => {
					results.push({ input, shift: key.shift });
				});
				return <Text>Press keys</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			await handle.press('A'); // uppercase
			await handle.press('a'); // lowercase

			expect(results[0]?.input).toBe('A');
			expect(results[0]?.shift).toBe(true);
			expect(results[1]?.input).toBe('a');
			expect(results[1]?.shift).toBe(false);

			handle.unmount();
		});

		it('exits when handler returns exit', async () => {
			const controller = new AbortController();

			function App() {
				useInput((input) => {
					if (input === 'q') return 'exit';
				});
				return <Text>Press q to exit</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			// Press q to exit
			await handle.press('q');

			// Should be able to wait for exit
			// (already exited, so this should resolve immediately)
			await handle.waitUntilExit();
		});
	});

	describe('state updates', () => {
		it('re-renders on state change', async () => {
			const controller = new AbortController();

			function Counter() {
				const [count, setCount] = useState(0);

				useInput((input) => {
					if (input === 'j') setCount((c) => c + 1);
					if (input === 'q') return 'exit';
				});

				return <Text>Count: {count}</Text>;
			}

			const handle = await run(<Counter />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			expect(handle.text).toContain('Count: 0');

			await handle.press('j');
			// Give React time to re-render
			await new Promise((r) => setTimeout(r, 10));
			expect(handle.text).toContain('Count: 1');

			await handle.press('j');
			await new Promise((r) => setTimeout(r, 10));
			expect(handle.text).toContain('Count: 2');

			handle.unmount();
		});
	});

	describe('cleanup', () => {
		it('unmount stops the event loop', async () => {
			const controller = new AbortController();

			function App() {
				return <Text>Running</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			expect(handle.text).toContain('Running');

			handle.unmount();
			await handle.waitUntilExit();
		});

		it('external signal triggers cleanup', async () => {
			const controller = new AbortController();

			function App() {
				return <Text>Running</Text>;
			}

			const handle = await run(<App />, {
				cols: 80,
				rows: 24,
				signal: controller.signal,
			});

			expect(handle.text).toContain('Running');

			// Abort externally
			controller.abort();
			await handle.waitUntilExit();
		});
	});
});
