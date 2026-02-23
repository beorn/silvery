/**
 * Tests for image rendering support.
 *
 * Tests the Kitty graphics protocol encoder, Sixel encoder,
 * and the Image component.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import {
  encodeKittyImage,
  deleteKittyImage,
  isKittyGraphicsSupported,
  encodeSixel,
  isSixelSupported,
  Image,
  Box,
  Text,
} from "../src/index.js"
import type { SixelImageData } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

// ============================================================================
// Kitty Graphics Protocol
// ============================================================================

describe("encodeKittyImage", () => {
  test("produces valid escape sequence structure for small image", () => {
    // A minimal valid PNG-like buffer (doesn't need to be a real PNG for protocol tests)
    const data = Buffer.from("iVBORw0KGgoAAAANSUhEUg==", "base64") // tiny PNG header fragment
    const result = encodeKittyImage(data)

    // Should start with APC_START (ESC _ G)
    expect(result).toMatch(/^\x1b_G/)

    // Should end with ST (ESC \)
    expect(result).toMatch(/\x1b\\$/)

    // Should contain the action, format, and more flag
    expect(result).toContain("a=T")
    expect(result).toContain("f=100")
  })

  test("includes width and height when specified", () => {
    const data = Buffer.from("test-png-data")
    const result = encodeKittyImage(data, { width: 40, height: 20 })

    expect(result).toContain("s=40")
    expect(result).toContain("v=20")
  })

  test("includes image ID when specified", () => {
    const data = Buffer.from("test-png-data")
    const result = encodeKittyImage(data, { id: 42 })

    expect(result).toContain("i=42")
  })

  test("single chunk for small data has m=0", () => {
    // Small enough for a single chunk (< 4096 base64 chars)
    const data = Buffer.from("small")
    const result = encodeKittyImage(data)

    // m=0 means last/only chunk
    expect(result).toContain("m=0")
    // Should NOT contain m=1
    expect(result).not.toMatch(/m=1/)
  })

  test("chunks large images correctly (<=4096 base64 per chunk)", () => {
    // Create data that will produce > 4096 base64 characters
    // base64 expands by 4/3, so 3072 bytes => 4096 base64 chars
    // We need > 3072 bytes to get > 4096 base64 chars = multiple chunks
    const data = Buffer.alloc(4096, 0x42) // 4096 bytes => ~5462 base64 chars

    const result = encodeKittyImage(data)

    // Should have multiple APC sequences (multiple chunks)
    const apcCount = (result.match(/\x1b_G/g) ?? []).length
    expect(apcCount).toBeGreaterThan(1)

    // First chunk should have m=1 (more follows)
    // Extract first chunk params
    const firstChunkMatch = result.match(/\x1b_G([^;]+);/)
    expect(firstChunkMatch).not.toBeNull()
    expect(firstChunkMatch![1]).toContain("m=1")

    // Last chunk should have m=0
    // The last APC sequence before the final ST
    const lastStIdx = result.lastIndexOf("\x1b\\")
    const lastApcIdx = result.lastIndexOf("\x1b_G", lastStIdx)
    const lastChunk = result.slice(lastApcIdx, lastStIdx + 2)
    expect(lastChunk).toContain("m=0")
  })

  test("handles empty buffer", () => {
    const data = Buffer.alloc(0)
    const result = encodeKittyImage(data)

    // Should still produce a valid escape sequence
    expect(result).toMatch(/^\x1b_G/)
    expect(result).toMatch(/\x1b\\$/)
  })
})

describe("deleteKittyImage", () => {
  test("produces correct escape sequence", () => {
    const result = deleteKittyImage(42)

    // ESC _ G a=d,d=i,i=42 ESC \
    expect(result).toBe("\x1b_Ga=d,d=i,i=42\x1b\\")
  })

  test("handles different IDs", () => {
    expect(deleteKittyImage(1)).toContain("i=1")
    expect(deleteKittyImage(999)).toContain("i=999")
  })
})

describe("isKittyGraphicsSupported", () => {
  const origEnv = { ...process.env }

  afterEach(() => {
    process.env.TERM = origEnv.TERM
    process.env.TERM_PROGRAM = origEnv.TERM_PROGRAM
  })

  test("returns true for Kitty terminal", () => {
    process.env.TERM = "xterm-kitty"
    process.env.TERM_PROGRAM = ""
    expect(isKittyGraphicsSupported()).toBe(true)
  })

  test("returns true for WezTerm", () => {
    process.env.TERM = ""
    process.env.TERM_PROGRAM = "WezTerm"
    expect(isKittyGraphicsSupported()).toBe(true)
  })

  test("returns true for Ghostty", () => {
    process.env.TERM = ""
    process.env.TERM_PROGRAM = "ghostty"
    expect(isKittyGraphicsSupported()).toBe(true)
  })

  test("returns false for unsupported terminals", () => {
    process.env.TERM = "xterm-256color"
    process.env.TERM_PROGRAM = "Apple_Terminal"
    expect(isKittyGraphicsSupported()).toBe(false)
  })
})

// ============================================================================
// Sixel Encoder
// ============================================================================

describe("encodeSixel", () => {
  test("produces valid DCS structure", () => {
    const imageData: SixelImageData = {
      width: 4,
      height: 6,
      data: new Uint8Array(4 * 6 * 4).fill(255), // white opaque pixels
    }
    const result = encodeSixel(imageData)

    // Should start with DCS (ESC P) and 'q'
    expect(result).toMatch(/^\x1bP/)
    expect(result).toContain("q")

    // Should end with ST (ESC \)
    expect(result).toMatch(/\x1b\\$/)
  })

  test("handles empty image", () => {
    const imageData: SixelImageData = {
      width: 0,
      height: 0,
      data: new Uint8Array(0),
    }
    const result = encodeSixel(imageData)

    // Should produce a minimal valid DCS
    expect(result).toBe("\x1bPq\x1b\\")
  })

  test("includes raster attributes", () => {
    const imageData: SixelImageData = {
      width: 10,
      height: 12,
      data: new Uint8Array(10 * 12 * 4).fill(255),
    }
    const result = encodeSixel(imageData)

    // Raster attributes format: "Pan;Pad;Ph;Pv"
    expect(result).toContain(`"1;1;10;12`)
  })

  test("encodes transparent pixels correctly", () => {
    // All transparent (alpha = 0)
    const imageData: SixelImageData = {
      width: 2,
      height: 6,
      data: new Uint8Array(2 * 6 * 4), // all zeros = transparent black
    }
    const result = encodeSixel(imageData)

    // With all transparent pixels, there should be no color definitions
    // (no #N;2;... patterns beyond the initial raster attributes)
    // The result should be basically empty sixel data
    expect(result).toMatch(/^\x1bPq/)
    expect(result).toMatch(/\x1b\\$/)
  })

  test("encodes solid color image", () => {
    // 2x6 solid red image
    const imageData: SixelImageData = {
      width: 2,
      height: 6,
      data: new Uint8Array(2 * 6 * 4),
    }
    // Fill with red (R=255, G=0, B=0, A=255)
    for (let i = 0; i < 2 * 6; i++) {
      imageData.data[i * 4] = 255 // R
      imageData.data[i * 4 + 1] = 0 // G
      imageData.data[i * 4 + 2] = 0 // B
      imageData.data[i * 4 + 3] = 255 // A
    }
    const result = encodeSixel(imageData)

    // Should contain a color definition for red
    // Quantized red: R=63, G=0, B=0 => percentage: 100, 0, 0
    expect(result).toMatch(/#\d+;2;100;0;0/)

    // Should contain sixel characters (data between color ref and ST)
    // For 6 rows of solid red, all 6 bits set: 0b111111 = 63 => char 63+63 = 126 = '~'
    expect(result).toContain("~")
  })
})

describe("isSixelSupported", () => {
  const origEnv = { ...process.env }

  afterEach(() => {
    process.env.TERM = origEnv.TERM
    process.env.TERM_PROGRAM = origEnv.TERM_PROGRAM
  })

  test("returns true for mlterm", () => {
    process.env.TERM = ""
    process.env.TERM_PROGRAM = "mlterm"
    expect(isSixelSupported()).toBe(true)
  })

  test("returns true for foot", () => {
    process.env.TERM = "foot"
    process.env.TERM_PROGRAM = ""
    expect(isSixelSupported()).toBe(true)
  })

  test("returns true for WezTerm", () => {
    process.env.TERM = ""
    process.env.TERM_PROGRAM = "WezTerm"
    expect(isSixelSupported()).toBe(true)
  })

  test("returns false for unsupported terminals", () => {
    process.env.TERM = "xterm-256color"
    process.env.TERM_PROGRAM = "Apple_Terminal"
    expect(isSixelSupported()).toBe(false)
  })
})

// ============================================================================
// Image Component
// ============================================================================

describe("Image component", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  test("renders fallback text when no protocol support", () => {
    // Force no protocol support
    const origTerm = process.env.TERM
    const origTermProgram = process.env.TERM_PROGRAM
    process.env.TERM = "dumb"
    process.env.TERM_PROGRAM = ""

    try {
      const app = render(
        <Image src={Buffer.from("fake-png-data")} width={20} height={5} fallback="[no image support]" />,
      )

      expect(app.text).toContain("[no image support]")
    } finally {
      process.env.TERM = origTerm
      process.env.TERM_PROGRAM = origTermProgram
    }
  })

  test("renders default fallback when no protocol support and no custom fallback", () => {
    const origTerm = process.env.TERM
    const origTermProgram = process.env.TERM_PROGRAM
    process.env.TERM = "dumb"
    process.env.TERM_PROGRAM = ""

    try {
      const app = render(<Image src={Buffer.from("fake-png-data")} width={20} height={5} />)

      expect(app.text).toContain("[image]")
    } finally {
      process.env.TERM = origTerm
      process.env.TERM_PROGRAM = origTermProgram
    }
  })

  test("renders without crashing with valid props", () => {
    const origTerm = process.env.TERM
    const origTermProgram = process.env.TERM_PROGRAM
    process.env.TERM = "dumb"
    process.env.TERM_PROGRAM = ""

    try {
      const app = render(
        <Box>
          <Text>Before</Text>
          <Image src={Buffer.from("fake-png")} width={10} height={3} />
          <Text>After</Text>
        </Box>,
      )

      expect(app.text).toContain("Before")
      expect(app.text).toContain("After")
      // Fallback should be visible
      expect(app.text).toContain("[image]")
    } finally {
      process.env.TERM = origTerm
      process.env.TERM_PROGRAM = origTermProgram
    }
  })

  test("renders space placeholder when protocol is supported", () => {
    const origTerm = process.env.TERM
    const origTermProgram = process.env.TERM_PROGRAM
    process.env.TERM = "xterm-kitty"
    process.env.TERM_PROGRAM = "kitty"

    try {
      const app = render(<Image src={Buffer.from("fake-png")} width={10} height={3} />)

      // Should NOT show fallback text — should show space placeholder
      expect(app.text).not.toContain("[image]")
    } finally {
      process.env.TERM = origTerm
      process.env.TERM_PROGRAM = origTermProgram
    }
  })
})
