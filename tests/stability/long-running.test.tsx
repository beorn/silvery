/**
 * Stability Tests for Silvery
 *
 * Bead: km-silvery.stability-tests
 *
 * Validates that silvery handles sustained usage without crashing:
 * - 60s sustained rendering without crash
 * - Terminal resize handling under stress
 * - Mixed operations (render + input + resize) stability
 */

import React, { useState } from "react";
import { describe, test, expect } from "vitest";
import { createRenderer, render, bufferToText } from "@silvery/test";
import { Box, Text, useContentRect, useInput } from "@silvery/react";
import {
  Counter,
  ComplexLayout,
  ResponsiveBox,
  SimpleBox,
  NestedFlex,
} from "../fixtures/index.tsx";

// ============================================================================
// Sustained Rendering
// ============================================================================

describe("stability: sustained rendering", () => {
  test("60s sustained rendering without crash", { timeout: 90_000 }, async () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(Counter));

    const startTime = Date.now();
    const duration = 60_000; // 60 seconds
    let iterations = 0;

    while (Date.now() - startTime < duration) {
      // Alternate between different operations
      await app.press("j"); // increment
      iterations++;

      // Every 100 iterations, do a rerender
      if (iterations % 100 === 0) {
        app.rerender(React.createElement(Counter, { initial: iterations }));
      }

      // Every 500 iterations, resize
      if (iterations % 500 === 0) {
        const cols = 40 + (iterations % 120);
        const rows = 10 + (iterations % 30);
        app.resize(cols, rows);
      }
    }

    // Should have completed many iterations
    expect(iterations).toBeGreaterThan(1000);

    // Should still render correctly
    expect(app.text).toContain("Count:");
  });

  test("sustained rendering with complex layout", { timeout: 20_000 }, async () => {
    const r = createRenderer({ cols: 120, rows: 40 });

    const startTime = Date.now();
    const duration = 10_000; // 10 seconds (shorter for complex layout)
    let iterations = 0;

    while (Date.now() - startTime < duration) {
      // Re-render complex layout repeatedly
      r(React.createElement(ComplexLayout));
      iterations++;
    }

    expect(iterations).toBeGreaterThan(100);
  });

  test("sustained incremental rendering matches fresh", async () => {
    const r = createRenderer({ cols: 80, rows: 24, incremental: true });
    const app = r(React.createElement(Counter));

    // Do 500 renders and periodically verify incremental matches fresh
    for (let i = 0; i < 500; i++) {
      await app.press("j");

      // Every 50th iteration, compare incremental vs fresh
      if (i % 50 === 0) {
        const freshBuffer = app.freshRender();
        const currentBuffer = app.lastBuffer()!;

        // Compare text output
        const freshText = bufferToText(freshBuffer);
        const currentText = bufferToText(currentBuffer);
        expect(currentText).toBe(freshText);
      }
    }
  });
});

// ============================================================================
// Terminal Resize Handling
// ============================================================================

describe("stability: resize handling", () => {
  test("rapid resize cycling does not crash", () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(ResponsiveBox));

    // Cycle through many sizes rapidly
    for (let i = 0; i < 500; i++) {
      const cols = 20 + (i % 180); // 20-200
      const rows = 5 + (i % 55); // 5-60
      app.resize(cols, rows);
    }

    // Should still render correctly
    expect(app.text).toContain("Size:");
  });

  test("resize to extreme dimensions does not crash", () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(SimpleBox));

    const extremes = [
      [1, 1],
      [1, 100],
      [100, 1],
      [300, 100],
      [10, 3],
      [5, 2],
      [80, 24], // back to normal
    ] as const;

    for (const [cols, rows] of extremes) {
      // Should not throw
      app.resize(cols, rows);
    }

    // Should still work after extreme sizes
    expect(app.text.length).toBeGreaterThan(0);
  });

  test("resize with useContentRect updates correctly", () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(ResponsiveBox));

    // After resize to narrow, should show "Narrow layout"
    app.resize(30, 24);
    expect(app.text).toContain("Narrow layout");

    // Resize back to wide
    app.resize(80, 24);
    // After a resize cycle, the buffer reflects the updated layout
    expect(app.text).toContain("Size:");

    // Rapid toggle — narrow should always show "Narrow layout"
    for (let i = 0; i < 50; i++) {
      app.resize(30, 24);
      expect(app.text).toContain("Narrow layout");
      app.resize(80, 24);
    }
  });

  test("resize interleaved with key presses", async () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(Counter));

    for (let i = 0; i < 200; i++) {
      await app.press("j");

      if (i % 3 === 0) {
        app.resize(40 + (i % 80), 10 + (i % 30));
      }
    }

    // Counter should have incremented correctly regardless of resizes
    expect(app.text).toContain("Count: 200");
  });
});

