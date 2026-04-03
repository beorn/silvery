/**
 * DOM vs Canvas (Silvery) — Side-by-side Comparison
 *
 * Same chat data rendered two ways:
 * - Left: Standard HTML/CSS with DOM layout
 * - Right: Silvery React components on Canvas2D with Pretext measurement
 *
 * Shared width slider controls both panels simultaneously.
 */

import React from "react"
import { renderToCanvas, Box, Text, type CanvasRenderOptions } from "../../packages/ag-react/src/ui/canvas/index.js"
import type { CanvasInstance, CanvasRenderBuffer } from "../../packages/ag-react/src/ui/canvas/index.js"

// ============================================================================
// Shared chat data
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
// DOM renderer
// ============================================================================

function renderDom(container: HTMLElement, width: number) {
  container.innerHTML = ""

  // Title bar
  const titleBar = document.createElement("div")
  titleBar.className = "dom-title-bar"
  titleBar.innerHTML = `<span class="title">Shrinkwrap Chat</span><span class="subtitle">DOM</span>`
  container.appendChild(titleBar)

  // Messages
  for (const msg of messages) {
    const isUser = msg.role === "user"
    const group = document.createElement("div")
    group.className = `dom-bubble-group ${isUser ? "user" : "bot"}`

    const bubble = document.createElement("div")
    bubble.className = `dom-bubble ${isUser ? "user" : "bot"}`
    bubble.style.maxWidth = `${Math.round(width * 0.72)}px`
    bubble.textContent = msg.text

    const meta = document.createElement("div")
    meta.className = "dom-meta"
    meta.textContent = `${msg.name} \u00b7 ${msg.time}`

    group.appendChild(bubble)
    group.appendChild(meta)
    container.appendChild(group)
  }

  // Callout
  const callout = document.createElement("div")
  callout.className = "dom-callout"
  callout.textContent = "Every bubble wraps proportional text. CSS can\u2019t shrinkwrap like this."
  container.appendChild(callout)
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
        <Text color="#484f58">
          {`${name} \u00b7 ${time}`}
        </Text>
      </Box>
    </Box>
  )
}

function ChatApp({ width }: { width: number }) {
  const maxBubbleWidth = Math.round(width * 0.72)
  return (
    <Box flexDirection="column">
      {/* Title bar — flush with edges (no outer padding) */}
      <Box backgroundColor="#161b22" paddingX={12} paddingY={8} justifyContent="space-between">
        <Text bold color="#e6edf3">
          Shrinkwrap Chat
        </Text>
        <Text color="#484f58">Canvas</Text>
      </Box>
      {/* Chat area with padding */}
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
  measurer: "dom", // Use DOM measurement for pixel-perfect CSS parity
}

// ============================================================================
// Mount + slider
// ============================================================================

let instance: CanvasInstance | null = null

function mount(width: number) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  const domChat = document.getElementById("dom-chat") as HTMLDivElement
  const domPanel = document.getElementById("dom-panel") as HTMLDivElement
  const canvasPanel = document.getElementById("canvas-panel") as HTMLDivElement
  if (!canvas || !domChat) return

  // Size both panels to the same width
  domPanel.style.width = `${width}px`
  domPanel.style.flex = "none"
  canvasPanel.style.width = `${width}px`
  canvasPanel.style.flex = "none"

  // DOM side
  renderDom(domChat, width)

  // Canvas side — unmount previous, render fresh
  if (instance) instance.unmount()

  instance = renderToCanvas(<ChatApp width={width} />, canvas, {
    ...canvasOpts,
    width,
    height: 800,
  })

  // Auto-size canvas height to content
  const dpr = window.devicePixelRatio || 1
  const buf = instance.getBuffer() as CanvasRenderBuffer | null
  if (buf?.canvas) {
    // Buffer canvas is at native resolution — convert back to CSS pixels
    const contentHeight = buf.canvas.height / dpr
    instance.resize(width, contentHeight)
  }
}

const slider = document.getElementById("width-slider") as HTMLInputElement
const valueLabel = document.getElementById("width-value") as HTMLSpanElement

slider.addEventListener("input", () => {
  const w = parseInt(slider.value)
  valueLabel.textContent = `${w}px`
  mount(w)
})

document.fonts.ready.then(() => mount(parseInt(slider.value)))
