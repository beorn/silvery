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
import type { AgNode } from "../../packages/ag/src/types.js"

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
  {
    role: "user",
    name: "You",
    time: "2:41 PM",
    text: "How does shrinkwrap sizing work? CSS can't do it, right?",
  },
  {
    role: "assistant",
    name: "Claude",
    time: "2:41 PM",
    text: "Right! CSS has no way to size a container to the tightest width of wrapped text. Pretext measures the actual rendered width of each line. Flexily uses this for layout.",
  },
  { role: "user", name: "You", time: "2:42 PM", text: "And this is all on canvas? No DOM layout?" },
  {
    role: "assistant",
    name: "Claude",
    time: "2:42 PM",
    text: "Exactly. Same React components as terminal \u2014 Box, Text, flex layout. Rendered with proportional fonts on Canvas2D.",
  },
  { role: "user", name: "You", time: "2:43 PM", text: "What about emoji and CJK?" },
  {
    role: "assistant",
    name: "Claude",
    time: "2:43 PM",
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
  for (const el of Array.from(container.querySelectorAll("[data-label]"))) {
    const label = (el as HTMLElement).dataset.label!
    const r = el.getBoundingClientRect()
    // Relative to container
    rects.set(label, new DOMRect(r.x - containerRect.x, r.y - containerRect.y, r.width, r.height))
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

function ChatBubble({
  text,
  isUser,
  name,
  time,
  maxBubbleWidth,
}: {
  text: string
  isUser: boolean
  name: string
  time: string
  maxBubbleWidth: number
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
      <Box marginTop={4}>
        <Text color="#484f58">{`${name} \u00b7 ${time}`}</Text>
      </Box>
    </Box>
  )
}

function ChatApp({ width }: { width: number }) {
  const maxBubbleWidth = Math.round(width * 0.72)
  return (
    <Box flexDirection="column">
      <Box backgroundColor="#161b22" paddingX={12} paddingY={8} justifyContent="space-between">
        <Text bold color="#e6edf3">
          Shrinkwrap Chat
        </Text>
        <Text color="#484f58">Canvas</Text>
      </Box>
      <Box flexDirection="column" paddingX={16} paddingTop={4} paddingBottom={12}>
        {messages.map((msg, i) => (
          <ChatBubble
            key={i}
            isUser={msg.role === "user"}
            name={msg.name}
            time={msg.time}
            text={msg.text}
            maxBubbleWidth={maxBubbleWidth}
          />
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
let showCanvasOverlay = false
let useDomMeasurer = false
const LINE_HEIGHT = Math.ceil(14 * 1.4) // 20px

// ============================================================================
// Ag tree walking — extract labeled rects from silvery's render tree
// ============================================================================

/** Labels we assign to ag tree nodes by matching text content or structure. */
const BUBBLE_TEXTS = messages.map((m) => m.text)
const META_TEXTS = messages.map((m) => `${m.name} \u00b7 ${m.time}`)

interface LabeledRect {
  label: string
  x: number
  y: number
  width: number
  height: number
}

/** Walk the ag tree and extract rects for nodes we can identify. */
function extractCanvasRects(root: AgNode): Map<string, LabeledRect> {
  const rects = new Map<string, LabeledRect>()

  function collectTextNodes(node: AgNode, acc: { node: AgNode; text: string }[]): void {
    if (node.type === "silvery-text" && node.textContent) {
      acc.push({ node, text: node.textContent })
    }
    for (const child of node.children) {
      collectTextNodes(child, acc)
    }
  }

  const textNodes: { node: AgNode; text: string }[] = []
  collectTextNodes(root, textNodes)

  // Track matched indices to handle duplicate texts (e.g., multiple "You · 2:43 PM")
  const matchedBubbleIndices = new Set<number>()
  const matchedMetaIndices = new Set<number>()

  /** Get the best available rect for a node — try the node first, fall back to parent Box. */
  function getRect(node: AgNode): LabeledRect | null {
    // Try the node's own rect
    const own = node.scrollRect ?? node.contentRect
    if (own && own.width > 0 && own.height > 0) return { label: "", ...own }
    // Text nodes often have 0x0 rects in proportional mode — use parent Box
    if (node.parent) {
      const parent = node.parent.scrollRect ?? node.parent.contentRect
      if (parent && parent.width > 0 && parent.height > 0) return { label: "", ...parent }
    }
    return null
  }

  // Match text nodes to labels
  for (const { node, text } of textNodes) {
    const trimmed = text.trim()

    // Title bar left
    if (trimmed === "Shrinkwrap Chat") {
      const r = getRect(node)
      if (r) rects.set("title-left", { ...r, label: "title-left" })
      continue
    }

    // Title bar right
    if (trimmed === "Canvas") {
      const r = getRect(node)
      if (r) rects.set("title-right", { ...r, label: "title-right" })
      continue
    }

    // Callout text — use the callout container (grandparent Box with backgroundColor)
    if (trimmed.startsWith("Every bubble wraps")) {
      const calloutBox = findAncestorWithBg(node)
      if (calloutBox) {
        const rect = calloutBox.scrollRect ?? calloutBox.contentRect
        if (rect) rects.set("callout", { label: "callout", ...rect })
      }
      continue
    }

    // Bubble text — use the bubble container (ancestor Box with backgroundColor)
    const bubbleIdx = BUBBLE_TEXTS.findIndex((t, i) => trimmed === t && !matchedBubbleIndices.has(i))
    if (bubbleIdx >= 0) {
      matchedBubbleIndices.add(bubbleIdx)
      const bubbleBox = findAncestorWithBg(node)
      if (bubbleBox) {
        const rect = bubbleBox.scrollRect ?? bubbleBox.contentRect
        if (rect) rects.set(`bubble-${bubbleIdx}`, { label: `bubble-${bubbleIdx}`, ...rect })
      }
      continue
    }

    // Meta text — use parent or own rect
    const metaIdx = META_TEXTS.findIndex((t, i) => trimmed === t && !matchedMetaIndices.has(i))
    if (metaIdx >= 0) {
      matchedMetaIndices.add(metaIdx)
      const r = getRect(node)
      if (r) rects.set(`meta-${metaIdx}`, { ...r, label: `meta-${metaIdx}` })
      continue
    }
  }

  return rects
}

/** Walk up the tree to find an ancestor Box with backgroundColor set. */
function findAncestorWithBg(node: AgNode): AgNode | null {
  let current = node.parent
  while (current) {
    if (current.type === "silvery-box") {
      const props = current.props as Record<string, unknown>
      if (props.backgroundColor) return current
    }
    current = current.parent
  }
  return null
}

function render(width: number) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  const overlay = document.getElementById("overlay") as HTMLCanvasElement
  const domRef = document.getElementById("dom-ref") as HTMLDivElement
  const viewport = document.getElementById("viewport") as HTMLDivElement
  if (!canvas || !overlay || !domRef) return

  viewport.style.width = `${width}px`

  // 1. Render Canvas (Silvery)
  if (instance) instance.unmount()
  instance = renderToCanvas(<ChatApp width={width} />, canvas, {
    ...canvasOpts,
    width,
    height: 800,
    measurer: useDomMeasurer ? "dom" : "pretext",
  })

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

  // 5. Read canvas rects from the ag tree
  const agRoot = instance.getRoot()
  const canvasRects = agRoot ? extractCanvasRects(agRoot) : new Map<string, LabeledRect>()

  // 6. Draw overlays
  const octx = overlay.getContext("2d")!
  octx.setTransform(dpr, 0, 0, dpr, 0, 0)
  octx.clearRect(0, 0, width, contentHeight)

  if (showOverlay) {
    // DOM outlines in red
    octx.strokeStyle = "rgba(255, 0, 0, 0.7)"
    octx.lineWidth = 1
    octx.setLineDash([3, 3])
    for (const [label, rect] of domRects) {
      octx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
      octx.fillStyle = "rgba(255, 0, 0, 0.8)"
      octx.font = "9px monospace"
      octx.fillText(label, rect.x + 2, rect.y - 2)
    }
  }

  if (showCanvasOverlay) {
    // Canvas ag node outlines in cyan
    octx.strokeStyle = "rgba(0, 200, 255, 0.7)"
    octx.lineWidth = 1
    octx.setLineDash([5, 2])
    for (const [label, rect] of canvasRects) {
      octx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
      octx.fillStyle = "rgba(0, 200, 255, 0.8)"
      octx.font = "9px monospace"
      octx.fillText(label, rect.x + rect.width - octx.measureText(label).width - 2, rect.y - 2)
    }
  }

  // 7. Build diff table — compare DOM vs Canvas rects
  const tbody = document.getElementById("diff-body")!
  tbody.innerHTML = ""

  const allLabels = new Set([...domRects.keys(), ...canvasRects.keys()])
  const sortedLabels = [...allLabels].sort()

  let maxDw = 0,
    maxDh = 0,
    maxDy = 0,
    matchCount = 0,
    mismatchCount = 0

  for (const label of sortedLabels) {
    const dom = domRects.get(label)
    const cvs = canvasRects.get(label)

    const dw = dom && cvs ? Math.abs(dom.width - cvs.width) : NaN
    const dh = dom && cvs ? Math.abs(dom.height - cvs.height) : NaN
    const dy = dom && cvs ? Math.abs(dom.y - cvs.y) : NaN
    const domLines = dom ? estimateLineCount(dom, LINE_HEIGHT) : NaN
    const cvsLines = cvs ? estimateLineCount(new DOMRect(0, 0, cvs.width, cvs.height), LINE_HEIGHT) : NaN

    if (!isNaN(dw)) maxDw = Math.max(maxDw, dw)
    if (!isNaN(dh)) maxDh = Math.max(maxDh, dh)
    if (!isNaN(dy)) maxDy = Math.max(maxDy, dy)

    const hasMismatch = dw > 2 || dh > 2 || dy > 2
    if (hasMismatch) mismatchCount++
    else if (dom && cvs) matchCount++

    const tr = document.createElement("tr")
    tr.className = hasMismatch ? "mismatch" : "ok"
    tr.innerHTML = `
      <td>${label}</td>
      <td>${dom ? dom.width.toFixed(1) : "—"}</td>
      <td>${cvs ? cvs.width.toFixed(1) : "—"}</td>
      <td class="${dw > 2 ? "mismatch" : ""}">${isNaN(dw) ? "—" : dw.toFixed(1)}</td>
      <td>${dom ? dom.height.toFixed(1) : "—"}</td>
      <td>${cvs ? cvs.height.toFixed(1) : "—"}</td>
      <td class="${dh > 2 ? "mismatch" : ""}">${isNaN(dh) ? "—" : dh.toFixed(1)}</td>
      <td>${dom ? dom.y.toFixed(1) : "—"}</td>
      <td>${cvs ? cvs.y.toFixed(1) : "—"}</td>
      <td class="${dy > 2 ? "mismatch" : ""}">${isNaN(dy) ? "—" : dy.toFixed(1)}</td>
      <td>${isNaN(domLines) ? "—" : domLines}</td>
      <td>${isNaN(cvsLines) ? "—" : cvsLines}</td>
    `
    tbody.appendChild(tr)
  }

  // Summary row
  const summary = document.createElement("tr")
  summary.style.borderTop = "2px solid #30363d"
  summary.style.fontWeight = "bold"
  summary.innerHTML = `
    <td>${matchCount} ok / ${mismatchCount} mismatch</td>
    <td colspan="2"></td>
    <td>${maxDw.toFixed(1)}</td>
    <td colspan="2"></td>
    <td>${maxDh.toFixed(1)}</td>
    <td colspan="2"></td>
    <td>${maxDy.toFixed(1)}</td>
    <td colspan="2">max deltas</td>
  `
  tbody.appendChild(summary)
}

// ============================================================================
// Controls
// ============================================================================

const slider = document.getElementById("width-slider") as HTMLInputElement
const valueLabel = document.getElementById("width-value") as HTMLSpanElement
const btnOverlay = document.getElementById("btn-overlay") as HTMLButtonElement
const btnCanvas = document.getElementById("btn-canvas") as HTMLButtonElement
const btnDom = document.getElementById("btn-dom") as HTMLButtonElement
const btnMeasurer = document.getElementById("btn-measurer") as HTMLButtonElement

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

btnCanvas.addEventListener("click", () => {
  showCanvasOverlay = !showCanvasOverlay
  btnCanvas.classList.toggle("active", showCanvasOverlay)
  render(parseInt(slider.value))
})

btnMeasurer.addEventListener("click", () => {
  useDomMeasurer = !useDomMeasurer
  btnMeasurer.textContent = useDomMeasurer ? "DOM measurer" : "Pretext"
  btnMeasurer.classList.toggle("active", useDomMeasurer)
  render(parseInt(slider.value))
})

btnDom.addEventListener("click", () => {
  showDomText = !showDomText
  btnDom.classList.toggle("active", showDomText)
  document.getElementById("dom-ref")!.classList.toggle("visible", showDomText)
})

document.fonts.ready.then(() => render(parseInt(slider.value)))
