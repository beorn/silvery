/**
 * Panes — tmux-style split pane demo.
 *
 * Two AI chat panes running independently, Tab to switch focus, Esc to quit.
 * Showcases: ListView, side-by-side flex layout, border focus indication.
 *
 * Run: bun examples/interactive/panes/index.tsx [--fast]
 */

import React, { useState, useEffect, useMemo } from "react"
import { Box, Text, ListView } from "silvery"
import { run, useInput, type Key } from "@silvery/term/runtime"
import type { ExampleMeta } from "../../_banner.js"
import { SCRIPT } from "../aichat/script.js"
import type { ScriptEntry } from "../aichat/types.js"
import type { Exchange } from "../aichat/types.js"
import { ExchangeItem } from "../aichat/components.js"
import type { ListItemMeta } from "@silvery/ui/components/ListView"

export const meta: ExampleMeta = {
  name: "Panes",
  description: "tmux-style split panes — ListView + focus switching",
  demo: true,
  features: ["ListView", "split panes", "Tab focus"],
}

// ============================================================================
// Auto-advancing chat content
// ============================================================================

function usePaneContent(script: ScriptEntry[], fastMode: boolean): Exchange[] {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (idx >= script.length) return
    const delay = fastMode ? 150 : 800 + Math.random() * 1200
    const timer = setTimeout(() => {
      const entry = script[idx]!
      setExchanges((prev) => [...prev, { ...entry, id: idx }])
      setIdx((i) => i + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [idx, script, fastMode])

  return exchanges
}

// ============================================================================
// Pane wrapper — border + title + content
// ============================================================================

function Pane({
  title,
  isFocused,
  children,
}: {
  title: string
  isFocused: boolean
  children: React.ReactNode
}) {
  const borderColor = isFocused ? "$primary" : "$border"
  return (
    <Box
      width="50%"
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      overflow="hidden"
    >
      <Box paddingX={1}>
        <Text color={borderColor} bold={isFocused}>
          {title}
        </Text>
      </Box>
      {children}
    </Box>
  )
}

// ============================================================================
// Chat pane — renders exchanges in a ListView
// ============================================================================

function ChatPane({ script, fastMode, height: maxHeight }: { script: ScriptEntry[]; fastMode: boolean; height: number }) {
  // Use maxHeight but cap to actual items (avoid over-allocation)
  const height = maxHeight
  const exchanges = usePaneContent(script, fastMode)

  if (exchanges.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="$muted">Waiting...</Text>
      </Box>
    )
  }

  return (
    <ListView
      items={exchanges}
      height={height}
      getKey={(ex) => ex.id}
      scrollTo={exchanges.length - 1}
      renderItem={(exchange: Exchange, _index: number, _meta: ListItemMeta) => (
        <ExchangeItem
          exchange={exchange}
          streamPhase="done"
          revealFraction={1}
          pulse={false}
          isLatest={false}
          isFirstInGroup={true}
          isLastInGroup={true}
        />
      )}
    />
  )
}

// ============================================================================
// Main app
// ============================================================================

function PanesApp({ fastMode, rows }: { fastMode: boolean; rows: number }) {
  const [focusedPane, setFocusedPane] = useState<"left" | "right">("left")

  // Split script: first half left, second half right
  const midpoint = Math.ceil(SCRIPT.length / 2)
  const leftScript = useMemo(() => SCRIPT.slice(0, midpoint), [midpoint])
  const rightScript = useMemo(() => SCRIPT.slice(midpoint), [midpoint])

  useInput((input: string, key: Key) => {
    if (key.escape) return "exit"
    if (key.tab) {
      setFocusedPane((p) => (p === "left" ? "right" : "left"))
    }
  })

  // rows = terminal height
  // Each pane: border top(1) + title(1) + content + border bottom(1) = content + 3
  // Plus status bar(1). So content = rows - 3 - 1 = rows - 4.
  // Use overflow="scroll" on the ListView Box for safety.
  const listHeight = Math.max(5, rows - 5)

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="row" flexGrow={1}>
        <Pane title="Agent A" isFocused={focusedPane === "left"}>
          <ChatPane script={leftScript} fastMode={fastMode} height={listHeight} />
        </Pane>
        <Pane title="Agent B" isFocused={focusedPane === "right"}>
          <ChatPane script={rightScript} fastMode={fastMode} height={listHeight} />
        </Pane>
      </Box>
      <Box paddingX={1}>
        <Text color="$muted">Tab: switch pane · Esc: quit</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Entry
// ============================================================================

export async function main() {
  const args = process.argv.slice(2)
  const fastMode = args.includes("--fast")
  const rows = process.stdout.rows ?? 40

  using handle = await run(<PanesApp fastMode={fastMode} rows={rows} />, {
    mode: "fullscreen",
    kitty: false,
    textSizing: false,
  })
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
