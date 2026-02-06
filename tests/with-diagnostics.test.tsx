/**
 * Tests for withDiagnostics plugin
 */

import React from "react"
import { describe, expect, it } from "vitest"
import { Box, Text, withCommands, withDiagnostics } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"
import type { CommandDef } from "../src/with-commands.js"

const render = createRenderer({ cols: 40, rows: 10 })

// Simple counter component for testing
function Counter({ count, label }: { count: number; label?: string }) {
  return (
    <Box flexDirection="column">
      <Text>{label ?? "Breadcrumb"}</Text>
      <Text>Count: {count}</Text>
      <Text>Status bar</Text>
    </Box>
  )
}

// Create a simple command registry for testing
function createTestRegistry() {
  const commands: CommandDef[] = [
    {
      id: "cursor_down",
      name: "Move Down",
      description: "Move cursor down",
      execute: () => ({ type: "CURSOR_DOWN" }),
    },
    {
      id: "increment",
      name: "Increment",
      description: "Increment counter",
      execute: () => ({ type: "INCREMENT" }),
    },
  ]

  return {
    get: (id: string) => commands.find((c) => c.id === id),
    getAll: () => commands,
  }
}

describe("withDiagnostics", () => {
  it("passes through when no checks enabled", () => {
    const app = render(<Counter count={0} />)
    const withCmd = withCommands(app, {
      registry: createTestRegistry(),
      getContext: () => ({}),
      handleAction: () => {},
    })

    const wrapped = withDiagnostics(withCmd, {
      checkIncremental: false,
      checkStability: false,
      checkReplay: false,
    })

    // Should return the same object when no checks enabled
    expect(wrapped).toBe(withCmd)
  })

  it("wraps cmd when checks are enabled", () => {
    const app = render(<Counter count={0} />)
    const withCmd = withCommands(app, {
      registry: createTestRegistry(),
      getContext: () => ({}),
      handleAction: () => {},
    })

    const wrapped = withDiagnostics(withCmd, {
      checkIncremental: true,
    })

    // Should return a new object with wrapped cmd
    expect(wrapped).not.toBe(withCmd)
    expect(wrapped.cmd).toBeDefined()
  })

  it("preserves command metadata after wrapping", async () => {
    const app = render(<Counter count={0} />)
    const withCmd = withCommands(app, {
      registry: createTestRegistry(),
      getContext: () => ({}),
      handleAction: () => {},
    })

    const wrapped = withDiagnostics(withCmd, {
      checkIncremental: true,
    })

    const downCmd = wrapped.cmd.down
    expect(downCmd).toBeDefined()
    expect(downCmd!.id).toBe("cursor_down")
    expect(downCmd!.name).toBe("Move Down")
    expect(downCmd!.help).toBe("Move cursor down")
  })

  it("runs incremental check for all commands", async () => {
    const app = render(<Counter count={0} />)
    const withCmd = withCommands(app, {
      registry: createTestRegistry(),
      getContext: () => ({}),
      handleAction: () => {},
    })

    const wrapped = withDiagnostics(withCmd, {
      checkIncremental: true,
    })

    // Should not throw - incremental and fresh should match
    await wrapped.cmd.down!()
    await wrapped.cmd.increment!()
  })

  it("runs stability check for cursor commands", async () => {
    const app = render(<Counter count={0} />)
    const withCmd = withCommands(app, {
      registry: createTestRegistry(),
      getContext: () => ({}),
      handleAction: () => {},
    })

    const wrapped = withDiagnostics(withCmd, {
      checkStability: true,
    })

    // cursor_down should pass stability check (content doesn't change)
    await wrapped.cmd.down!()
  })

  it("skips specified lines in stability check", async () => {
    const app = render(<Counter count={0} />)
    const withCmd = withCommands(app, {
      registry: createTestRegistry(),
      getContext: () => ({}),
      handleAction: () => {},
    })

    const wrapped = withDiagnostics(withCmd, {
      checkStability: true,
      skipLines: [0, -1], // Skip breadcrumb (first) and status (last)
    })

    // Should pass even though we're skipping lines
    await wrapped.cmd.down!()
  })

  it("preserves cmd.all() and cmd.describe() methods", () => {
    const app = render(<Counter count={0} />)
    const withCmd = withCommands(app, {
      registry: createTestRegistry(),
      getContext: () => ({}),
      handleAction: () => {},
    })

    const wrapped = withDiagnostics(withCmd, {
      checkIncremental: true,
    })

    // all() should still work
    const allCmds = wrapped.cmd.all()
    expect(allCmds).toHaveLength(2)
    expect(allCmds[0]!.id).toBe("cursor_down")

    // describe() should still work
    const description = wrapped.cmd.describe()
    expect(description).toContain("cursor_down")
    expect(description).toContain("increment")
  })
})
