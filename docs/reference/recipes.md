# Recipes

Common patterns for building Silvery apps.

## Modal Dialog

```tsx
import { Box, Text, useInputLayer } from "silvery"

function ConfirmDialog({ message, onConfirm, onCancel }) {
  useInputLayer("confirm-dialog", (input, key) => {
    if (input === "y") {
      onConfirm()
      return true
    }
    if (input === "n" || key.escape) {
      onCancel()
      return true
    }
    return false
  })

  return (
    <Box borderStyle="round" paddingX={2} paddingY={1} flexDirection="column">
      <Text>{message}</Text>
      <Text dimColor>[y] Confirm [n] Cancel</Text>
    </Box>
  )
}

// Usage: conditionally render above your main content
function App() {
  const [showConfirm, setShowConfirm] = useState(false)
  return (
    <Box flexDirection="column">
      <MainContent />
      {showConfirm && (
        <ConfirmDialog
          message="Delete this item?"
          onConfirm={() => {
            deleteItem()
            setShowConfirm(false)
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </Box>
  )
}
```

## Search-Filter List

```tsx
import { Box, Text, TextInput, useBoxRect } from "silvery"

function FilterList({ items }) {
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)
  const filtered = items.filter((item) => item.toLowerCase().includes(query.toLowerCase()))

  return (
    <Box flexDirection="column">
      <Box>
        <Text>Search: </Text>
        <TextInput
          value={query}
          onChange={(v) => {
            setQuery(v)
            setCursor(0)
          }}
        />
      </Box>
      {filtered.map((item, i) => (
        <Text key={item} color={i === cursor ? "green" : undefined}>
          {i === cursor ? "> " : "  "}
          {item}
        </Text>
      ))}
      <Text dimColor>
        {filtered.length} / {items.length} items
      </Text>
    </Box>
  )
}
```

## Master-Detail Layout

```tsx
import { Box, Text, useBoxRect } from "silvery"

function MasterDetail({ items, selectedIndex }) {
  const selected = items[selectedIndex]

  return (
    <Box flexDirection="row" width="100%">
      {/* Master: fixed-width list */}
      <Box flexDirection="column" width={30} borderStyle="single">
        {items.map((item, i) => (
          <Text key={item.id} inverse={i === selectedIndex}>
            {item.title}
          </Text>
        ))}
      </Box>

      {/* Detail: fills remaining space */}
      <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
        <Text bold>{selected.title}</Text>
        <Text>{selected.body}</Text>
      </Box>
    </Box>
  )
}
```

## Streaming Output (AI/LLM)

```tsx
import { Box, Text, Static } from "silvery"

function StreamingChat({ messages, streamingText }) {
  return (
    <Box flexDirection="column">
      {/* Completed messages scroll off the top */}
      <Static items={messages}>
        {(msg) => (
          <Box key={msg.id}>
            <Text bold color={msg.role === "user" ? "blue" : "green"}>
              {msg.role}:
            </Text>
            <Text> {msg.content}</Text>
          </Box>
        )}
      </Static>

      {/* Currently streaming response stays at bottom */}
      {streamingText && (
        <Box>
          <Text color="green">assistant: </Text>
          <Text>{streamingText}</Text>
          <Text dimColor>{"▌"}</Text>
        </Box>
      )}
    </Box>
  )
}
```

## Bottom-Pinned Footer

Pin a footer or status bar to the bottom of a container using `stickyBottom`:

```tsx
import { Box, Text } from "silvery"

function Layout({ children }) {
  return (
    <Box height="100%" flexDirection="column">
      <Box flexGrow={1}>{children}</Box>
      <Box position="sticky" stickyBottom={0} height={1} backgroundColor="blue">
        <Text color="white"> Status: Ready </Text>
      </Box>
    </Box>
  )
}
```

The footer stays at the bottom regardless of content height. When content
grows to fill the container, the footer moves to its natural position
(which is the bottom anyway).

## Progress Tracking

```tsx
import { Box, Text, ProgressBar, Spinner } from "silvery"

function TaskProgress({ tasks }) {
  const done = tasks.filter((t) => t.status === "done").length
  const running = tasks.find((t) => t.status === "running")

  return (
    <Box flexDirection="column" gap={1}>
      <Box>
        <Text bold>Progress: </Text>
        <ProgressBar value={done / tasks.length} width={40} />
        <Text>
          {" "}
          {done}/{tasks.length}
        </Text>
      </Box>

      {running && (
        <Box>
          <Spinner type="dots" />
          <Text> {running.label}</Text>
        </Box>
      )}

      {tasks.map((task) => (
        <Text key={task.id} color={task.status === "done" ? "green" : "gray"}>
          {task.status === "done" ? "✓" : "○"} {task.label}
        </Text>
      ))}
    </Box>
  )
}
```
