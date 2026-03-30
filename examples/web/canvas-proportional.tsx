/**
 * Silvery Canvas — Proportional Text Demo
 *
 * Same React components as terminal, rendered on canvas with proportional fonts.
 * Uses renderToCanvas({ monospace: false }) for pixel-based layout via Pretext-style measurement.
 */

import React from "react"
import { renderToCanvas, Box, Text } from "../../packages/ag-react/src/ui/canvas/index.js"

function ChatBubble({ text, isUser, name, time }: { text: string; isUser: boolean; name: string; time: string }) {
  return (
    <Box flexDirection="column" alignItems={isUser ? "flex-end" : "flex-start"} marginTop={4}>
      <Box
        backgroundColor={isUser ? "#1f6feb" : "#161b22"}
        borderStyle={isUser ? undefined : "single"}
        borderColor={isUser ? undefined : "#30363d"}
        paddingX={12}
        paddingY={8}
      >
        <Text color={isUser ? "#ffffff" : "#e6edf3"} wrap="wrap">
          {text}
        </Text>
      </Box>
      <Box marginTop={2}>
        <Text color="#8b949e" dimColor>
          {name} · {time}
        </Text>
      </Box>
    </Box>
  )
}

function App() {
  return (
    <Box flexDirection="column" padding={16}>
      <Box backgroundColor="#161b22" paddingX={16} paddingY={12}>
        <Text bold color="#e6edf3">
          Shrinkwrap Chat — Silvery + Canvas
        </Text>
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
      <ChatBubble isUser name="You" time="2:42 PM" text="And this is all on canvas? No DOM layout?" />
      <ChatBubble
        isUser={false}
        name="Claude"
        time="2:42 PM"
        text="Exactly. Same React components as terminal — Box, Text, padding, flex. But rendered with proportional fonts on canvas."
      />
      <ChatBubble isUser name="You" time="2:43 PM" text="This is wild 🚀" />
    </Box>
  )
}

// Mount to canvas after fonts load
document.fonts.ready.then(() => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  if (canvas) {
    renderToCanvas(<App />, canvas, {
      monospace: false,
      fontSize: 14,
      fontFamily: '"Inter", "SF Pro Text", system-ui, sans-serif',
      lineHeight: 1.4,
      backgroundColor: "#0d1117",
      foregroundColor: "#e6edf3",
    })
  }
})
