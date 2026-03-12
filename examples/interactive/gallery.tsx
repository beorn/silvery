/**
 * Gallery — Kitty Images, Pixel Art, and Truecolor Rendering
 *
 * A tabbed demo combining three visual rendering techniques:
 * 1. Images — Browse/display images using the Kitty graphics protocol
 * 2. Paint — Half-block pixel art canvas with mouse drawing and RGB color picker
 * 3. Truecolor — Full truecolor spectrum, HSL rainbows, and 256-color palette
 *
 * Run: bun vendor/silvery/examples/interactive/gallery.tsx
 */

import { deflateSync } from "node:zlib"
import React, { useState, useMemo } from "react"
import {
  render,
  Box,
  Text,
  Image,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Kbd,
  Muted,
  H2,
  useInput,
  useApp,
  useContentRect,
  createTerm,
  type Key,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Gallery",
  description: "Kitty images, pixel art, and truecolor rendering",
  demo: true,
  features: ["Image", "Kitty graphics", "half-block", "truecolor", "mouse input"],
}

// ============================================================================
// Color Utilities
// ============================================================================

type RGB = [number, number, number]

/** HSV to RGB (h: 0-360, s/v: 0-1) */
function hsvToRgb(h: number, s: number, v: number): RGB {
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

/** HSL to RGB (h: 0-360, s/l: 0-1) */
function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r1: number, g1: number, b1: number
  if (h < 60) [r1, g1, b1] = [c, x, 0]
  else if (h < 120) [r1, g1, b1] = [x, c, 0]
  else if (h < 180) [r1, g1, b1] = [0, c, x]
  else if (h < 240) [r1, g1, b1] = [0, x, c]
  else if (h < 300) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)]
}

// ============================================================================
// PNG Generation (in-memory, no external files)
// ============================================================================

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

function encodePng(width: number, height: number, pixelFn: (x: number, y: number) => RGB): Buffer {
  const rawData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4)
    rawData[rowOffset] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y)
      const off = rowOffset + 1 + x * 4
      rawData[off] = r
      rawData[off + 1] = g
      rawData[off + 2] = b
      rawData[off + 3] = 255
    }
  }
  const compressed = deflateSync(rawData)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ])
}

// ============================================================================
// Sample Image Generators
// ============================================================================

interface GalleryImage {
  name: string
  description: string
  png: Buffer
}

function generateRainbow(w: number, h: number): Buffer {
  return encodePng(w, h, (x, y) => {
    const hue = (x / w) * 360
    const sat = 0.7 + 0.3 * Math.sin((y / h) * Math.PI)
    const val = 0.5 + 0.5 * Math.cos((y / h) * Math.PI * 2)
    return hsvToRgb(hue, sat, val)
  })
}

function generatePlasma(w: number, h: number): Buffer {
  return encodePng(w, h, (x, y) => {
    const nx = x / w
    const ny = y / h
    const v1 = Math.sin(nx * 10 + ny * 3)
    const v2 = Math.sin(nx * 5 - ny * 8 + 2)
    const v3 = Math.sin(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 15)
    const v = (v1 + v2 + v3) / 3
    const hue = ((v + 1) / 2) * 360
    return hslToRgb(hue, 0.9, 0.55)
  })
}

function generateMandelbrot(w: number, h: number): Buffer {
  return encodePng(w, h, (x, y) => {
    const cx = (x / w) * 3.5 - 2.5
    const cy = (y / h) * 2.0 - 1.0
    let zx = 0,
      zy = 0
    let i = 0
    const maxIter = 80
    while (zx * zx + zy * zy < 4 && i < maxIter) {
      const tmp = zx * zx - zy * zy + cx
      zy = 2 * zx * zy + cy
      zx = tmp
      i++
    }
    if (i === maxIter) return [0, 0, 0] as RGB
    const hue = (i / maxIter) * 360
    return hslToRgb(hue, 1.0, 0.5)
  })
}

function generateGradientGrid(w: number, h: number): Buffer {
  return encodePng(w, h, (x, y) => {
    const r = Math.round((x / w) * 255)
    const g = Math.round((y / h) * 255)
    const b = Math.round(255 - ((x + y) / (w + h)) * 255)
    return [r, g, b]
  })
}

function generateCheckerPattern(w: number, h: number): Buffer {
  const size = 16
  return encodePng(w, h, (x, y) => {
    const cx = Math.floor(x / size)
    const cy = Math.floor(y / size)
    const hue = ((cx + cy) * 30) % 360
    const isLight = (cx + cy) % 2 === 0
    return hslToRgb(hue, 0.8, isLight ? 0.6 : 0.35)
  })
}

