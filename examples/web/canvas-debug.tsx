/**
 * Canvas vs DOM — Diagnostic Overlay
 *
 * Renders the same chat UI with both Canvas (Silvery) and hidden DOM.
 * Overlays DOM bounding boxes on the canvas in red.
 * Shows a diff table comparing widths, heights, positions, and line counts.
 *
 * Use this to systematically fix canvas↔DOM mismatches.
 */

import React from "react"
import { renderToCanvas, Box, Text, type CanvasRenderOptions } from "../../packages/ag-react/src/ui/canvas/index.js"
import type { CanvasInstance, CanvasRenderBuffer } from "../../packages/ag-react/src/ui/canvas/index.js"

// ============================================================================
// Chat data (shared between DOM and Canvas)
// ============================================================================

interface Message {
  role: "user" | "assistant"
  name: string
  text: string
  time: string
}

const messages: Message[] = [
  { role: "user", name: "You", time: "2:41 PM", text: "How does shrinkwrap sizing work? CSS can't do it, right?" },
  {
    role: "assistant", name: "Claude", time: "2:41 PM",
    text: "Right! CSS has no way to size a container to the tightest width of wrapped text. Pretext measures the actual rendered width of each line. Flexily uses this for layout.",
  },
  { role: "user", name: "You", time: "2:42 PM", text: "And this is all on canvas? No DOM layout?" },
  {
    role: "assistant", name: "Claude", time: "2:42 PM",
    text: "Exactly. Same React components as terminal \u2014 Box, Text, flex layout. Rendered with proportional fonts on Canvas2D.",
  },
  { role: "user", name: "You", time: "2:43 PM", text: "What about emoji and CJK?" },
  {
    role: "assistant", name: "Claude", time: "2:43 PM",
    text: "Emoji like \ud83d\ude80 and CJK like \u6625\u5929\u5230\u4e86 are measured correctly via Pretext's grapheme segmentation.",
  },
  { role: "user", name: "You", time: "2:43 PM", text: "This is wild \ud83d\ude80" },
]

// ============================================================================
// DOM reference renderer
// ============================================================================

function buildDomRef(container: HTMLElement, width: number) {
  container.innerHTML = ""
  container.style.width = `${width}px`

  const maxBubbleW = Math.round(width * 0.72)

  const outer = document.createElement("div")
  outer.className = "chat-outer"

  // Title bar
  const titleBar = document.createElement("div")
  titleBar.className = "title-bar"
  titleBar.innerHTML = `<span class="title" data-label="title-left">Shrinkwrap Chat</span><span data-label="title-right">Canvas</span>`
  outer.appendChild(titleBar)

  // Padded chat area
  const padded = document.createElement("div")
  padded.className = "chat-padded"

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!
    const isUser = msg.role === "user"

    const group = document.createElement("div")
    group.className = `bubble-group ${isUser ? "user" : "bot"}`

    const bubble = document.createElement("div")
    bubble.className = "bubble"
    bubble.style.maxWidth = `${maxBubbleW}px`
    bubble.textContent = msg.text
    bubble.dataset.label = `bubble-${i}`

    const meta = document.createElement("div")
    meta.className = "meta"
    meta.textContent = `${msg.name} \u00b7 ${msg.time}`
    meta.dataset.label = `meta-${i}`

    group.appendChild(bubble)
    group.appendChild(meta)
    padded.appendChild(group)
  }

  // Callout
  const callout = document.createElement("div")
  callout.className = "callout"
  callout.textContent = "Every bubble wraps proportional text. CSS can\u2019t shrinkwrap like this."
  callout.dataset.label = "callout"
  padded.appendChild(callout)

  outer.appendChild(padded)
  container.appendChild(outer)
}

/** Read bounding rects from DOM elements with data-label attributes. */
function readDomRects(container: HTMLElement): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>()
  const containerRect = container.getBoundingClientRect()
  for (const el of container.querySelectorAll("[data-label]")) {
    const label = (el as HTMLElement).dataset.label!
    const r = el.getBoundingClientRect()
    // Relative to container
    rects.set(label, new DOMRect(
      r.x - containerRect.x,
      r.y - containerRect.y,
      r.width,
      r.height,
    ))
  }
  return rects
}

/** Estimate line count from element height and line-height. */
function estimateLineCount(rect: DOMRect, lineHeight: number): number {
  return Math.round(rect.height / lineHeight)
}

// ============================================================================
// Canvas (Silvery) renderer
// ============================================================================

function ChatBubble({ text, isUser, name, time, maxBubbleWidth }: {
  text: string; isUser: boolean; name: string; time: string; maxBubbleWidth: number
}) {
  return (
    <Box flexDirection="column" alignItems={isUser ? "flex-end" : "flex-start"} marginTop={12}>
      <Box
        backgroundColor={isUser ? "#1f6feb" : "#161b22"}
        borderStyle="round"
        borderColor={isUser ? "#1f6feb" : "#30363d"}
        paddingX={12}
        paddingY={8}
        maxWidth={maxBubbleWidth}
      >
        <Text color={isUser ? "#ffffff" : "#e6edf3"} wrap="wrap">
          {text}
        </Text>
      </Box>
      <Text color="#484f58" marginTop={4}>
        {`${name} \u00b7 ${time}`}
      </Text>
    </Box>
  )
}

