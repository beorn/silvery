/**
 * Tests for withDiagnostics plugin
 */

import React from "react"
import { describe, expect, it } from "vitest"
import { Box, Text, withCommands, withDiagnostics } from "../src/index.js"
import { checkLayoutInvariants, VirtualTerminal } from "../src/with-diagnostics.js"
import { createRenderer } from "inkx/testing"
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
      checkLayout: false,
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

  it("runs layout check for all commands", async () => {
    const app = render(<Counter count={0} />)
    const withCmd = withCommands(app, {
      registry: createTestRegistry(),
      getContext: () => ({}),
      handleAction: () => {},
    })

    const wrapped = withDiagnostics(withCmd, {
      checkLayout: true,
      checkIncremental: false,
      checkStability: false,
      checkReplay: false,
    })

    // Should not throw - normal layout should be valid
    await wrapped.cmd.down!()
    await wrapped.cmd.increment!()
  })

  it("checkLayoutInvariants passes for valid layout", () => {
    const app = render(
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text>Col 1</Text>
          <Text>Col 2</Text>
        </Box>
        <Text>Row 2</Text>
      </Box>,
    )

    const root = app.getContainer()
    const violations = checkLayoutInvariants(root)
    expect(violations).toEqual([])
  })

  it("checkLayoutInvariants passes with overflow:hidden children", () => {
    // Children inside overflow:hidden may logically exceed parent bounds
    const app = render(
      <Box height={5} overflow="hidden">
        <Box height={10}>
          <Text>Tall content</Text>
        </Box>
      </Box>,
    )

    const root = app.getContainer()
    const violations = checkLayoutInvariants(root)
    expect(violations).toEqual([])
  })

  it("checkLayoutInvariants detects NaN in layout", () => {
    const app = render(
      <Box flexDirection="column">
        <Text>Hello</Text>
      </Box>,
    )

    // Corrupt a node's rect to have NaN
    const root = app.getContainer()
    const textNode = root.children[0]?.children[0]
    if (textNode?.contentRect) {
      textNode.contentRect = { ...textNode.contentRect, width: NaN }
    }

    const violations = checkLayoutInvariants(root)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]).toContain("invalid width")
  })

  it("checkLayoutInvariants detects negative dimensions", () => {
    const app = render(
      <Box flexDirection="column">
        <Text>Hello</Text>
      </Box>,
    )

    // Corrupt a node's rect to have negative height
    const root = app.getContainer()
    const textNode = root.children[0]?.children[0]
    if (textNode?.contentRect) {
      textNode.contentRect = { ...textNode.contentRect, height: -5 }
    }

    const violations = checkLayoutInvariants(root)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]).toContain("invalid height")
  })
})

// =============================================================================
// VirtualTerminal SGR Style Verification
// =============================================================================