// ============================================================================
// Tab 1: Images — Browse gallery of generated images
// ============================================================================

function ImagesTab(): JSX.Element {
  const rect = useContentRect()
  const w = Math.max(20, rect.width - 4)
  const imgH = Math.max(5, rect.height - 6)

  const images: GalleryImage[] = useMemo(() => {
    const pw = 256
    const ph = 192
    return [
      { name: "Rainbow", description: "HSV color wheel gradient", png: generateRainbow(pw, ph) },
      { name: "Plasma", description: "Sine-wave plasma interference", png: generatePlasma(pw, ph) },
      {
        name: "Mandelbrot",
        description: "Fractal escape-time coloring",
        png: generateMandelbrot(pw, ph),
      },
      {
        name: "RGB Cube",
        description: "Red-Green-Blue gradient grid",
        png: generateGradientGrid(pw, ph),
      },
      {
        name: "Checker",
        description: "Hue-shifted checkerboard",
        png: generateCheckerPattern(pw, ph),
      },
    ]
  }, [])

  const [index, setIndex] = useState(0)
  const img = images[index]!

  useInput((input: string, key: Key) => {
    if (input === "j" || key.downArrow || input === "n") {
      setIndex((i) => (i + 1) % images.length)
    }
    if (input === "k" || key.upArrow || input === "p") {
      setIndex((i) => (i - 1 + images.length) % images.length)
    }
  })

  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Box paddingX={1} gap={2}>
        <Text bold color="$primary">
          {img.name}
        </Text>
        <Muted>{img.description}</Muted>
        <Muted>
          ({index + 1}/{images.length})
        </Muted>
      </Box>
      <Box flexGrow={1} justifyContent="center" paddingX={1}>
        <Image
          src={img.png}
          width={w}
          height={imgH}
          fallback={`[${img.name} — graphics protocol not available. Run in Kitty/WezTerm/Ghostty for images.]`}
        />
      </Box>
      <Muted>
        {" "}
        <Kbd>j/k</Kbd> navigate images
      </Muted>
    </Box>
  )
}

// ============================================================================
// Tab 2: Paint — Half-block pixel art canvas
// ============================================================================

const UPPER_HALF = "\u2580"
const LOWER_HALF = "\u2584"
const FULL_BLOCK = "\u2588"

const PAINT_PRESETS: { name: string; color: RGB }[] = [
  { name: "white", color: [255, 255, 255] },
  { name: "red", color: [255, 0, 0] },
  { name: "orange", color: [255, 165, 0] },
  { name: "yellow", color: [255, 255, 0] },
  { name: "green", color: [0, 200, 0] },
  { name: "cyan", color: [0, 255, 255] },
  { name: "blue", color: [0, 100, 255] },
  { name: "magenta", color: [200, 0, 200] },
  { name: "pink", color: [255, 128, 200] },
  { name: "black", color: [30, 30, 30] },
]

