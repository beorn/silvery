/**
 * Panes — tmux-style split pane demo.
 *
 * Two AI chat panes running independently, Tab to switch focus, Esc to quit.
 * SearchProvider with Ctrl+F bindings for app-global search.
 *
 * Run: bun examples/apps/panes/index.tsx [--fast]
 */

import React, { useState, useEffect, useMemo } from "react"
import { Box, Text, ListView } from "silvery"
import { SearchProvider, SearchBar, useSearch } from "@silvery/ag-react"
import { run, useInput, type Key } from "silvery/runtime"
import type { ExampleMeta } from "../../_banner.js"
import { SCRIPT } from "../aichat/script.js"
import type { ScriptEntry } from "../aichat/types.js"
import type { Exchange } from "../aichat/types.js"
import { ExchangeItem } from "../aichat/components.js"
// ListItemMeta type from ListView — inline to avoid tsconfig path issues
interface ListItemMeta {
  isCursor: boolean
}

export const meta: ExampleMeta = {
  name: "Panes",
  description: "tmux-style split panes — ListView + SearchProvider + focus switching",
  demo: true,
  features: ["ListView", "SearchProvider", "split panes", "Tab focus"],
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
// Chat pane
// ============================================================================

function ChatPane({
  script,
  fastMode,
  height,
  active,
  surfaceId,
}: {
  script: ScriptEntry[]
  fastMode: boolean
  height: number
  active: boolean
  surfaceId: string
}) {
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
      getKey={(ex: Exchange) => ex.id}
      scrollTo={exchanges.length - 1}
      active={active}
      surfaceId={surfaceId}
      cache={{
        mode: "virtual",
        isCacheable: (_ex: Exchange, idx: number) => idx < exchanges.length - 1,
      }}
      search={{ getText: (ex: Exchange) => ex.content }}
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

  const midpoint = Math.ceil(SCRIPT.length / 2)
  const leftScript = useMemo(() => SCRIPT.slice(0, midpoint), [midpoint])
  const rightScript = useMemo(() => SCRIPT.slice(midpoint), [midpoint])

  useInput((input: string, key: Key) => {
    // Don't exit while search is active — Escape closes search first
    if (key.escape && !search.isActive) return "exit"
    if (key.tab && !search.isActive) {
      setFocusedPane((p) => (p === "left" ? "right" : "left"))
    }
  })

  // Pane content height: rows - border(2) - title(1) - status(1) = rows - 4
  const listHeight = Math.max(5, rows - 4)

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="row" flexGrow={1}>
        <Box
          width="50%"
          flexDirection="column"
          borderStyle="single"
          borderColor={focusedPane === "left" ? "$primary" : "$border"}
          overflow="hidden"
        >
          <Box paddingX={1}>
            <Text color={focusedPane === "left" ? "$primary" : "$border"} bold={focusedPane === "left"}>
              Agent A
            </Text>
          </Box>
          <ChatPane
            script={leftScript}
            fastMode={fastMode}
            height={listHeight}
            active={focusedPane === "left"}
            surfaceId="left"
          />
        </Box>
        <Box
          width="50%"
          flexDirection="column"
          borderStyle="single"
          borderColor={focusedPane === "right" ? "$primary" : "$border"}
          overflow="hidden"
        >
          <Box paddingX={1}>
            <Text color={focusedPane === "right" ? "$primary" : "$border"} bold={focusedPane === "right"}>
              Agent B
            </Text>
          </Box>
          <ChatPane
            script={rightScript}
            fastMode={fastMode}
            height={listHeight}
            active={focusedPane === "right"}
            surfaceId="right"
          />
        </Box>
      </Box>
      <SearchBar />
      <Box paddingX={1}>
        <Text color="$muted">Tab: switch pane · Ctrl+F: search · Esc: quit</Text>
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

  using handle = await run(
    <SearchProvider>
      <PanesApp fastMode={fastMode} rows={rows} />
    </SearchProvider>,
    { mode: "fullscreen", kitty: false, textSizing: false },
  )
  await handle.waitUntilExit()
}

if (import.meta.main) {
  await main()
}