function ChatApp({ width }: { width: number }) {
  const maxBubbleWidth = Math.round(width * 0.72)
  return (
    <Box flexDirection="column">
      <Box backgroundColor="#161b22" paddingX={12} paddingY={8} justifyContent="space-between">
        <Text bold color="#e6edf3">Shrinkwrap Chat</Text>
        <Text color="#484f58">Canvas</Text>
      </Box>
      <Box flexDirection="column" paddingX={16} paddingTop={4} paddingBottom={12}>
        {messages.map((msg, i) => (
          <ChatBubble key={i} isUser={msg.role === "user"} name={msg.name} time={msg.time} text={msg.text} maxBubbleWidth={maxBubbleWidth} />
        ))}
        <Box marginTop={16} backgroundColor="#1f6feb22" paddingX={10} paddingY={8}>
          <Text color="#58a6ff" wrap="wrap">
            Every bubble wraps proportional text. CSS can't shrinkwrap like this.
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

const canvasOpts: CanvasRenderOptions = {
  monospace: false,
  fontSize: 14,
  fontFamily: '"Inter", "SF Pro Text", system-ui, sans-serif',
  lineHeight: 1.4,
  backgroundColor: "#0d1117",
  foregroundColor: "#e6edf3",
}

// ============================================================================
// Diagnostic engine
// ============================================================================

let instance: CanvasInstance | null = null
let showOverlay = true
let showDomText = false
const LINE_HEIGHT = Math.ceil(14 * 1.4) // 20px

function render(width: number) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  const overlay = document.getElementById("overlay") as HTMLCanvasElement
  const domRef = document.getElementById("dom-ref") as HTMLDivElement
  const viewport = document.getElementById("viewport") as HTMLDivElement
  if (!canvas || !overlay || !domRef) return

  viewport.style.width = `${width}px`

  // 1. Render Canvas (Silvery)
  if (instance) instance.unmount()
  instance = renderToCanvas(<ChatApp width={width} />, canvas, { ...canvasOpts, width, height: 800 })

  const dpr = window.devicePixelRatio || 1
  const buf = instance.getBuffer() as CanvasRenderBuffer | null
  let contentHeight = 800
  if (buf?.canvas) {
    contentHeight = buf.canvas.height / dpr
    instance.resize(width, contentHeight)
  }

  // 2. Render DOM reference (hidden)
  buildDomRef(domRef, width)
  domRef.style.height = `${contentHeight}px`

  // 3. Size overlay
  overlay.width = Math.ceil(width * dpr)
  overlay.height = Math.ceil(contentHeight * dpr)
  overlay.style.width = `${width}px`
  overlay.style.height = `${contentHeight}px`

  // 4. Read DOM rects
  const domRects = readDomRects(domRef)

  // 5. Draw overlay (red outlines for DOM rects)
  const octx = overlay.getContext("2d")!
  octx.setTransform(dpr, 0, 0, dpr, 0, 0)
  octx.clearRect(0, 0, width, contentHeight)

  if (showOverlay) {
    octx.strokeStyle = "rgba(255, 0, 0, 0.7)"
    octx.lineWidth = 1
    octx.setLineDash([3, 3])
    for (const [label, rect] of domRects) {
      octx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
      // Label
      octx.fillStyle = "rgba(255, 0, 0, 0.8)"
      octx.font = "9px monospace"
      octx.fillText(label, rect.x + 2, rect.y - 2)
    }
  }

  // 6. Build diff table
  // For now, read canvas element positions from the silvery ag tree
  // We approximate canvas rects from the DOM rects shifted — in a real implementation
  // we'd read from the silvery node tree. For diagnostic purposes, we compare
  // DOM rects against expected positions.
  const tbody = document.getElementById("diff-body")!
  tbody.innerHTML = ""

  // We can't easily get canvas node rects from outside the pipeline.
  // Instead, compare DOM rect heights (line count proxy) against expected single-line.
  let idx = 0
  for (const [label, rect] of domRects) {
    const domLines = estimateLineCount(rect, LINE_HEIGHT)
    // Approximate: text that's < maxBubbleWidth should be 1 line
    const tr = document.createElement("tr")
    tr.className = "ok" // We'll refine this
    tr.innerHTML = `
      <td>${idx}</td>
      <td>${label}</td>
      <td>${rect.width.toFixed(1)}</td>
      <td>—</td>
      <td>—</td>
      <td>${rect.height.toFixed(1)}</td>
      <td>—</td>
      <td>—</td>
      <td>${rect.y.toFixed(1)}</td>
      <td>—</td>
      <td>—</td>
      <td>${domLines}</td>
      <td>—</td>
    `
    tbody.appendChild(tr)
    idx++
  }
}

// ============================================================================
// Controls
// ============================================================================

const slider = document.getElementById("width-slider") as HTMLInputElement
const valueLabel = document.getElementById("width-value") as HTMLSpanElement
const btnOverlay = document.getElementById("btn-overlay") as HTMLButtonElement
const btnDom = document.getElementById("btn-dom") as HTMLButtonElement

slider.addEventListener("input", () => {
  const w = parseInt(slider.value)
  valueLabel.textContent = `${w}px`
  render(w)
})

btnOverlay.addEventListener("click", () => {
  showOverlay = !showOverlay
  btnOverlay.classList.toggle("active", showOverlay)
  render(parseInt(slider.value))
})

btnDom.addEventListener("click", () => {
  showDomText = !showDomText
  btnDom.classList.toggle("active", showDomText)
  document.getElementById("dom-ref")!.classList.toggle("visible", showDomText)
})

document.fonts.ready.then(() => render(parseInt(slider.value)))
