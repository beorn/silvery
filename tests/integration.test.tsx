/**
 * Inkx Integration Tests
 *
 * Tests that verify the rendering works correctly.
 * Uses simplified text extraction for fast, reliable testing.
 */

import { describe, expect, test } from "bun:test";
import React from "react";
import { Box, Newline, Spacer, Text } from "../src/components/index.js";
import { createTestRenderer } from "../src/testing/index.js";

const render = createTestRenderer();

describe("Inkx Integration", () => {
  describe("Basic Rendering", () => {
    test("renders simple text", () => {
      const { lastFrame } = render(<Text>Hello World</Text>);
      expect(lastFrame()).toContain("Hello World");
    });

    test("renders nested boxes", () => {
      const { lastFrame } = render(
        <Box flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain("Line 1");
      expect(frame).toContain("Line 2");
    });

    test("renders with colors", () => {
      const { lastFrame } = render(<Text color="red">Red Text</Text>);
      expect(lastFrame()).toContain("Red Text");
    });

    test("renders with bold", () => {
      const { lastFrame } = render(<Text bold>Bold Text</Text>);
      expect(lastFrame()).toContain("Bold Text");
    });
  });

  describe("Layout", () => {
    test("renders horizontal layout", () => {
      const { lastFrame } = render(
        <Box flexDirection="row">
          <Text>Left</Text>
          <Text>Right</Text>
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain("Left");
      expect(frame).toContain("Right");
    });

    test("renders vertical layout", () => {
      const { lastFrame } = render(
        <Box flexDirection="column">
          <Text>Top</Text>
          <Text>Bottom</Text>
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain("Top");
      expect(frame).toContain("Bottom");
    });

    test("Spacer renders without error", () => {
      const { lastFrame } = render(
        <Box flexDirection="row" width={20}>
          <Text>A</Text>
          <Spacer />
          <Text>B</Text>
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain("A");
      expect(frame).toContain("B");
    });

    test("Newline renders without error", () => {
      const { lastFrame } = render(
        <Box flexDirection="column">
          <Text>Before</Text>
          <Newline count={2} />
          <Text>After</Text>
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain("Before");
      expect(frame).toContain("After");
    });
  });

  describe("Borders", () => {
    test("renders single border", () => {
      const { lastFrame } = render(
        <Box borderStyle="single" width={10} height={3}>
          <Text>Hi</Text>
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain("Hi");
      // Should have border characters
      expect(frame).toMatch(/[─│┌┐└┘]/);
    });

    test("renders double border", () => {
      const { lastFrame } = render(
        <Box borderStyle="double" width={10} height={3}>
          <Text>Hi</Text>
        </Box>,
      );
      const frame = lastFrame();
      expect(frame).toContain("Hi");
      // Should have double border characters
      expect(frame).toMatch(/[═║╔╗╚╝]/);
    });
  });

  describe("Rerender", () => {
    test("rerender updates content", () => {
      const { lastFrame, rerender } = render(<Text>Initial</Text>);
      expect(lastFrame()).toContain("Initial");

      rerender(<Text>Updated</Text>);
      expect(lastFrame()).toContain("Updated");
    });

    test("tracks multiple frames", () => {
      const { frames, rerender } = render(<Text>Frame 1</Text>);

      rerender(<Text>Frame 2</Text>);
      rerender(<Text>Frame 3</Text>);

      expect(frames.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Unmount", () => {
    test("unmount cleans up", () => {
      const { unmount, lastFrame } = render(<Text>Content</Text>);
      expect(lastFrame()).toContain("Content");

      unmount();

      // After unmount, lastFrame should still return last rendered frame
      expect(lastFrame()).toContain("Content");
    });
  });
});
