/**
 * OSC 22 Mouse Cursor Shape Tests
 *
 * Bead: km-silvery.osc-mouse
 *
 * Tests the escape sequence generation for OSC 22 mouse cursor shapes.
 */

import { describe, test, expect } from "vitest";
import { setMouseCursorShape, resetMouseCursorShape } from "@silvery/term/output";

describe("OSC 22 mouse cursor", () => {
  test("setMouseCursorShape generates correct sequence", () => {
    expect(setMouseCursorShape("default")).toBe("\x1b]22;default\x07");
    expect(setMouseCursorShape("text")).toBe("\x1b]22;text\x07");
    expect(setMouseCursorShape("pointer")).toBe("\x1b]22;pointer\x07");
    expect(setMouseCursorShape("crosshair")).toBe("\x1b]22;crosshair\x07");
    expect(setMouseCursorShape("move")).toBe("\x1b]22;move\x07");
    expect(setMouseCursorShape("not-allowed")).toBe("\x1b]22;not-allowed\x07");
    expect(setMouseCursorShape("wait")).toBe("\x1b]22;wait\x07");
    expect(setMouseCursorShape("help")).toBe("\x1b]22;help\x07");
  });

  test("resetMouseCursorShape generates default sequence", () => {
    expect(resetMouseCursorShape()).toBe("\x1b]22;default\x07");
  });

  test("setMouseCursorShape uses OSC format (ESC ] ... BEL)", () => {
    const seq = setMouseCursorShape("pointer");
    // Starts with ESC ]
    expect(seq.startsWith("\x1b]")).toBe(true);
    // Ends with BEL
    expect(seq.endsWith("\x07")).toBe(true);
    // Contains OSC 22
    expect(seq).toContain("22;");
  });
});
