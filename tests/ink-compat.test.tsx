/**
 * Ink Compatibility Tests
 *
 * Tests that verify Inkx is API-compatible with Ink.
 * These tests verify:
 * 1. Public API exports match Ink's expectations
 * 2. Components render equivalent output to Ink
 * 3. Hooks behave the same as Ink's hooks
 * 4. Behavioral tests for keyboard input, focus, etc.
 */

import { describe, expect, test } from 'bun:test';
import type React from 'react';
import { useState } from 'react';

// Test that all expected exports exist
import {
	// Components
	Box,
	// Types (these should not throw when imported)
	type BoxProps,
	type ComputedLayout,
	type InkxNode,
	type InputHandler,
	type Instance,
	type Key,
	Newline,
	type RenderOptions,
	Spacer,
	Static,
	Text,
	type TextProps,
	type UseAppResult,
	type UseFocusManagerResult,
	type UseFocusOptions,
	type UseFocusResult,
	type UseInputOptions,
	type UseStdinResult,
	type UseStdoutResult,
	// Render
	render,
	// Hooks
	useApp,
	useContentRect,
	useFocus,
	useFocusManager,
	useInput,
	useStdin,
	useStdout,
} from '../src/index.js';
// Deprecated exports - test directly from source
import { measureElement, type MeasureElementOutput } from '../src/measureElement.js';
import { useLayout } from '../src/hooks/useLayout.js';

import { FocusContext, type FocusContextValue } from '../src/context.js';
import { createTestRenderer, stripAnsi } from '../src/testing/index.js';

const testRender = createTestRenderer();

// ============================================================================
// API Export Tests
// ============================================================================

