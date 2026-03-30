/**
 * Silvery Canvas — Proportional Chat Demo
 *
 * Same React components as terminal, rendered on canvas with proportional fonts.
 * Width slider re-renders the entire component tree at new dimensions.
 */

import React from "react"
import { renderToCanvas, Box, Text, type CanvasRenderOptions } from "../../packages/ag-react/src/ui/canvas/index.js"
import type { CanvasInstance } from "../../packages/ag-react/src/ui/canvas/index.js"

function ChatBubble({ text, isUser, name, time }: { text: string; isUser: boolean; name: string; time: string }) {
  return (
    <Box flexDirection="column" alignItems={isUser ? "flex-end" : "flex-start"} marginTop={12}>
      <Box
        backgroundColor={isUser ? "#1f6feb" : "#161b22"}
        borderStyle="round"
        borderColor={isUser ? "#1f6feb" : "#30363d"}
        paddingX={12}
        paddingY={8}
        maxWidth={340}
      >
        <Text color={isUser ? "#ffffff" : "#e6edf3"} wrap="wrap">
          {text}
        </Text>
      </Box>
      <Box marginTop={4}>
        <Text color="#484f58">{name} · {time}</Text>
      </Box>
    </Box>
  )
}

function ChatApp() {
  return (
    <Box flexDirection="column" paddingX={16} paddingY={12}>
      {/* Title bar */}
      <Box backgroundColor="#161b22" paddingX={12} paddingY={8} justifyContent="space-between">
        <Text bold color="#e6edf3">Shrinkwrap Chat</Text>
        <Text color="#484f58">ag-canvas</Text>
      </Box>

      <ChatBubble
        isUser
        name="You"
        time="2:41 PM"
        text="How does shrinkwrap sizing work? CSS can't do it, right?"
      />
      <ChatBubble
        isUser={false}
        name="Claude"
        time="2:41 PM"
        text="Right! CSS has no way to size a container to the tightest width of wrapped text. Pretext measures the actual rendered width of each line. Flexily uses this for layout."
      />
      <ChatBubble
        isUser
        name="You"
        time="2:42 PM"
        text="And this is all on canvas? No DOM layout?"
      />
      <ChatBubble
        isUser={false}
        name="Claude"
        time="2:42 PM"
        text="Exactly. Same React components as terminal — Box, Text, flex layout. Rendered with proportional fonts on Canvas2D."
      />
      <ChatBubble isUser name="You" time="2:43 PM" text="What about emoji and CJK?" />
      <ChatBubble
        isUser={false}
        name="Claude"
        time="2:43 PM"
        text="Emoji like 🚀 and CJK like 春天到了 are measured correctly via canvas measureText()."
      />
      <ChatBubble isUser name="You" time="2:43 PM" text="This is wild 🚀" />

      {/* Callout */}
      <Box marginTop={16} backgroundColor="#1f6feb22" paddingX={10} paddingY={8}>
        <Text color="#58a6ff" wrap="wrap">Every bubble wraps proportional text. CSS can't shrinkwrap like this.</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Mount + slider
// ============================================================================

const renderOpts: CanvasRenderOptions = {
  monospace: false,
  fontSize: 14,
  fontFamily: '"Inter", "SF Pro Text", system-ui, sans-serif',
  lineHeight: 1.4,
  backgroundColor: "#0d1117",
  foregroundColor: "#e6edf3",
}

let instance: CanvasInstance | null = null

function mount(width: number) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  if (!canvas) return

  // Unmount previous
  if (instance) instance.unmount()

  // Resize canvas
  canvas.width = width
  canvas.height = 800

  const wrapper = document.getElementById("wrapper")!
  wrapper.style.width = `${width}px`

  instance = renderToCanvas(<ChatApp />, canvas, { ...renderOpts, width })

  // Auto-size canvas height to content
  const buf = instance.getBuffer() as any
  if (buf?.canvas) {
    canvas.height = buf.canvas.height
    canvas.style.height = `${buf.canvas.height}px`
    // Re-render at correct height
    instance.resize(width, buf.canvas.height)
  }
}

// Slider
const slider = document.getElementById("width-slider") as HTMLInputElement
const valueLabel = document.getElementById("width-value") as HTMLSpanElement

slider.addEventListener("input", () => {
  const w = parseInt(slider.value)
  valueLabel.textContent = `${w}px`
  mount(w)
})

// Initial render after fonts load
document.fonts.ready.then(() => mount(parseInt(slider.value)))
