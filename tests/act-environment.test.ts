/**
 * Tests that the main hightea module does NOT set IS_REACT_ACT_ENVIRONMENT.
 *
 * This is important because:
 * 1. IS_REACT_ACT_ENVIRONMENT = true causes React to emit act() warnings
 * 2. These warnings appear in production when using the TUI
 * 3. The testing module (hightea/testing) SHOULD set it, but the main module should not
 *
 * This test runs in a subprocess to ensure a clean global state.
 */

import { spawn } from "bun"
import { describe, expect, test } from "vitest"

describe("IS_REACT_ACT_ENVIRONMENT", () => {
  test("main hightea module does NOT set IS_REACT_ACT_ENVIRONMENT", async () => {
    // Create a test script that runs in isolation
    const testScript = `
			// Check before import
			const before = globalThis.IS_REACT_ACT_ENVIRONMENT;
			if (before !== undefined) {
				console.error("BEFORE:", before);
				process.exit(1);
			}

			// Import main module (NOT testing)
			await import("${import.meta.dirname}/../src/index.ts");

			// Check after import
			const after = globalThis.IS_REACT_ACT_ENVIRONMENT;
			if (after === true) {
				console.error("AFTER:", after);
				process.exit(2);
			}

			// Success
			process.exit(0);
		`

    const proc = spawn({
      cmd: ["bun", "-e", testScript],
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    if (exitCode === 1) {
      throw new Error(`IS_REACT_ACT_ENVIRONMENT was set before import (possibly by test framework)`)
    }
    if (exitCode === 2) {
      throw new Error(
        `hightea import set IS_REACT_ACT_ENVIRONMENT = true. This causes act() warnings in production. stderr: ${stderr}`,
      )
    }

    expect(exitCode).toBe(0)
  })

  test("testing module DOES set IS_REACT_ACT_ENVIRONMENT", async () => {
    // The testing module should set the flag (this is expected)
    const testScript = `
			// Check before import
			const before = globalThis.IS_REACT_ACT_ENVIRONMENT;

			// Import testing module
			await import("${import.meta.dirname}/../src/testing/index.tsx");

			// Should be set after import
			const after = globalThis.IS_REACT_ACT_ENVIRONMENT;
			if (after !== true) {
				console.error("Expected true, got:", after);
				process.exit(1);
			}

			// Success
			process.exit(0);
		`

    const proc = spawn({
      cmd: ["bun", "-e", testScript],
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    expect(exitCode).toBe(0)
  })
})
