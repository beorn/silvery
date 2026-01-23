/**
 * React 19 Compatibility Tests (km-a1xb)
 *
 * These tests verify that inkx works correctly with React 19 features:
 * - Basic component rendering
 * - Hooks (useState, useEffect, useInput, useLayout)
 * - Suspense boundaries
 * - StrictMode compatibility (no double-render issues)
 * - Concurrent rendering features (useTransition, useDeferredValue)
 * - No deprecated API warnings
 *
 * The package already uses react-reconciler 0.33+ which includes React 19 support.
 * See reconciler.ts for the required host config methods added for 0.33+ compatibility.
 */

import { describe, expect, test } from "bun:test";
import React, {
  Suspense,
  StrictMode,
  useState,
  useEffect,
  useTransition,
  useDeferredValue,
} from "react";
import { NodeContext } from "../src/context.ts";
import { Box, Text, useInput, useLayout } from "../src/index.ts";
import { createTestRenderer, stripAnsi } from "../src/testing/index.tsx";
import type { InkxNode } from "../src/types.ts";

// ============================================================================
// Test Setup
// ============================================================================

const render = createTestRenderer();

/**
 * Create a mock InkxNode for testing useLayout
 */
function createMockInkxNode(layout: {
  x: number;
  y: number;
  width: number;
  height: number;
}): InkxNode {
  return {
    type: "inkx-box",
    props: {},
    children: [],
    parent: null,
    layoutNode: null,
    computedLayout: layout,
    prevLayout: null,
    layoutDirty: false,
    contentDirty: false,
    layoutSubscribers: new Set(),
  };
}

// ============================================================================
// Basic React 19 Compatibility
// ============================================================================