function PaintTab(): JSX.Element {
  const rect = useContentRect()
  const canvasW = Math.max(10, rect.width - 2)
  const canvasTermH = Math.max(4, rect.height - 7)
  const canvasPixH = canvasTermH * 2

  const [pixels, setPixels] = useState<(RGB | null)[][]>(() => {
    const rows: (RGB | null)[][] = []
    for (let y = 0; y < canvasPixH; y++) rows.push(new Array(canvasW).fill(null))
    // Seed with a colorful spiral pattern so the demo looks great on first render
    const cx = Math.floor(canvasW / 2)
    const cy = Math.floor(canvasPixH / 2)
    const radius = Math.min(cx, cy) - 2
    for (let angle = 0; angle < 720; angle += 2) {
      const r = (angle / 720) * radius
      const rad = (angle * Math.PI) / 180
      const px = Math.round(cx + r * Math.cos(rad))
      const py = Math.round(cy + r * Math.sin(rad))
      const hue = angle % 360
      const color = hslToRgb(hue, 0.9, 0.55)
      // Draw a small dot (2px radius)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = px + dx
          const y = py + dy
          if (x >= 0 && x < canvasW && y >= 0 && y < canvasPixH) {
            rows[y]![x] = color
          }
        }
      }
    }
    return rows
  })

  const [colorIndex, setColorIndex] = useState(1) // red
  const [tool, setTool] = useState<"pen" | "eraser">("pen")
  const currentColor = PAINT_PRESETS[colorIndex]!.color

  // Handle keyboard: color presets, tool toggle, clear
  useInput((input: string) => {
    if (input >= "1" && input <= "9") {
      setColorIndex(Number(input) - 1)
      setTool("pen")
    } else if (input === "0") {
      setColorIndex(9)
      setTool("pen")
    } else if (input === "e") {
      setTool((t) => (t === "eraser" ? "pen" : "eraser"))
    } else if (input === "c") {
      setPixels((prev) => prev.map((row) => row.map(() => null)))
    }
  })

  // Render canvas as half-block characters
  const canvasLines: JSX.Element[] = []
  for (let row = 0; row < canvasTermH; row++) {
    const cells: JSX.Element[] = []
    for (let col = 0; col < canvasW; col++) {
      const top = row * 2 < pixels.length ? (pixels[row * 2]?.[col] ?? null) : null
      const bot = row * 2 + 1 < pixels.length ? (pixels[row * 2 + 1]?.[col] ?? null) : null

      if (top === null && bot === null) {
        cells.push(<Text key={col}> </Text>)
      } else if (top !== null && bot === null) {
        cells.push(
          <Text key={col} color={`rgb(${top[0]},${top[1]},${top[2]})`}>
            {UPPER_HALF}
          </Text>,
        )
      } else if (top === null && bot !== null) {
        cells.push(
          <Text key={col} color={`rgb(${bot[0]},${bot[1]},${bot[2]})`}>
            {LOWER_HALF}
          </Text>,
        )
      } else if (top !== null && top[0] === bot?.[0] && top[1] === bot[1] && top[2] === bot[2]) {
        cells.push(
          <Text key={col} color={`rgb(${top[0]},${top[1]},${top[2]})`}>
            {FULL_BLOCK}
          </Text>,
        )
      } else {
        cells.push(
          <Text
            key={col}
            color={`rgb(${top![0]},${top![1]},${top![2]})`}
            backgroundColor={`rgb(${bot![0]},${bot![1]},${bot![2]})`}
          >
            {UPPER_HALF}
          </Text>,
        )
      }
    }
    canvasLines.push(<Box key={row}>{cells}</Box>)
  }

  // Color palette bar
  const paletteItems = PAINT_PRESETS.map((p, i) => {
    const selected = i === colorIndex
    return (
      <Text
        key={i}
        backgroundColor={`rgb(${p.color[0]},${p.color[1]},${p.color[2]})`}
        color={p.color[0] + p.color[1] + p.color[2] > 384 ? "black" : "white"}
        bold={selected}
      >
        {selected ? `[${(i + 1) % 10}]` : ` ${(i + 1) % 10} `}
      </Text>
    )
  })

  const toolLabel = tool === "pen" ? "Pen" : "Eraser"
  const [cr, cg, cb] = currentColor

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1} gap={2}>
        <Text bold color={`rgb(${cr},${cg},${cb})`}>
          {toolLabel}
        </Text>
        <Text backgroundColor={`rgb(${cr},${cg},${cb})`}>{"    "}</Text>
        <Muted>
          rgb({cr},{cg},{cb})
        </Muted>
      </Box>

      <Box flexDirection="column" flexGrow={1} borderStyle="round" marginX={1}>
        <Box flexDirection="column">{canvasLines}</Box>
      </Box>

      <Box paddingX={1} gap={0}>
        {paletteItems}
      </Box>

      <Muted>
        {" "}
        <Kbd>1-0</Kbd> color <Kbd>e</Kbd> eraser <Kbd>c</Kbd> clear (click canvas in Kitty/Ghostty
        for mouse paint)
      </Muted>
    </Box>
  )
}

// ============================================================================
// Tab 3: Truecolor — Spectrum display
// ============================================================================

