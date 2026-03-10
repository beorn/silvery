/**
 * Silvery Diff/Output Phase Benchmarks
 *
 * Measures the terminal diff and ANSI output generation phase in isolation.
 * This is Phase 4 of the pipeline: comparing two buffers and producing
 * minimal ANSI escape sequences for the differences.
 *
 * Run: bun vitest bench vendor/silvery/tests/perf/diff.bench.ts
 */

import { bench, describe, beforeAll } from "vitest";
import { TerminalBuffer, createBuffer } from "@silvery/term/buffer";
import { outputPhase } from "@silvery/term/pipeline/output-phase";

// ============================================================================
// Buffer Helpers
// ============================================================================

/** Fill a buffer with text content to simulate rendered output. */
function fillWithContent(buffer: TerminalBuffer, density: number): void {
  const w = buffer.width;
  const h = buffer.height;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.random() < density) {
        const char = chars[Math.floor(Math.random() * chars.length)]!;
        buffer.setCell(x, y, {
          char,
          fg: x % 8,
          bg: null,
          underlineColor: null,
          attrs: {
            bold: x % 5 === 0,
            dim: false,
            italic: y % 3 === 0,
            underline: false,
            blink: false,
            inverse: false,
            hidden: false,
            strikethrough: false,
          },
          wide: false,
          continuation: false,
        });
      }
    }
  }
}

/** Create a buffer with scattered changes vs a base buffer. */
function createWithChanges(base: TerminalBuffer, changePercent: number): TerminalBuffer {
  const next = base.clone();
  const w = base.width;
  const h = base.height;
  const totalCells = w * h;
  const changesToMake = Math.floor(totalCells * changePercent);

  for (let i = 0; i < changesToMake; i++) {
    const x = Math.floor(Math.random() * w);
    const y = Math.floor(Math.random() * h);
    next.setCell(x, y, {
      char: "X",
      fg: 1, // red
      bg: null,
      underlineColor: null,
      attrs: { bold: true },
      wide: false,
      continuation: false,
    });
  }
  return next;
}

/** Create a buffer with a single row changed (simulates cursor move). */
function createWithRowChange(base: TerminalBuffer, row: number): TerminalBuffer {
  const next = base.clone();
  const w = base.width;
  for (let x = 0; x < w; x++) {
    next.setCell(x, row, {
      char: ">",
      fg: 2, // green
      bg: null,
      underlineColor: null,
      attrs: { bold: true, inverse: true },
      wide: false,
      continuation: false,
    });
  }
  return next;
}

// ============================================================================
// Benchmark Fixtures
// ============================================================================

// Small terminal (80x24)
let small_base: TerminalBuffer;
let small_no_changes: TerminalBuffer;
let small_1pct: TerminalBuffer;
let small_10pct: TerminalBuffer;
let small_50pct: TerminalBuffer;
let small_full: TerminalBuffer;
let small_single_row: TerminalBuffer;

// Large terminal (200x50)
let large_base: TerminalBuffer;
let large_no_changes: TerminalBuffer;
let large_10pct: TerminalBuffer;
let large_full: TerminalBuffer;

beforeAll(() => {
  // Small terminal
  small_base = createBuffer(80, 24);
  fillWithContent(small_base, 0.7);
  small_no_changes = small_base.clone();
  small_1pct = createWithChanges(small_base, 0.01);
  small_10pct = createWithChanges(small_base, 0.1);
  small_50pct = createWithChanges(small_base, 0.5);
  small_full = createBuffer(80, 24);
  fillWithContent(small_full, 0.8);
  small_single_row = createWithRowChange(small_base, 5);

  // Large terminal
  large_base = createBuffer(200, 50);
  fillWithContent(large_base, 0.7);
  large_no_changes = large_base.clone();
  large_10pct = createWithChanges(large_base, 0.1);
  large_full = createBuffer(200, 50);
  fillWithContent(large_full, 0.8);
});

// ============================================================================
// Diff: Small Terminal (80x24)
// ============================================================================

describe("Diff: 80x24", () => {
  bench("No changes (skip all rows)", () => {
    outputPhase(small_base, small_no_changes, "fullscreen");
  });

  bench("1% cells changed (~19 cells)", () => {
    outputPhase(small_base, small_1pct, "fullscreen");
  });

  bench("10% cells changed (~192 cells)", () => {
    outputPhase(small_base, small_10pct, "fullscreen");
  });

  bench("50% cells changed (~960 cells)", () => {
    outputPhase(small_base, small_50pct, "fullscreen");
  });

  bench("Full repaint (all cells different)", () => {
    outputPhase(small_base, small_full, "fullscreen");
  });

  bench("Single row change (cursor move)", () => {
    outputPhase(small_base, small_single_row, "fullscreen");
  });

  bench("First render (no prev buffer)", () => {
    outputPhase(null, small_base, "fullscreen");
  });
});

// ============================================================================
// Diff: Large Terminal (200x50)
// ============================================================================

describe("Diff: 200x50", () => {
  bench("No changes", () => {
    outputPhase(large_base, large_no_changes, "fullscreen");
  });

  bench("10% cells changed", () => {
    outputPhase(large_base, large_10pct, "fullscreen");
  });

  bench("Full repaint", () => {
    outputPhase(large_base, large_full, "fullscreen");
  });
});

// ============================================================================
// Diff: Inline Mode
// ============================================================================

describe("Diff: Inline Mode (80x24)", () => {
  bench("No changes", () => {
    outputPhase(small_base, small_no_changes, "inline");
  });

  bench("10% cells changed", () => {
    outputPhase(small_base, small_10pct, "inline");
  });

  bench("First render", () => {
    outputPhase(null, small_base, "inline");
  });
});