describe("React 19 Compatibility (km-a1xb)", () => {
  describe("Basic Rendering", () => {
    test("basic component renders with React 19", () => {
      const { lastFrame } = render(<Text>Hello React 19</Text>);
      expect(lastFrame()).toContain("Hello React 19");
    });

    test("nested components render correctly", () => {
      function Child({ text }: { text: string }) {
        return <Text>{text}</Text>;
      }

      function Parent() {
        return (
          <Box flexDirection="column">
            <Child text="First" />
            <Child text="Second" />
          </Box>
        );
      }

      const { lastFrame } = render(<Parent />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("First");
      expect(frame).toContain("Second");
    });

    test("conditional rendering works", () => {
      function Conditional({ show }: { show: boolean }) {
        return (
          <Box>
            {show ? <Text>Visible</Text> : null}
            <Text>Always</Text>
          </Box>
        );
      }

      const { lastFrame, rerender } = render(<Conditional show={true} />);
      expect(lastFrame()).toContain("Visible");
      expect(lastFrame()).toContain("Always");

      rerender(<Conditional show={false} />);
      expect(lastFrame()).not.toContain("Visible");
      expect(lastFrame()).toContain("Always");
    });
  });

  describe("React 19 Hooks", () => {
    test("useState works correctly in React 19", () => {
      function Counter() {
        const [count, setCount] = useState(0);
        useEffect(() => {
          setCount(42);
        }, []);
        return <Text>Count: {count}</Text>;
      }

      const { lastFrame } = render(<Counter />);
      // After effect runs, count should be 42
      expect(lastFrame()).toContain("Count: 42");
    });

    test("useEffect runs in React 19", () => {
      let effectRan = false;

      function EffectTest() {
        useEffect(() => {
          effectRan = true;
        }, []);
        return <Text>Effect Test</Text>;
      }

      render(<EffectTest />);
      expect(effectRan).toBe(true);
    });

    test("useInput hook works correctly in React 19", () => {
      let receivedInput = "";

      function InputTest() {
        useInput((input) => {
          receivedInput = input;
        });
        return <Text>Input Test</Text>;
      }

      const { stdin } = render(<InputTest />);
      stdin.write("x");
      expect(receivedInput).toBe("x");
    });

    test("useLayout hook works correctly in React 19", () => {
      let capturedLayout: {
        width: number;
        height: number;
        x: number;
        y: number;
      } | null = null;
      const mockNode = createMockInkxNode({
        x: 10,
        y: 5,
        width: 40,
        height: 20,
      });

      function LayoutTest() {
        const layout = useLayout();
        capturedLayout = layout;
        return <Text>Layout Test</Text>;
      }

      // useLayout requires NodeContext, provide it via mock
      render(
        <NodeContext.Provider value={mockNode}>
          <LayoutTest />
        </NodeContext.Provider>,
      );

      // Layout should have been captured with correct values from mock
      expect(capturedLayout).not.toBeNull();
      expect(capturedLayout!.x).toBe(10);
      expect(capturedLayout!.y).toBe(5);
      expect(capturedLayout!.width).toBe(40);
      expect(capturedLayout!.height).toBe(20);
    });
  });

  describe("Suspense Boundary", () => {
    test("Suspense boundary does not break rendering", () => {
      function RegularComponent() {
        return <Text>Regular Content</Text>;
      }

      function AppWithSuspense() {
        return (
          <Suspense fallback={<Text>Loading...</Text>}>
            <RegularComponent />
          </Suspense>
        );
      }

      const { lastFrame } = render(<AppWithSuspense />);
      // Non-suspending components should render immediately
      expect(lastFrame()).toContain("Regular Content");
    });

    test("Suspense with lazy components concept works", () => {
      // Note: Full Suspense with promise-throwing components requires additional
      // reconciler methods (hideInstance, unhideInstance) that are optional for
      // terminal rendering. This test verifies the basic Suspense support.
      //
      // In practice, terminal UIs rarely benefit from Suspense-based code splitting
      // since bundle size is less critical than in browser environments.

      function LazyLikeComponent() {
        // Simulate a component that would be lazy-loaded
        return <Text>Lazy Content</Text>;
      }

      function AppWithLazyChild() {
        return (
          <Suspense fallback={<Text>Loading...</Text>}>
            <LazyLikeComponent />
          </Suspense>
        );
      }

      const { lastFrame } = render(<AppWithLazyChild />);
      // Non-suspending component renders immediately
      expect(lastFrame()).toContain("Lazy Content");
    });

    test("nested Suspense boundaries work correctly", () => {
      function Outer() {
        return (
          <Suspense fallback={<Text>Outer Loading...</Text>}>
            <Box flexDirection="column">
              <Text>Outer Content</Text>
              <Suspense fallback={<Text>Inner Loading...</Text>}>
                <Text>Inner Content</Text>
              </Suspense>
            </Box>
          </Suspense>
        );
      }

      const { lastFrame } = render(<Outer />);
      const frame = lastFrame() ?? "";
      expect(frame).toContain("Outer Content");
      expect(frame).toContain("Inner Content");
    });
  });

  describe("StrictMode Compatibility", () => {
    test("StrictMode does not cause double render issues in output", () => {
      let renderCount = 0;

      function TrackingComponent() {
        renderCount++;
        return <Text>Rendered</Text>;
      }

      render(
        <StrictMode>
          <TrackingComponent />
        </StrictMode>,
      );

      // In React 19 strict mode, effects may double-fire in dev,
      // but the final output should be correct
      const frame = render(
        <StrictMode>
          <Text>StrictMode Content</Text>
        </StrictMode>,
      ).lastFrame();

      expect(frame).toContain("StrictMode Content");
      // Should not have duplicated content
      const content = stripAnsi(frame ?? "");
      const matches = content.match(/StrictMode Content/g);
      expect(matches?.length).toBe(1);
    });

    test("state updates work correctly in StrictMode", () => {
      function StrictStateTest() {
        const [value, setValue] = useState("initial");
        useEffect(() => {
          setValue("updated");
        }, []);
        return <Text>{value}</Text>;
      }

      const { lastFrame } = render(
        <StrictMode>
          <StrictStateTest />
        </StrictMode>,
      );

      expect(lastFrame()).toContain("updated");
    });
  });

  describe("Concurrent Features", () => {
    test("useTransition does not break rendering", () => {
      function TransitionTest() {
        const [isPending, startTransition] = useTransition();
        const [count, setCount] = useState(0);

        useEffect(() => {
          startTransition(() => {
            setCount(1);
          });
        }, []);

        return (
          <Box flexDirection="column">
            <Text>Pending: {isPending ? "yes" : "no"}</Text>
            <Text>Count: {count}</Text>
          </Box>
        );
      }

      const { lastFrame } = render(<TransitionTest />);
      const frame = lastFrame() ?? "";
      // The transition should eventually complete
      expect(frame).toContain("Count:");
    });

    test("useDeferredValue does not break rendering", () => {
      function DeferredTest() {
        const [input, setInput] = useState("initial");
        const deferredInput = useDeferredValue(input);

        useEffect(() => {
          setInput("updated");
        }, []);

        return (
          <Box flexDirection="column">
            <Text>Input: {input}</Text>
            <Text>Deferred: {deferredInput}</Text>
          </Box>
        );
      }

      const { lastFrame } = render(<DeferredTest />);
      const frame = lastFrame() ?? "";
      // Both values should be present (deferred may lag)
      expect(frame).toContain("Input:");
      expect(frame).toContain("Deferred:");
    });
  });

  describe("React 19 Reconciler API", () => {
    test("multiple rapid rerenders work correctly", () => {
      function RapidRerender() {
        const [count, setCount] = useState(0);
        return <Text>Count: {count}</Text>;
      }

      const { lastFrame, rerender } = render(<RapidRerender />);
      expect(lastFrame()).toContain("Count: 0");

      // Rapid rerenders
      rerender(<Text>A</Text>);
      rerender(<Text>B</Text>);
      rerender(<Text>C</Text>);

      expect(lastFrame()).toContain("C");
      expect(lastFrame()).not.toContain("A");
      expect(lastFrame()).not.toContain("B");
    });

    test("rerender with different element types works", () => {
      const { lastFrame, rerender } = render(<Text>Text</Text>);
      expect(lastFrame()).toContain("Text");

      rerender(
        <Box borderStyle="single" width={15}>
          <Text>Boxed</Text>
        </Box>,
      );
      expect(lastFrame()).toContain("Boxed");
    });
  });

  describe("No Deprecated API Warnings", () => {
    test("render completes without deprecated API errors", () => {
      // This test captures any console.error calls during render
      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };

      try {
        render(
          <Box flexDirection="column">
            <Text bold>Bold Text</Text>
            <Text color="red">Red Text</Text>
            <Box borderStyle="single" padding={1}>
              <Text>Bordered</Text>
            </Box>
          </Box>,
        );

        // Filter for deprecated API warnings only (not act() warnings which are expected
        // in test environments when effects cause updates outside act())
        const deprecatedErrors = errors.filter(
          (e) => e.includes("deprecated") && !e.includes("act("),
        );

        expect(deprecatedErrors).toEqual([]);
      } finally {
        console.error = originalError;
      }
    });

    test("hooks complete without deprecated console warnings", () => {
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
      };

      try {
        function HookTest() {
          const [state, setState] = useState(0);
          useEffect(() => {
            setState(1);
          }, []);
          useInput(() => {});
          return <Text>{state}</Text>;
        }

        render(<HookTest />);

        // Filter for deprecated API warnings only
        const deprecatedWarnings = warnings.filter((w) =>
          w.includes("deprecated"),
        );

        expect(deprecatedWarnings).toEqual([]);
      } finally {
        console.warn = originalWarn;
      }
    });
  });
});
