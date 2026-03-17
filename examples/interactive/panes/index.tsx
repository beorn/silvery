/**
 * Panes — tmux-style split pane demo with virtual history.
 *
 * Showcases: SplitView, ListView (virtual history), SearchProvider, SurfaceRegistry.
 * Two AI chat panes running independently, each with scrollable frozen history.
 * Tab switches focus, Ctrl+F searches the focused pane.
 *
 * This is the Phase 5 showcase — exercises all 4 prior phases together:
 * - Phase 1: ListView (navigable, unified VirtualView+VirtualList)
 * - Phase 2: HistoryBuffer + ListDocument + TextSurface
 * - Phase 3: Virtual history mode + viewport compositor
 * - Phase 4: SearchProvider + SurfaceRegistry + SearchBar
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Box, Text, SplitView, ListView, SearchBar, useContentRect } from "silvery"
import { SurfaceRegistryProvider, SearchProvider, useSearch } from "@silvery/react"
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
  description: "tmux-style split panes with virtual history and Ctrl+F search",
  demo: true,
  features: ["SplitView", "ListView", "virtual history", "SearchProvider", "Tab focus"],
}

// ============================================================================
// Types
// ============================================================================

interface PaneState {
  exchanges: Exchange[]
  nextId: number
  scriptIdx: number
  done: boolean
}

// ============================================================================
// Pane content — simplified aichat without TEA (just auto-advance)
// ============================================================================

function usePaneContent(script: ScriptEntry[], fastMode: boolean, label: string): PaneState {
  const [state, setState] = useState<PaneState>({
    exchanges: [],
    nextId: 0,
    scriptIdx: 0,
    done: false,
  })

  useEffect(() => {
    if (state.done) return
    if (state.scriptIdx >= script.length) {
      setState((s) => ({ ...s, done: true }))
      return
    }

    const delay = fastMode ? 100 : 800 + Math.random() * 1200
    const timer = setTimeout(() => {
      setState((s) => {
        const entry = script[s.scriptIdx]
        if (!entry) return { ...s, done: true }
        const exchange: Exchange = { ...entry, id: s.nextId }
        return {
          exchanges: [...s.exchanges, exchange],
          nextId: s.nextId + 1,
          scriptIdx: s.scriptIdx + 1,
          done: s.scriptIdx + 1 >= script.length,
        }
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [state.scriptIdx, state.done, script, fastMode])

  return state
}

// ============================================================================
// Pane component
// ============================================================================

function ChatPane({
  script,
  fastMode,
  surfaceId,
  height,
  isFocused,
}: {
  script: ScriptEntry[]
  fastMode: boolean
  surfaceId: string
  height: number
  isFocused: boolean
}) {
  const paneState = usePaneContent(script, fastMode, surfaceId)

  return (
    <ListView
      items={paneState.exchanges}
      height={Math.max(3, height - 2)} // Account for SplitView borders
      getKey={(ex) => ex.id}
      // TODO: Add when ListView history props are wired (Phase 3 merge)
      // surfaceId={surfaceId}
      // history={{ mode: "virtual", freezeWhen: (ex, idx) => idx < paneState.exchanges.length - 1 }}
      // text={{ getItemText: (ex) => ex.content }}
      scrollTo={paneState.exchanges.length - 1}
      renderItem={(exchange: Exchange, _index: number, _meta: ListItemMeta) => (
        <Box flexDirection="column" paddingX={1}>
          <ExchangeItem
            exchange={exchange}
            streamPhase="done"
            revealFraction={1}
            pulse={false}
            isLatest={false}
            isFirstInGroup={true}
            isLastInGroup={true}
          />
        </Box>
      )}
    />
  )
}

// ============================================================================
// Main app
// ============================================================================

function PanesApp({ fastMode }: { fastMode: boolean }) {
  const [focusedPane, setFocusedPane] = useState<"left" | "right">("left")
  const { height } = useContentRect()
  const search = useSearch()

  // Split the script: first half left, second half right
  const midpoint = Math.ceil(SCRIPT.length / 2)
  const leftScript = useMemo(() => SCRIPT.slice(0, midpoint), [midpoint])
  const rightScript = useMemo(() => SCRIPT.slice(midpoint), [midpoint])

  // Layout: vertical split 50/50
  const layout = useMemo(() => splitPane(createLeaf("left"), createLeaf("right"), "horizontal", 0.5), [])

  // Key bindings
  useInput((input: string, key: Key) => {
    if (key.escape && !search.isActive) return "exit"
    // Tab switches panes
    if (key.tab) {
      setFocusedPane((p) => (p === "left" ? "right" : "left"))
      return
    }
    // Ctrl+F opens search
    if (key.ctrl && input === "f") {
      search.open()
      return
    }
    // When search is active, route keys to search
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

  const paneHeight = height ?? 24

  return (
    <Box flexDirection="column" height={paneHeight}>
      <Box flexGrow={1}>
        <SplitView
          layout={layout}
          focusedPaneId={focusedPane}
          focusedBorderColor="$primary"
          unfocusedBorderColor="$border"
          renderPaneTitle={(id) => (id === "left" ? " Agent A " : " Agent B ")}
          renderPane={(id) => (
            <ChatPane
              script={id === "left" ? leftScript : rightScript}
              fastMode={fastMode}
              surfaceId={id}
              height={paneHeight - 2}
              isFocused={id === focusedPane}
            />
          )}
        />
      </Box>
      <SearchBar />
      <Box>
        <Text color="$muted">Tab: switch pane Ctrl+F: search Esc: {search.isActive ? "close search" : "quit"}</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Entry
// ============================================================================

function App({ fastMode }: { fastMode: boolean }) {
  return (
    <SurfaceRegistryProvider>
      <SearchProvider>
        <PanesApp fastMode={fastMode} />
      </SearchProvider>
    </SurfaceRegistryProvider>
  )
}

export async function main() {
  const args = process.argv.slice(2)
  const fastMode = args.includes("--fast")

  using handle = await run(<App fastMode={fastMode} />, { mode: "fullscreen" })
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