describe("VirtualTerminal SGR style tracking", () => {
  it("tracks foreground color from SGR sequences", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[31m = red foreground, then write 'A'
    vt.applyAnsi("\x1b[31mA")

    const style = vt.getStyle(0, 0)
    expect(style.fg).toBe(1) // red = color index 1 (31 - 30)
    expect(style.bg).toBeNull()
    expect(vt.getChar(0, 0)).toBe("A")
  })

  it("tracks background color from SGR sequences", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[44m = blue background, then write 'B'
    vt.applyAnsi("\x1b[44mB")

    const style = vt.getStyle(0, 0)
    expect(style.fg).toBeNull()
    expect(style.bg).toBe(4) // blue = color index 4 (44 - 40)
  })

  it("tracks bold attribute", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[1m = bold
    vt.applyAnsi("\x1b[1mX")

    const style = vt.getStyle(0, 0)
    expect(style.bold).toBe(true)
    expect(style.dim).toBe(false)
  })

  it("tracks multiple attributes combined", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[1;3;4m = bold + italic + underline
    vt.applyAnsi("\x1b[1;3;4mH")

    const style = vt.getStyle(0, 0)
    expect(style.bold).toBe(true)
    expect(style.italic).toBe(true)
    expect(style.underline).toBe(true)
    expect(style.dim).toBe(false)
    expect(style.strikethrough).toBe(false)
  })

  it("resets all attributes with SGR 0", () => {
    const vt = new VirtualTerminal(10, 1)
    // Set bold+red, write 'A', reset, write 'B'
    vt.applyAnsi("\x1b[1;31mA\x1b[0mB")

    const styleA = vt.getStyle(0, 0)
    expect(styleA.bold).toBe(true)
    expect(styleA.fg).toBe(1)

    const styleB = vt.getStyle(1, 0)
    expect(styleB.bold).toBe(false)
    expect(styleB.fg).toBeNull()
  })

  it("resets with empty SGR params (\\x1b[m)", () => {
    const vt = new VirtualTerminal(10, 1)
    vt.applyAnsi("\x1b[1mA\x1b[mB")

    const styleA = vt.getStyle(0, 0)
    expect(styleA.bold).toBe(true)

    const styleB = vt.getStyle(1, 0)
    expect(styleB.bold).toBe(false)
    expect(styleB.fg).toBeNull()
  })

  it("tracks 256-color foreground (38;5;N)", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[38;5;196m = 256-color fg index 196
    vt.applyAnsi("\x1b[38;5;196mR")

    const style = vt.getStyle(0, 0)
    expect(style.fg).toBe(196)
  })

  it("tracks 256-color background (48;5;N)", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[48;5;21m = 256-color bg index 21
    vt.applyAnsi("\x1b[48;5;21mB")

    const style = vt.getStyle(0, 0)
    expect(style.bg).toBe(21)
  })

  it("tracks true color foreground (38;2;R;G;B)", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[38;2;255;128;0m = true color RGB(255,128,0)
    vt.applyAnsi("\x1b[38;2;255;128;0mO")

    const style = vt.getStyle(0, 0)
    expect(style.fg).toEqual({ r: 255, g: 128, b: 0 })
  })

  it("tracks true color background (48;2;R;G;B)", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[48;2;0;128;255m = true color bg RGB(0,128,255)
    vt.applyAnsi("\x1b[48;2;0;128;255mS")

    const style = vt.getStyle(0, 0)
    expect(style.bg).toEqual({ r: 0, g: 128, b: 255 })
  })

  it("tracks bright foreground colors (90-97)", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[91m = bright red foreground (color index 9)
    vt.applyAnsi("\x1b[91mR")

    const style = vt.getStyle(0, 0)
    expect(style.fg).toBe(9) // 91 - 90 + 8 = 9
  })

  it("tracks bright background colors (100-107)", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[104m = bright blue background (color index 12)
    vt.applyAnsi("\x1b[104mB")

    const style = vt.getStyle(0, 0)
    expect(style.bg).toBe(12) // 104 - 100 + 8 = 12
  })

  it("handles individual attribute resets", () => {
    const vt = new VirtualTerminal(10, 1)
    // Set all attributes, then reset them individually
    vt.applyAnsi("\x1b[1;2;3;4;7;9mA") // bold, dim, italic, underline, inverse, strikethrough
    vt.applyAnsi("\x1b[22mB") // bold+dim off
    vt.applyAnsi("\x1b[23mC") // italic off
    vt.applyAnsi("\x1b[24mD") // underline off
    vt.applyAnsi("\x1b[27mE") // inverse off
    vt.applyAnsi("\x1b[29mF") // strikethrough off

    const styleA = vt.getStyle(0, 0)
    expect(styleA.bold).toBe(true)
    expect(styleA.dim).toBe(true)
    expect(styleA.italic).toBe(true)
    expect(styleA.underline).toBe(true)
    expect(styleA.inverse).toBe(true)
    expect(styleA.strikethrough).toBe(true)

    const styleB = vt.getStyle(1, 0)
    expect(styleB.bold).toBe(false)
    expect(styleB.dim).toBe(false)

    const styleC = vt.getStyle(2, 0)
    expect(styleC.italic).toBe(false)

    const styleD = vt.getStyle(3, 0)
    expect(styleD.underline).toBe(false)

    const styleE = vt.getStyle(4, 0)
    expect(styleE.inverse).toBe(false)

    const styleF = vt.getStyle(5, 0)
    expect(styleF.strikethrough).toBe(false)
  })

  it("handles default fg/bg reset codes (39/49)", () => {
    const vt = new VirtualTerminal(10, 1)
    // Set red fg and blue bg, then reset each
    vt.applyAnsi("\x1b[31;44mA\x1b[39mB\x1b[49mC")

    const styleA = vt.getStyle(0, 0)
    expect(styleA.fg).toBe(1)
    expect(styleA.bg).toBe(4)

    const styleB = vt.getStyle(1, 0)
    expect(styleB.fg).toBeNull() // fg reset to default
    expect(styleB.bg).toBe(4) // bg still blue

    const styleC = vt.getStyle(2, 0)
    expect(styleC.fg).toBeNull()
    expect(styleC.bg).toBeNull() // bg reset to default
  })

  it("handles underline style subparameters (4:N)", () => {
    const vt = new VirtualTerminal(10, 1)
    // \x1b[4:3m = curly underline
    vt.applyAnsi("\x1b[4:3mU")

    const style = vt.getStyle(0, 0)
    expect(style.underline).toBe(true)
  })

  it("handles underline style off via subparameter (4:0)", () => {
    const vt = new VirtualTerminal(10, 1)
    vt.applyAnsi("\x1b[4mA\x1b[4:0mB")

    expect(vt.getStyle(0, 0).underline).toBe(true)
    expect(vt.getStyle(1, 0).underline).toBe(false)
  })

  it("clears styles with erase-to-end-of-line (K)", () => {
    const vt = new VirtualTerminal(10, 1)
    // Write red text, then position cursor and erase with blue bg
    vt.applyAnsi("\x1b[31mABCDE")
    // Reset position and set blue bg, then erase
    vt.applyAnsi("\x1b[1G\x1b[44m\x1b[K")

    // All cells should have blue bg, no fg, and ' ' char
    for (let x = 0; x < 10; x++) {
      const style = vt.getStyle(x, 0)
      expect(style.bg).toBe(4) // blue bg from active SGR state
      expect(style.fg).toBeNull() // attributes reset by erase
      expect(vt.getChar(x, 0)).toBe(" ")
    }
  })

  it("preserves styles loaded from buffer", () => {
    const vt = new VirtualTerminal(5, 1)

    // Create a mock buffer-like object to test loadFromBuffer
    // We use applyAnsi instead since we can't easily construct a TerminalBuffer
    vt.applyAnsi("\x1b[1;31mA\x1b[0;44mB\x1b[3mC")

    expect(vt.getStyle(0, 0).bold).toBe(true)
    expect(vt.getStyle(0, 0).fg).toBe(1)
    expect(vt.getStyle(1, 0).bg).toBe(4)
    expect(vt.getStyle(1, 0).bold).toBe(false)
    expect(vt.getStyle(2, 0).italic).toBe(true)
  })

  it("tracks dim attribute", () => {
    const vt = new VirtualTerminal(10, 1)
    vt.applyAnsi("\x1b[2mD")

    expect(vt.getStyle(0, 0).dim).toBe(true)
  })

  it("tracks hidden attribute", () => {
    const vt = new VirtualTerminal(10, 1)
    vt.applyAnsi("\x1b[8mH")

    expect(vt.getStyle(0, 0).hidden).toBe(true)
  })

  it("resets hidden with SGR 28", () => {
    const vt = new VirtualTerminal(10, 1)
    vt.applyAnsi("\x1b[8mA\x1b[28mB")

    expect(vt.getStyle(0, 0).hidden).toBe(true)
    expect(vt.getStyle(1, 0).hidden).toBe(false)
  })

  it("tracks blink attribute", () => {
    const vt = new VirtualTerminal(10, 1)
    vt.applyAnsi("\x1b[5mB")

    expect(vt.getStyle(0, 0).blink).toBe(true)
  })

  it("resets blink with SGR 25", () => {
    const vt = new VirtualTerminal(10, 1)
    vt.applyAnsi("\x1b[5mA\x1b[25mB")

    expect(vt.getStyle(0, 0).blink).toBe(true)
    expect(vt.getStyle(1, 0).blink).toBe(false)
  })

  it("compareStylesToBuffer reports fg mismatch", () => {
    const render = createRenderer({ cols: 10, rows: 1 })
    const app = render(<Text color="red">A</Text>)

    const buffer = app.lastBuffer()!
    const vt = new VirtualTerminal(10, 1)
    // Write 'A' with green (wrong color) — should mismatch with buffer's red
    vt.applyAnsi("\x1b[32mA")

    const mismatches = vt.compareStylesToBuffer(buffer)
    expect(mismatches.length).toBeGreaterThan(0)
    // The first cell should have a fg mismatch
    const firstMismatch = mismatches.find((m) => m.x === 0 && m.y === 0)
    expect(firstMismatch).toBeDefined()
    expect(firstMismatch!.diffs.some((d) => d.includes("fg"))).toBe(true)
  })

  it("compareStylesToBuffer passes when styles match", () => {
    const render = createRenderer({ cols: 10, rows: 1 })
    const app = render(<Text bold>A</Text>)

    const buffer = app.lastBuffer()!
    const vt = new VirtualTerminal(10, 1)
    // Load from buffer so styles match
    vt.loadFromBuffer(buffer)

    const mismatches = vt.compareStylesToBuffer(buffer)
    expect(mismatches).toEqual([])
  })

  it("compareStylesToBuffer reports bold mismatch", () => {
    const render = createRenderer({ cols: 10, rows: 1 })
    const app = render(<Text bold>A</Text>)

    const buffer = app.lastBuffer()!
    const vt = new VirtualTerminal(10, 1)
    // Write 'A' without bold — should mismatch with buffer's bold
    vt.applyAnsi("A")

    const mismatches = vt.compareStylesToBuffer(buffer)
    const boldMismatch = mismatches.find((m) => m.x === 0 && m.y === 0)
    expect(boldMismatch).toBeDefined()
    expect(boldMismatch!.diffs.some((d) => d.includes("bold"))).toBe(true)
  })

  it("compareStylesToBuffer reports bg mismatch", () => {
    const render = createRenderer({ cols: 10, rows: 1 })
    const app = render(
      <Box backgroundColor="blue">
        <Text>A</Text>
      </Box>,
    )

    const buffer = app.lastBuffer()!
    const vt = new VirtualTerminal(10, 1)
    // Write 'A' with no bg — should mismatch with buffer's blue bg
    vt.applyAnsi("A")

    const mismatches = vt.compareStylesToBuffer(buffer)
    const bgMismatch = mismatches.find((m) => m.x === 0 && m.y === 0)
    expect(bgMismatch).toBeDefined()
    expect(bgMismatch!.diffs.some((d) => d.includes("bg"))).toBe(true)
  })
})
