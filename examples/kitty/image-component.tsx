/**
 * Image Component Demo
 *
 * Demonstrates the `<Image>` component — a high-level React component for
 * displaying images in the terminal. Unlike the raw Kitty graphics protocol
 * example (images.tsx), this uses the declarative component API with automatic
 * protocol detection and fallback support.
 *
 * Features:
 * - Uses the <Image> component from silvery
 * - Auto-generated rainbow test pattern (no external files needed)
 * - Fallback text when graphics protocol is not supported
 * - Protocol auto-detection status display
 * - Adjustable image dimensions with +/- keys
 *
 * Run: bun vendor/silvery/examples/kitty/image-component.tsx
 */

import { deflateSync } from "node:zlib"
import React, { useState, useMemo } from "react"
import {
  render,
  Box,
  Text,
  Image,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "../../src/index.js"
import { isKittyGraphicsSupported } from "../../src/image/kitty-graphics.js"
import { isSixelSupported } from "../../src/image/sixel-encoder.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Image Component",
  description: "Declarative <Image> component with protocol auto-detection",
  features: ["Image", "Kitty graphics", "Sixel", "fallback text", "protocol detection"],
}

// ============================================================================
// PNG Generation
// ============================================================================

/** Convert HSV (h: 0-360, s/v: 0-1) to RGB bytes */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** Generate a rainbow gradient PNG buffer (no external dependencies). */
function generateTestPatternPng(width: number, height: number): Buffer {
  // Build raw RGBA pixel data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4))

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4)
    rawData[rowOffset] = 0 // PNG filter: None

    for (let x = 0; x < width; x++) {
      const hue = (x / width) * 360
      const saturation = 0.7 + 0.3 * Math.sin((y / height) * Math.PI)
      const value = 0.5 + 0.5 * Math.cos((y / height) * Math.PI * 2)
      const [r, g, b] = hsvToRgb(hue, saturation, value)

      const pixelOffset = rowOffset + 1 + x * 4
      rawData[pixelOffset] = r!
      rawData[pixelOffset + 1] = g!
      rawData[pixelOffset + 2] = b!
      rawData[pixelOffset + 3] = 255
    }
  }

  // Encode as minimal PNG
  const compressed = deflateSync(rawData)

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBytes = Buffer.from(type, "ascii")
    const payload = Buffer.concat([typeBytes, data])
    const crc = crc32(payload)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc >>> 0)
    return Buffer.concat([len, payload, crcBuf])
  }

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ])
}

/** CRC-32 for PNG chunks */
function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ============================================================================
// Components
// ============================================================================

function ProtocolStatus(): JSX.Element {
  const kitty = isKittyGraphicsSupported()
  const sixel = isSixelSupported()

  const detected = kitty ? "Kitty" : sixel ? "Sixel" : "None"
  const color = kitty || sixel ? "green" : "yellow"

  return (
    <Box gap={1} paddingX={1}>
      <Text dim>Protocol:</Text>
      <Text color={color} bold>
        {detected}
      </Text>
      <Text dim>
        (Kitty: {kitty ? "yes" : "no"}, Sixel: {sixel ? "yes" : "no"})
      </Text>
    </Box>
  )
}

export function ImageComponentDemo(): JSX.Element {
  const { exit } = useApp()
  const [imageWidth, setImageWidth] = useState(40)
  const [imageHeight, setImageHeight] = useState(15)

  // Generate a test pattern PNG
  const pngBuffer = useMemo(() => generateTestPatternPng(256, 192), [])

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
      return
    }

    // Adjust width
    if (key.rightArrow || input === "l") {
      setImageWidth((prev) => Math.min(80, prev + 5))
    }
    if (key.leftArrow || input === "h") {
      setImageWidth((prev) => Math.max(10, prev - 5))
    }

    // Adjust height
    if (input === "+" || input === "=") {
      setImageHeight((prev) => Math.min(30, prev + 2))
    }
    if (input === "-") {
      setImageHeight((prev) => Math.max(5, prev - 2))
    }
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <ProtocolStatus />

      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Box marginBottom={1} gap={1}>
          <Text bold color="cyan">
            {"<Image>"}
          </Text>
          <Text dim>
            {imageWidth}x{imageHeight} cols/rows
          </Text>
        </Box>

        <Image
          src={pngBuffer}
          width={imageWidth}
          height={imageHeight}
          fallback="[Rainbow gradient — graphics protocol not available]"
        />
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold>Component Props</Text>
        </Box>
        <Box gap={2}>
          <Text>
            width={"{"}
            <Text color="green">{imageWidth}</Text>
            {"}"}
          </Text>
          <Text>
            height={"{"}
            <Text color="green">{imageHeight}</Text>
            {"}"}
          </Text>
          <Text>
            protocol=
            <Text color="yellow">"auto"</Text>
          </Text>
        </Box>
        <Text dim>fallback="[Rainbow gradient — graphics protocol not available]"</Text>
      </Box>

      <Text dim>
        {" "}
        <Text bold dim>
          h/l
        </Text>{" "}
        width{" "}
        <Text bold dim>
          +/-
        </Text>{" "}
        height{" "}
        <Text bold dim>
          Esc/q
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l width  +/- height  Esc/q quit">
      <ImageComponentDemo />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
