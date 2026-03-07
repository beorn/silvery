/**
 * Tests for NO_COLOR support (https://no-color.org/).
 *
 * Verifies that setting NO_COLOR strips all ANSI escape codes from output.
 * The NO_COLOR spec: when the env var is defined (any value), programs should
 * not output ANSI color escape sequences.
 *
 * hightea handles this in two places:
 * 1. term-def.ts detectColorLevel() — returns null when NO_COLOR is set
 * 2. render pipeline — when colors === null, uses plain: true (bufferToText)
 */

import React from "react"
import { describe, expect, it, afterEach } from "vitest"
import { Box, Text } from "../src/components/index.js"
import { renderString } from "../src/render-string.js"
import { resolveTermDef } from "../src/term-def.js"

// ANSI escape code pattern — matches any CSI or OSC sequence
const ANSI_PATTERN = /\x1b\[[\d;]*[a-zA-Z]|\x1b\][\s\S]*?(?:\x1b\\|\x07)/

describe("NO_COLOR support", () => {
  let savedNoColor: string | undefined
  let savedForceColor: string | undefined

  afterEach(() => {
    // Restore env vars
    if (savedNoColor !== undefined) {
      process.env.NO_COLOR = savedNoColor
    } else {
      delete process.env.NO_COLOR
    }
    if (savedForceColor !== undefined) {
      process.env.FORCE_COLOR = savedForceColor
    } else {
      delete process.env.FORCE_COLOR
    }
  })

  describe("detectColorLevel via resolveTermDef", () => {
    it("returns null colors when NO_COLOR is set", () => {
      savedNoColor = process.env.NO_COLOR
      savedForceColor = process.env.FORCE_COLOR
      process.env.NO_COLOR = "1"
      delete process.env.FORCE_COLOR

      const resolved = resolveTermDef({})
      expect(resolved.colors).toBeNull()
    })

    it("returns null colors when NO_COLOR is empty string", () => {
      savedNoColor = process.env.NO_COLOR
      savedForceColor = process.env.FORCE_COLOR
      process.env.NO_COLOR = ""
      delete process.env.FORCE_COLOR

      // Per the NO_COLOR spec, any defined value (even empty) means no color
      const resolved = resolveTermDef({})
      expect(resolved.colors).toBeNull()
    })
  })

  describe("renderString with plain: true", () => {
    it("outputs no ANSI escape codes for colored text", async () => {
      const output = await renderString(
        <Text color="red" bold>
          Hello
        </Text>,
        { plain: true },
      )

      expect(output).toContain("Hello")
      expect(output).not.toMatch(ANSI_PATTERN)
    })

    it("outputs no ANSI escape codes for text with background color", async () => {
      const output = await renderString(
        <Text backgroundColor="blue" color="white">
          Styled
        </Text>,
        { plain: true },
      )

      expect(output).toContain("Styled")
      expect(output).not.toMatch(ANSI_PATTERN)
    })

    it("outputs no ANSI escape codes for nested styled components", async () => {
      const output = await renderString(
        <Box borderStyle="single" borderColor="green">
          <Text color="red" bold>
            Bold Red
          </Text>
          <Text dimColor>Dimmed</Text>
        </Box>,
        { plain: true },
      )

      expect(output).toContain("Bold Red")
      expect(output).toContain("Dimmed")
      expect(output).not.toMatch(ANSI_PATTERN)
    })

    it("preserves text content when stripping colors", async () => {
      const styled = await renderString(
        <Box flexDirection="column">
          <Text color="red">Line 1</Text>
          <Text color="blue">Line 2</Text>
          <Text bold italic>
            Line 3
          </Text>
        </Box>,
        { width: 40 },
      )
      const plain = await renderString(
        <Box flexDirection="column">
          <Text color="red">Line 1</Text>
          <Text color="blue">Line 2</Text>
          <Text bold italic>
            Line 3
          </Text>
        </Box>,
        { width: 40, plain: true },
      )

      // Plain output should have the same text content
      expect(plain).toContain("Line 1")
      expect(plain).toContain("Line 2")
      expect(plain).toContain("Line 3")
      // But no ANSI
      expect(plain).not.toMatch(ANSI_PATTERN)
      // Styled output SHOULD have ANSI
      expect(styled).toMatch(ANSI_PATTERN)
    })
  })
})