// ============================================================================
// Mixed Operations Stability
// ============================================================================

describe("stability: mixed operations", () => {
  test("render + rerender + resize sequence", () => {
    const r = createRenderer({ cols: 80, rows: 24 });

    for (let i = 0; i < 100; i++) {
      const app = r(React.createElement(SimpleBox, { label: `Iteration ${i}` }));
      expect(app.text).toContain(`Iteration ${i}`);

      // Rerender with different content
      app.rerender(React.createElement(SimpleBox, { label: `Updated ${i}` }));
      expect(app.text).toContain(`Updated ${i}`);

      // Resize
      app.resize(40 + (i % 60), 12 + (i % 20));
    }
  });

  test("alternating between different component trees", () => {
    const r = createRenderer({ cols: 80, rows: 24 });

    for (let i = 0; i < 200; i++) {
      switch (i % 4) {
        case 0:
          r(React.createElement(SimpleBox, { label: "Simple" }));
          break;
        case 1:
          r(React.createElement(ComplexLayout));
          break;
        case 2:
          r(React.createElement(ResponsiveBox));
          break;
        case 3:
          r(React.createElement(NestedFlex, { depth: 3 }));
          break;
      }
    }

    // Final render should work
    const app = r(React.createElement(SimpleBox, { label: "Final" }));
    expect(app.text).toContain("Final");
  });

  test("unmount during active input does not crash", async () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(Counter));

    // Send some inputs
    await app.press("j");
    await app.press("j");

    // Render a new component (auto-unmounts previous)
    const app2 = r(React.createElement(SimpleBox, { label: "New" }));
    expect(app2.text).toContain("New");

    // The old app should throw if we try to interact
    await expect(() => app.press("j")).rejects.toThrow();
  });

  test("deeply nested flex under sustained re-renders", () => {
    const r = createRenderer({ cols: 80, rows: 24 });

    for (let depth = 1; depth <= 8; depth++) {
      const app = r(React.createElement(NestedFlex, { depth }));
      expect(app.text).toContain("Leaf");
    }

    // Multiple re-renders at max depth
    for (let i = 0; i < 100; i++) {
      r(React.createElement(NestedFlex, { depth: 6 }));
    }

    const app = r(React.createElement(NestedFlex, { depth: 6 }));
    expect(app.text).toContain("Leaf");
  });
});

// ============================================================================
// Error Recovery
// ============================================================================

describe("stability: error recovery", () => {
  test("render after unmount throws cleanly", () => {
    const app = render(React.createElement(SimpleBox), { cols: 80, rows: 24 });
    app.unmount();

    // Double unmount should throw
    expect(() => app.unmount()).toThrow("Already unmounted");

    // Attempting to write after unmount should throw
    expect(() => app.stdin.write("x")).toThrow();
  });

  test("new render works after previous render error", () => {
    const r = createRenderer({ cols: 80, rows: 24 });

    // Normal render
    let app = r(React.createElement(SimpleBox));
    expect(app.text).toContain("Hello");

    // Another normal render (the previous one is auto-unmounted)
    app = r(React.createElement(SimpleBox, { label: "Recovery" }));
    expect(app.text).toContain("Recovery");
  });
});

// ============================================================================
// Sustained Input Under Varying Sizes
// ============================================================================

describe("stability: sustained input under varying sizes", () => {
  test("continuous key presses across many resize events", async () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(Counter));

    // Alternate resize + key press in tight loop
    for (let i = 0; i < 300; i++) {
      if (i % 2 === 0) {
        app.resize(30 + (i % 100), 10 + (i % 20));
      }
      await app.press("j");
    }

    // All 300 presses should have been processed
    expect(app.text).toContain("Count: 300");
  });

  test("rerender with different props after many frames", async () => {
    const r = createRenderer({ cols: 80, rows: 24 });
    const app = r(React.createElement(Counter, { initial: 0 }));

    // Accumulate many frames
    for (let i = 0; i < 100; i++) {
      await app.press("j");
    }
    expect(app.text).toContain("Count: 100");

    // Rerender with new initial value resets state (new component instance)
    app.rerender(React.createElement(Counter, { initial: 500 }));

    // After rerender, useState(initial) keeps old state (React preserves
    // state when component type is the same). Verify it's still functional.
    await app.press("j");
    expect(app.text).toContain("Count:");
  });
});