describe('Ink API Compatibility', () => {
	describe('Component Exports', () => {
		test('Box component exists and is a function', () => {
			expect(typeof Box).toBe('function');
		});

		test('Text component exists and is a function', () => {
			expect(typeof Text).toBe('function');
		});

		test('Newline component exists and is a function', () => {
			expect(typeof Newline).toBe('function');
		});

		test('Spacer component exists and is a function', () => {
			expect(typeof Spacer).toBe('function');
		});

		test('Static component exists and is a function', () => {
			expect(typeof Static).toBe('function');
		});
	});

	describe('Hook Exports', () => {
		test('useInput hook exists and is a function', () => {
			expect(typeof useInput).toBe('function');
		});

		test('useApp hook exists and is a function', () => {
			expect(typeof useApp).toBe('function');
		});

		test('useStdout hook exists and is a function', () => {
			expect(typeof useStdout).toBe('function');
		});

		test('useStdin hook exists and is a function', () => {
			expect(typeof useStdin).toBe('function');
		});

		test('useFocus hook exists and is a function', () => {
			expect(typeof useFocus).toBe('function');
		});

		test('useFocusManager hook exists and is a function', () => {
			expect(typeof useFocusManager).toBe('function');
		});

		test('useLayout hook exists and is a function (Inkx-specific)', () => {
			expect(typeof useLayout).toBe('function');
		});
	});

	describe('Render Exports', () => {
		test('render function exists and is a function', () => {
			expect(typeof render).toBe('function');
		});

		test('measureElement function exists and is a function', () => {
			expect(typeof measureElement).toBe('function');
		});
	});

	describe('Box Props (Ink-compatible)', () => {
		test('Box accepts flexDirection prop', () => {
			const { lastFrame } = testRender(
				<Box flexDirection="column">
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			const frame = lastFrame();
			expect(frame).toContain('A');
			expect(frame).toContain('B');
		});

		test('Box accepts padding props', () => {
			const { lastFrame } = testRender(
				<Box padding={1}>
					<Text>Padded</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Padded');
		});

		test('Box accepts margin props', () => {
			const { lastFrame } = testRender(
				<Box margin={1}>
					<Text>Margined</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Margined');
		});

		test('Box accepts width/height props', () => {
			const { lastFrame } = testRender(
				<Box width={10} height={3}>
					<Text>Sized</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Sized');
		});

		test('Box accepts borderStyle prop', () => {
			const { lastFrame } = testRender(
				<Box borderStyle="single">
					<Text>Bordered</Text>
				</Box>,
			);
			const frame = lastFrame();
			expect(frame).toContain('Bordered');
			// Should have border characters
			expect(frame).toMatch(/[─│┌┐└┘]/);
		});

		test('Box accepts borderColor prop', () => {
			const { lastFrame } = testRender(
				<Box borderStyle="single" borderColor="red">
					<Text>Red Border</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Red Border');
		});

		test('Box accepts justifyContent prop', () => {
			const { lastFrame } = testRender(
				<Box justifyContent="space-between" width={20}>
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});

		test('Box accepts alignItems prop', () => {
			const { lastFrame } = testRender(
				<Box alignItems="center" height={3}>
					<Text>Centered</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Centered');
		});
	});

	describe('Text Props (Ink-compatible)', () => {
		test('Text accepts color prop', () => {
			const { lastFrame } = testRender(<Text color="red">Red</Text>);
			expect(lastFrame()).toContain('Red');
		});

		test('Text accepts backgroundColor prop', () => {
			const { lastFrame } = testRender(<Text backgroundColor="blue">BlueBg</Text>);
			expect(lastFrame()).toContain('BlueBg');
		});

		test('Text accepts bold prop', () => {
			const { lastFrame } = testRender(<Text bold>Bold</Text>);
			expect(lastFrame()).toContain('Bold');
		});

		test('Text accepts italic prop', () => {
			const { lastFrame } = testRender(<Text italic>Italic</Text>);
			expect(lastFrame()).toContain('Italic');
		});

		test('Text accepts underline prop', () => {
			const { lastFrame } = testRender(<Text underline>Underline</Text>);
			expect(lastFrame()).toContain('Underline');
		});

		test('Text accepts strikethrough prop', () => {
			const { lastFrame } = testRender(<Text strikethrough>Strike</Text>);
			expect(lastFrame()).toContain('Strike');
		});

		test('Text accepts dimColor prop', () => {
			const { lastFrame } = testRender(<Text dimColor>Dim</Text>);
			expect(lastFrame()).toContain('Dim');
		});

		test('Text accepts inverse prop', () => {
			const { lastFrame } = testRender(<Text inverse>Inverse</Text>);
			expect(lastFrame()).toContain('Inverse');
		});

		test('Text accepts wrap prop', () => {
			const { lastFrame } = testRender(<Text wrap="truncate">LongTextHere</Text>);
			expect(lastFrame()).toContain('Long');
		});

		test('Text truncate-start shows end of text with ellipsis at start', () => {
			const { lastFrame } = testRender(
				<Box width={10}>
					<Text wrap="truncate-start">Hello World Test</Text>
				</Box>,
			);
			const frame = stripAnsi(lastFrame() ?? '');
			// Should show ellipsis at start followed by end portion
			// Inkx uses Unicode ellipsis character
			expect(frame).toMatch(/[…\.]{1,3}/);
			expect(frame).toContain('Test');
		});

		test('Text truncate-middle shows start and end with ellipsis in middle', () => {
			const { lastFrame } = testRender(
				<Box width={12}>
					<Text wrap="truncate-middle">Hello World Test</Text>
				</Box>,
			);
			const frame = stripAnsi(lastFrame() ?? '');
			// Should show start, ellipsis, then end
			// Inkx uses Unicode ellipsis character
			expect(frame).toMatch(/[…\.]{1,3}/);
			expect(frame).toContain('Hell'); // Start portion
			expect(frame).toContain('est'); // End portion
		});
	});

	describe('Spacer Component', () => {
		test('Spacer pushes content apart', () => {
			const { lastFrame } = testRender(
				<Box flexDirection="row" width={20}>
					<Text>L</Text>
					<Spacer />
					<Text>R</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('L');
			expect(lastFrame()).toContain('R');
		});
	});

	describe('Newline Component', () => {
		test('Newline adds line breaks', () => {
			const { lastFrame } = testRender(
				<Box flexDirection="column">
					<Text>A</Text>
					<Newline count={2} />
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});
	});

	describe('Static Component', () => {
		test('Static component exists and accepts items prop', () => {
			// Static is a special component that requires the full reconciler
			// for proper behavior (writing content once and never updating).
			// Here we just verify the API shape.
			const items = ['a', 'b'];
			const element = <Static items={items}>{(item) => <Text key={item}>{item}</Text>}</Static>;
			expect(element).toBeDefined();
			expect(element.props.items).toEqual(['a', 'b']);
			expect(typeof element.props.children).toBe('function');
		});
	});

	describe('Key Object Shape', () => {
		test('Key type has expected properties', () => {
			// This tests the type shape at runtime by creating a mock key object
			const mockKey: Key = {
				upArrow: false,
				downArrow: false,
				leftArrow: false,
				rightArrow: false,
				pageDown: false,
				pageUp: false,
				home: false,
				end: false,
				return: false,
				escape: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			};

			// Verify all properties exist
			expect(mockKey).toHaveProperty('upArrow');
			expect(mockKey).toHaveProperty('downArrow');
			expect(mockKey).toHaveProperty('leftArrow');
			expect(mockKey).toHaveProperty('rightArrow');
			expect(mockKey).toHaveProperty('pageDown');
			expect(mockKey).toHaveProperty('pageUp');
			expect(mockKey).toHaveProperty('home');
			expect(mockKey).toHaveProperty('end');
			expect(mockKey).toHaveProperty('return');
			expect(mockKey).toHaveProperty('escape');
			expect(mockKey).toHaveProperty('ctrl');
			expect(mockKey).toHaveProperty('shift');
			expect(mockKey).toHaveProperty('tab');
			expect(mockKey).toHaveProperty('backspace');
			expect(mockKey).toHaveProperty('delete');
			expect(mockKey).toHaveProperty('meta');
		});
	});

	describe('Color Formats', () => {
		test('Text accepts named colors', () => {
			const { lastFrame } = testRender(<Text color="green">Green</Text>);
			expect(lastFrame()).toContain('Green');
		});

		test('Text accepts hex colors', () => {
			const { lastFrame } = testRender(<Text color="#ff0000">Hex</Text>);
			expect(lastFrame()).toContain('Hex');
		});

		test('Text accepts rgb colors', () => {
			const { lastFrame } = testRender(<Text color="rgb(255, 0, 0)">RGB</Text>);
			expect(lastFrame()).toContain('RGB');
		});
	});
});

// ============================================================================
// Behavioral Tests - useInput
// ============================================================================

describe('Behavioral Tests - useInput', () => {
	const render = createTestRenderer({ columns: 80, rows: 30 });

	describe('isActive option', () => {
		test('useInput ignores input when isActive is false', () => {
			let inputReceived = false;

			function InactiveInputHandler() {
				useInput(
					() => {
						inputReceived = true;
					},
					{ isActive: false },
				);
				return <Text>Inactive Handler</Text>;
			}

			const { stdin } = render(<InactiveInputHandler />);
			stdin.write('a');
			stdin.write('\x1b[A'); // up arrow

			expect(inputReceived).toBe(false);
		});

		test('useInput processes input when isActive is true', () => {
			let inputReceived = false;

			function ActiveInputHandler() {
				useInput(
					() => {
						inputReceived = true;
					},
					{ isActive: true },
				);
				return <Text>Active Handler</Text>;
			}

			const { stdin } = render(<ActiveInputHandler />);
			stdin.write('a');

			expect(inputReceived).toBe(true);
		});

		test('useInput processes input when isActive is undefined (default true)', () => {
			let inputReceived = false;

			function DefaultActiveHandler() {
				useInput(() => {
					inputReceived = true;
				});
				return <Text>Default Handler</Text>;
			}

			const { stdin } = render(<DefaultActiveHandler />);
			stdin.write('a');

			expect(inputReceived).toBe(true);
		});

		test('useInput can toggle isActive dynamically', () => {
			const receivedInputs: string[] = [];

			function ToggleableHandler() {
				const [isActive, setIsActive] = useState(true);

				useInput(
					(input) => {
						receivedInputs.push(input);
						if (input === 'd') {
							setIsActive(false);
						}
					},
					{ isActive },
				);

				return <Text>isActive: {isActive ? 'true' : 'false'}</Text>;
			}

			const { stdin, lastFrame } = render(<ToggleableHandler />);

			stdin.write('a'); // Should be received
			stdin.write('b'); // Should be received
			stdin.write('d'); // Should be received, disables handler
			stdin.write('e'); // Should NOT be received

			expect(receivedInputs).toEqual(['a', 'b', 'd']);
			expect(stripAnsi(lastFrame() ?? '')).toContain('isActive: false');
		});
	});

	describe('Multiple useInput handlers', () => {
		test('multiple active handlers all receive input', () => {
			const handler1Inputs: string[] = [];
			const handler2Inputs: string[] = [];

			function Handler1() {
				useInput((input) => {
					handler1Inputs.push(`h1:${input}`);
				});
				return null;
			}

			function Handler2() {
				useInput((input) => {
					handler2Inputs.push(`h2:${input}`);
				});
				return null;
			}

			function MultiHandlerApp() {
				return (
					<Box flexDirection="column">
						<Handler1 />
						<Handler2 />
						<Text>Multi Handler</Text>
					</Box>
				);
			}

			const { stdin } = render(<MultiHandlerApp />);
			stdin.write('x');

			expect(handler1Inputs).toContain('h1:x');
			expect(handler2Inputs).toContain('h2:x');
		});

		test('inactive handler does not receive input while others do', () => {
			const activeInputs: string[] = [];
			const inactiveInputs: string[] = [];

			function ActiveHandler() {
				useInput(
					(input) => {
						activeInputs.push(input);
					},
					{ isActive: true },
				);
				return null;
			}

			function InactiveHandler() {
				useInput(
					(input) => {
						inactiveInputs.push(input);
					},
					{ isActive: false },
				);
				return null;
			}

			function MixedHandlerApp() {
				return (
					<Box>
						<ActiveHandler />
						<InactiveHandler />
						<Text>Mixed</Text>
					</Box>
				);
			}

			const { stdin } = render(<MixedHandlerApp />);
			stdin.write('y');

			expect(activeInputs).toEqual(['y']);
			expect(inactiveInputs).toEqual([]);
		});
	});
});

// ============================================================================
// Behavioral Tests - useFocus
// ============================================================================

describe('Behavioral Tests - useFocus', () => {
	const render = createTestRenderer({ columns: 80, rows: 30 });

	/**
	 * Create a mock focus context that tracks focus state.
	 * Uses a mutable state object so changes are visible to tests.
	 */
	function createFocusContext(): FocusContextValue & {
		focusables: Map<string, { isActive: boolean }>;
		getActiveId: () => string | null;
	} {
		const state = { activeId: null as string | null };
		const focusables = new Map<string, { isActive: boolean }>();
		const focusOrder: string[] = [];

		const ctx: FocusContextValue & {
			focusables: Map<string, { isActive: boolean }>;
			getActiveId: () => string | null;
		} = {
			get activeId() {
				return state.activeId;
			},
			focusables,
			getActiveId: () => state.activeId,
			add: (id, options) => {
				focusables.set(id, { isActive: true });
				focusOrder.push(id);
				if (options?.autoFocus && state.activeId === null) {
					state.activeId = id;
				}
			},
			remove: (id) => {
				focusables.delete(id);
				const idx = focusOrder.indexOf(id);
				if (idx >= 0) focusOrder.splice(idx, 1);
				if (state.activeId === id) {
					state.activeId = focusOrder[0] ?? null;
				}
			},
			activate: (id) => {
				const f = focusables.get(id);
				if (f) f.isActive = true;
			},
			deactivate: (id) => {
				const f = focusables.get(id);
				if (f) f.isActive = false;
			},
			focus: (id) => {
				state.activeId = id;
			},
			focusNext: () => {
				const activeItems = focusOrder.filter((id) => focusables.get(id)?.isActive);
				if (activeItems.length === 0) return;
				const currentIdx = state.activeId ? activeItems.indexOf(state.activeId) : -1;
				const nextIdx = (currentIdx + 1) % activeItems.length;
				state.activeId = activeItems[nextIdx] ?? null;
			},
			focusPrevious: () => {
				const activeItems = focusOrder.filter((id) => focusables.get(id)?.isActive);
				if (activeItems.length === 0) return;
				const currentIdx = state.activeId ? activeItems.indexOf(state.activeId) : 0;
				const prevIdx = (currentIdx - 1 + activeItems.length) % activeItems.length;
				state.activeId = activeItems[prevIdx] ?? null;
			},
			enableFocus: () => {},
			disableFocus: () => {},
			isFocusEnabled: true,
		};

		return ctx;
	}

	test('useFocus returns isFocused=true when component is focused', () => {
		const ctx = createFocusContext();

		function FocusableItem() {
			const focus = useFocus({ id: 'item1', autoFocus: true });
			return <Text>{focus.isFocused ? 'focused' : 'unfocused'}</Text>;
		}

		render(
			<FocusContext.Provider value={ctx}>
				<FocusableItem />
			</FocusContext.Provider>,
		);

		// autoFocus should make it focused
		expect(ctx.getActiveId()).toBe('item1');
	});

	test('useFocus autoFocus option focuses on mount', () => {
		const ctx = createFocusContext();

		function AutoFocusItem() {
			useFocus({ id: 'auto-item', autoFocus: true });
			return <Text>Auto</Text>;
		}

		render(
			<FocusContext.Provider value={ctx}>
				<AutoFocusItem />
			</FocusContext.Provider>,
		);

		expect(ctx.getActiveId()).toBe('auto-item');
	});

	test('useFocus isActive=false makes component unfocusable', () => {
		const ctx = createFocusContext();

		function InactiveFocusable() {
			useFocus({ id: 'inactive', isActive: false });
			return <Text>Inactive</Text>;
		}

		render(
			<FocusContext.Provider value={ctx}>
				<InactiveFocusable />
			</FocusContext.Provider>,
		);

		expect(ctx.focusables.get('inactive')?.isActive).toBe(false);
	});

	test('focus() method focuses the component', () => {
		const ctx = createFocusContext();
		const focusRef = { current: null as (() => void) | null };

		function ManualFocusItem() {
			const { focus } = useFocus({ id: 'manual' });
			focusRef.current = focus;
			return <Text>Manual</Text>;
		}

		render(
			<FocusContext.Provider value={ctx}>
				<ManualFocusItem />
			</FocusContext.Provider>,
		);

		expect(ctx.getActiveId()).toBeNull();
		focusRef.current?.();
		expect(ctx.getActiveId()).toBe('manual');
	});
});

// ============================================================================
// Behavioral Tests - useApp
// ============================================================================

describe('Behavioral Tests - useApp', () => {
	const render = createTestRenderer({ columns: 80, rows: 30 });

	test('useApp returns exit function', () => {
		let exitFn: ((error?: Error) => void) | null = null;

		function AppWithExit() {
			const { exit } = useApp();
			exitFn = exit;
			return <Text>App with exit</Text>;
		}

		render(<AppWithExit />);

		expect(exitFn).toBeDefined();
		expect(typeof exitFn).toBe('function');
	});

	test('useApp exit can be called', () => {
		let exitCalled = false;

		function ExitOnKey() {
			const { exit } = useApp();

			useInput((input) => {
				if (input === 'q') {
					exit();
					exitCalled = true;
				}
			});

			return <Text>Press q to exit</Text>;
		}

		const { stdin } = render(<ExitOnKey />);
		stdin.write('q');

		expect(exitCalled).toBe(true);
	});
});

// ============================================================================
// Behavioral Tests - Rendering
// ============================================================================

describe('Behavioral Tests - Rendering', () => {
	const render = createTestRenderer({ columns: 80, rows: 30 });

	describe('Re-render behavior', () => {
		test('state changes trigger re-render', () => {
			function Counter() {
				const [count, setCount] = useState(0);

				useInput((input) => {
					if (input === '+') {
						setCount((c) => c + 1);
					}
				});

				return <Text>Count: {count}</Text>;
			}

			const { lastFrame, stdin } = render(<Counter />);

			expect(stripAnsi(lastFrame() ?? '')).toContain('Count: 0');

			stdin.write('+');
			expect(stripAnsi(lastFrame() ?? '')).toContain('Count: 1');

			stdin.write('+');
			stdin.write('+');
			expect(stripAnsi(lastFrame() ?? '')).toContain('Count: 3');
		});

		test('rerender function updates component', () => {
			function Greeting({ name }: { name: string }) {
				return <Text>Hello, {name}!</Text>;
			}

			const { lastFrame, rerender } = render(<Greeting name="World" />);

			expect(stripAnsi(lastFrame() ?? '')).toContain('Hello, World!');

			rerender(<Greeting name="Inkx" />);
			expect(stripAnsi(lastFrame() ?? '')).toContain('Hello, Inkx!');
		});

		test('frames array captures all renders', () => {
			function Message({ text }: { text: string }) {
				return <Text>{text}</Text>;
			}

			const { frames, rerender } = render(<Message text="First" />);
			rerender(<Message text="Second" />);
			rerender(<Message text="Third" />);

			expect(frames.length).toBe(3);
			expect(stripAnsi(frames[0] ?? '')).toContain('First');
			expect(stripAnsi(frames[1] ?? '')).toContain('Second');
			expect(stripAnsi(frames[2] ?? '')).toContain('Third');
		});
	});

	describe('Nested component rendering', () => {
		test('deeply nested components render correctly', () => {
			function Inner() {
				return <Text>Inner Content</Text>;
			}

			function Middle({ children }: { children: React.ReactNode }) {
				return <Box borderStyle="single">{children}</Box>;
			}

			function Outer() {
				return (
					<Box flexDirection="column">
						<Text>Header</Text>
						<Middle>
							<Inner />
						</Middle>
						<Text>Footer</Text>
					</Box>
				);
			}

			const { lastFrame } = render(<Outer />);
			const frame = stripAnsi(lastFrame() ?? '');

			expect(frame).toContain('Header');
			expect(frame).toContain('Inner Content');
			expect(frame).toContain('Footer');
		});

		test('conditional rendering works', () => {
			function ConditionalContent({ show }: { show: boolean }) {
				return (
					<Box flexDirection="column">
						<Text>Always visible</Text>
						{show && <Text>Conditional content</Text>}
					</Box>
				);
			}

			const { lastFrame, rerender } = render(<ConditionalContent show={false} />);
			expect(stripAnsi(lastFrame() ?? '')).toContain('Always visible');
			expect(stripAnsi(lastFrame() ?? '')).not.toContain('Conditional content');

			rerender(<ConditionalContent show={true} />);
			expect(stripAnsi(lastFrame() ?? '')).toContain('Always visible');
			expect(stripAnsi(lastFrame() ?? '')).toContain('Conditional content');
		});

		test('list rendering with map works', () => {
			const items = ['Apple', 'Banana', 'Cherry'];

			function List() {
				return (
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i}>- {item}</Text>
						))}
					</Box>
				);
			}

			const { lastFrame } = render(<List />);
			const frame = stripAnsi(lastFrame() ?? '');

			expect(frame).toContain('Apple');
			expect(frame).toContain('Banana');
			expect(frame).toContain('Cherry');
		});
	});

	describe('Text styling', () => {
		test('multiple styles can be combined', () => {
			const { lastFrame } = render(
				<Text bold italic underline color="red">
					Multi-styled
				</Text>,
			);
			expect(lastFrame()).toContain('Multi-styled');
		});

		test('nested Text elements inherit styling context', () => {
			const { lastFrame } = render(
				<Text>
					Normal{' '}
					<Text bold>
						Bold <Text color="red">Bold+Red</Text>
					</Text>
				</Text>,
			);
			const frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('Normal');
			expect(frame).toContain('Bold');
			expect(frame).toContain('Bold+Red');
		});
	});

	describe('Layout calculations', () => {
		test('flexGrow distributes space', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" width={30}>
					<Box flexGrow={1}>
						<Text>A</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>B</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>C</Text>
					</Box>
				</Box>,
			);
			const frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('A');
			expect(frame).toContain('B');
			expect(frame).toContain('C');
		});

		test('Spacer with flexDirection column creates vertical space', () => {
			const { lastFrame } = render(
				<Box flexDirection="column" height={5}>
					<Text>Top</Text>
					<Spacer />
					<Text>Bottom</Text>
				</Box>,
			);
			const frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('Top');
			expect(frame).toContain('Bottom');
		});

		test('padding adds space around content', () => {
			const { lastFrame } = render(
				<Box padding={2} width={20}>
					<Text>Padded</Text>
				</Box>,
			);
			const frame = lastFrame() ?? '';
			// Content should be present
			expect(frame).toContain('Padded');
		});
	});
});

// ============================================================================
// Behavioral Tests - Common Ink Patterns
// ============================================================================

describe('Common Ink Patterns', () => {
	const render = createTestRenderer({ columns: 80, rows: 30 });

	describe('Selection list pattern', () => {
		test('renders a selectable list with keyboard navigation', () => {
			function SelectList({ items }: { items: string[] }) {
				const [selectedIndex, setSelectedIndex] = useState(0);

				useInput((_input, key) => {
					if (key.downArrow) {
						setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
					}
					if (key.upArrow) {
						setSelectedIndex((i) => Math.max(i - 1, 0));
					}
				});

				return (
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i} color={i === selectedIndex ? 'green' : undefined}>
								{i === selectedIndex ? '>' : ' '} {item}
							</Text>
						))}
					</Box>
				);
			}

			const items = ['Option 1', 'Option 2', 'Option 3'];
			const { lastFrame, stdin } = render(<SelectList items={items} />);

			// Initial state - first item selected
			let frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('> Option 1');

			// Move down
			stdin.write('\x1b[B'); // down arrow
			frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('> Option 2');

			// Move down again
			stdin.write('\x1b[B'); // down arrow
			frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('> Option 3');

			// Try to move past end - should stay at last
			stdin.write('\x1b[B');
			frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('> Option 3');

			// Move up
			stdin.write('\x1b[A'); // up arrow
			frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('> Option 2');
		});
	});

	describe('Input field pattern', () => {
		test('captures typed characters', () => {
			const capturedInputs: string[] = [];

			function InputField() {
				const [value, setValue] = useState('');

				useInput((input, key) => {
					capturedInputs.push(input);
					if (key.backspace || key.delete) {
						setValue((v) => v.slice(0, -1));
					} else if (!key.return && input.length >= 1 && !key.ctrl && !key.meta && !key.escape) {
						setValue((v) => v + input);
					}
				});

				return (
					<Box>
						<Text>Input: {value}</Text>
						<Text inverse>_</Text>
					</Box>
				);
			}

			const { lastFrame, stdin } = render(<InputField />);

			// Type each character
			stdin.write('h');
			stdin.write('e');
			stdin.write('l');
			stdin.write('l');
			stdin.write('o');

			// Verify inputs were captured
			expect(capturedInputs).toEqual(['h', 'e', 'l', 'l', 'o']);

			const frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('Input: hello');

			// Test delete key (0x7f is what terminals send for backspace/delete)
			stdin.write('\x7f');
			expect(stripAnsi(lastFrame() ?? '')).toContain('Input: hell');
		});
	});

	describe('Loading spinner pattern', () => {
		test('displays different states', () => {
			function Spinner({
				isLoading,
				message,
			}: {
				isLoading: boolean;
				message: string;
			}) {
				return (
					<Box>
						<Text>{isLoading ? '...' : '+'}</Text>
						<Text> {message}</Text>
					</Box>
				);
			}

			const { lastFrame, rerender } = render(<Spinner isLoading={true} message="Loading..." />);

			let frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('...');
			expect(frame).toContain('Loading...');

			rerender(<Spinner isLoading={false} message="Done!" />);
			frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('+');
			expect(frame).toContain('Done!');
		});
	});

	describe('Status bar pattern', () => {
		test('renders full-width status bar', () => {
			function StatusBar({
				mode,
				filename,
			}: {
				mode: string;
				filename: string;
			}) {
				return (
					<Box flexDirection="row" width={40}>
						<Text inverse> {mode} </Text>
						<Spacer />
						<Text>{filename}</Text>
					</Box>
				);
			}

			const { lastFrame } = render(<StatusBar mode="NORMAL" filename="test.txt" />);
			const frame = stripAnsi(lastFrame() ?? '');

			expect(frame).toContain('NORMAL');
			expect(frame).toContain('test.txt');
		});
	});

	describe('Tab panel pattern', () => {
		test('switches between tabs', () => {
			function TabPanel() {
				const [activeTab, setActiveTab] = useState(0);
				const tabs = ['Home', 'Settings', 'Help'];

				useInput((_input, key) => {
					if (key.tab) {
						setActiveTab((t) => (t + 1) % tabs.length);
					}
				});

				return (
					<Box flexDirection="column">
						<Box flexDirection="row">
							{tabs.map((tab, i) => (
								<Text key={i} inverse={i === activeTab}>
									{' '}
									{tab}{' '}
								</Text>
							))}
						</Box>
						<Box marginTop={1}>
							<Text>Content for: {tabs[activeTab]}</Text>
						</Box>
					</Box>
				);
			}

			const { lastFrame, stdin } = render(<TabPanel />);

			let frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('Content for: Home');

			// Press tab to switch
			stdin.write('\t');
			frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('Content for: Settings');

			stdin.write('\t');
			frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('Content for: Help');

			// Wrap around
			stdin.write('\t');
			frame = stripAnsi(lastFrame() ?? '');
			expect(frame).toContain('Content for: Home');
		});
	});
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases', () => {
	const render = createTestRenderer({ columns: 80, rows: 30 });

	test('empty Box renders without error', () => {
		const { lastFrame } = render(<Box />);
		expect(lastFrame()).toBeDefined();
	});

	test('empty Text renders without error', () => {
		const { lastFrame } = render(<Text />);
		expect(lastFrame()).toBeDefined();
	});

	test('null children are handled', () => {
		const { lastFrame } = render(
			<Box>
				<Text>Before</Text>
				{null}
				<Text>After</Text>
			</Box>,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Before');
		expect(frame).toContain('After');
	});

	test('undefined children are handled', () => {
		const { lastFrame } = render(
			<Box>
				<Text>Before</Text>
				{undefined}
				<Text>After</Text>
			</Box>,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Before');
		expect(frame).toContain('After');
	});

	test('boolean children are handled', () => {
		const { lastFrame } = render(
			<Box>
				{true && <Text>Shown</Text>}
				{false && <Text>Hidden</Text>}
			</Box>,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Shown');
		expect(frame).not.toContain('Hidden');
	});

	test('number children render correctly', () => {
		const { lastFrame } = render(<Text>{42}</Text>);
		expect(stripAnsi(lastFrame() ?? '')).toContain('42');
	});

	test('mixed children types render correctly', () => {
		const isActive = true; // Testing ternary expression handling
		const { lastFrame } = render(
			<Text>
				Count: {10} - Status: {'ok'} - Active: {isActive ? 'yes' : 'no'}
			</Text>,
		);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Count: 10');
		expect(frame).toContain('Status: ok');
		expect(frame).toContain('Active: yes');
	});
});
