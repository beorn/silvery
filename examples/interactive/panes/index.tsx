/**
 * Panes — tmux-style split pane demo.
 *
 * Two AI chat panes with SplitView, tab focus switching, Ctrl+F search.
 * Showcases: SplitView, ListView, SearchProvider, SurfaceRegistry.
 *
 * Run: bun examples/interactive/panes/index.tsx [--fast]
 */

import React, { useState, useEffect, useMemo } from "react"
import { Box, Text, SplitView, ListView } from "silvery"
import { SurfaceRegistryProvider, SearchProvider, useSearch, SearchBar } from "@silvery/react"
import { run, useInput, type Key } from "@silvery/term/runtime"
import { createLeaf, splitPane } from "@silvery/term/pane-manager"
import type { ExampleMeta } from "../../_banner.js"
import { SCRIPT } from "../aichat/script.js"
import type { ScriptEntry } from "../aichat/types.js"
import type { Exchange } from "../aichat/types.js"
import { ExchangeItem } from "../aichat/components.js"
import type { ListItemMeta } from "@silvery/ui/components/ListView"

export const meta: ExampleMeta = {
  name: "Panes",
  description: "tmux-style split panes — SplitView + ListView + SearchProvider",
  demo: true,
  features: ["SplitView", "ListView", "SearchProvider", "Tab focus"],
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
// Chat pane — renders exchanges in a ListView
// ============================================================================

function ChatPane({ script, fastMode, height }: { script: ScriptEntry[]; fastMode: boolean; height: number }) {
  const exchanges = usePaneContent(script, fastMode)

  if (exchanges.length === 0) {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="$muted">Waiting for messages...</Text>
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
  const search = useSearch()

  // Split script: first half left, second half right
  const midpoint = Math.ceil(SCRIPT.length / 2)
  const leftScript = useMemo(() => SCRIPT.slice(0, midpoint), [midpoint])
  const rightScript = useMemo(() => SCRIPT.slice(midpoint), [midpoint])

  // Layout: horizontal split 50/50
  const layout = useMemo(() => splitPane(createLeaf("left"), createLeaf("right"), "vertical", 0.5), [])

  // Key bindings
  useInput((input: string, key: Key) => {
    if (key.escape && !search.isActive) return "exit"
    if (key.tab) {
      setFocusedPane((p) => (p === "left" ? "right" : "left"))
      return
    }
    if (key.ctrl && input === "f") {
      search.open()
      return
    }
    if (search.isActive) {
      if (key.escape) {
        search.close()
        return
      }
      if (key.return && !key.shift) {
        search.next()
        return
      }
      if (key.return && key.shift) {
        search.prev()
        return
      }
      if (key.backspace) {
        search.backspace()
        return
      }
      if (key.leftArrow) {
        search.cursorLeft()
        return
      }
      if (key.rightArrow) {
        search.cursorRight()
        return
      }
      if (input && !key.ctrl && !key.meta) {
        search.input(input)
        return
      }
    }
  })

  // Reserve 2 rows: 1 for search bar, 1 for status
  // SplitView borders take 2 rows per pane (top + bottom)
  const paneInnerHeight = Math.max(5, rows - 4)

  return (
    <Box flexDirection="row" height={rows - 2}>
      <Box width="50%" borderStyle="single" borderColor={focusedPane === "left" ? "$primary" : "$border"}>
        <ChatPane script={leftScript} fastMode={fastMode} height={rows - 4} />
      </Box>
      <Box width="50%" borderStyle="single" borderColor={focusedPane === "right" ? "$primary" : "$border"}>
        <ChatPane script={rightScript} fastMode={fastMode} height={rows - 4} />
      </Box>
    </Box>
  )
}

// ============================================================================
// Entry
// ============================================================================

function App({ fastMode, rows }: { fastMode: boolean; rows: number }) {
  return (
    <SurfaceRegistryProvider>
      <SearchProvider>
        <PanesApp fastMode={fastMode} rows={rows} />
      </SearchProvider>
    </SurfaceRegistryProvider>
  )
}

export async function main() {
  const args = process.argv.slice(2)
  const fastMode = args.includes("--fast")
  const rows = process.stdout.rows ?? 40

  using handle = await run(<App fastMode={fastMode} rows={rows} />, {
    mode: "fullscreen",
    kitty: false,
    textSizing: false,
  })
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