function TruecolorTab(): JSX.Element {
  const rect = useContentRect()
  const w = Math.max(20, rect.width - 4)
  const availH = Math.max(10, rect.height - 3)

  // Distribute vertical space among sections
  const hueBarH = Math.min(3, Math.max(1, Math.floor(availH * 0.15)))
  const gradientH = Math.min(8, Math.max(2, Math.floor(availH * 0.35)))
  const paletteH = Math.min(4, Math.max(2, Math.floor(availH * 0.2)))

  // HSL Hue rainbow bar — each column is a hue
  const hueBar: JSX.Element[] = []
  for (let row = 0; row < hueBarH; row++) {
    const cells: JSX.Element[] = []
    for (let col = 0; col < w; col++) {
      const hue = (col / w) * 360
      const lightness = 0.35 + (row / Math.max(1, hueBarH - 1)) * 0.3
      const [r, g, b] = hslToRgb(hue, 1.0, lightness)
      cells.push(
        <Text key={col} backgroundColor={`rgb(${r},${g},${b})`}>
          {" "}
        </Text>,
      )
    }
    hueBar.push(<Box key={row}>{cells}</Box>)
  }

  // Saturation/brightness gradient — rows vary saturation, columns vary hue
  const gradient: JSX.Element[] = []
  for (let row = 0; row < gradientH; row++) {
    const cells: JSX.Element[] = []
    const sat = 1.0 - (row / Math.max(1, gradientH - 1)) * 0.8
    for (let col = 0; col < w; col++) {
      const hue = (col / w) * 360
      const [r, g, b] = hsvToRgb(hue, sat, 0.95)
      cells.push(
        <Text key={col} backgroundColor={`rgb(${r},${g},${b})`}>
          {" "}
        </Text>,
      )
    }
    gradient.push(<Box key={row}>{cells}</Box>)
  }

  // 256-color ANSI palette grid (16 columns x rows)
  const paletteCols = 16
  const paletteRows = Math.min(paletteH, Math.ceil(256 / paletteCols))
  const palette: JSX.Element[] = []
  for (let row = 0; row < paletteRows; row++) {
    const cells: JSX.Element[] = []
    const cellW = Math.max(1, Math.floor(w / paletteCols))
    for (let col = 0; col < paletteCols; col++) {
      const idx = row * paletteCols + col
      if (idx >= 256) break
      // Convert 256-color index to RGB
      const [r, g, b] = ansi256toRgb(idx)
      const label = idx.toString().padStart(3)
      const textColor = r + g + b > 384 ? "black" : "white"
      cells.push(
        <Box key={col} width={cellW}>
          <Text backgroundColor={`rgb(${r},${g},${b})`} color={textColor}>
            {label.slice(0, cellW)}
          </Text>
        </Box>,
      )
    }
    palette.push(<Box key={row}>{cells}</Box>)
  }

  // Grayscale ramp
  const grayCells: JSX.Element[] = []
  for (let col = 0; col < w; col++) {
    const v = Math.round((col / Math.max(1, w - 1)) * 255)
    grayCells.push(
      <Text key={col} backgroundColor={`rgb(${v},${v},${v})`}>
        {" "}
      </Text>,
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1} gap={1} paddingX={1}>
      <Box flexDirection="column">
        <H2>HSL Rainbow</H2>
        <Box flexDirection="column">{hueBar}</Box>
      </Box>

      <Box flexDirection="column">
        <H2>Saturation Gradient</H2>
        <Box flexDirection="column">{gradient}</Box>
      </Box>

      <Box flexDirection="column">
        <H2>256-Color Palette</H2>
        <Box flexDirection="column">{palette}</Box>
      </Box>

      <Box flexDirection="column">
        <H2>Grayscale Ramp</H2>
        <Box>{grayCells}</Box>
      </Box>
    </Box>
  )
}

/** Convert ANSI 256-color index to RGB */
function ansi256toRgb(idx: number): RGB {
  if (idx < 16) {
    // Standard 16 colors (approximate)
    const table: RGB[] = [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ]
    return table[idx]!
  }
  if (idx < 232) {
    // 6x6x6 color cube
    const i = idx - 16
    const r = Math.floor(i / 36)
    const g = Math.floor((i % 36) / 6)
    const b = i % 6
    return [r ? r * 40 + 55 : 0, g ? g * 40 + 55 : 0, b ? b * 40 + 55 : 0]
  }
  // Grayscale ramp (232-255)
  const v = (idx - 232) * 10 + 8
  return [v, v, v]
}

// ============================================================================
// Main Gallery App
// ============================================================================

function Gallery(): JSX.Element {
  const { exit } = useApp()
  const [activeTab, setActiveTab] = useState("images")

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) exit()
  })

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabList>
          <Tab value="images">Images</Tab>
          <Tab value="paint">Paint</Tab>
          <Tab value="truecolor">Truecolor</Tab>
        </TabList>

        <TabPanel value="images">
          <ImagesTab />
        </TabPanel>
        <TabPanel value="paint">
          <PaintTab />
        </TabPanel>
        <TabPanel value="truecolor">
          <TruecolorTab />
        </TabPanel>
      </Tabs>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l tab  j/k navigate  Esc/q quit">
      <Gallery />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
