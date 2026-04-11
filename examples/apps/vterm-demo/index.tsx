/**
 * VTerm Demo -- same ChatApp in inline, fullscreen, and panes modes.
 *
 * Run: bun examples/apps/vterm-demo/index.tsx --mode=inline|fullscreen|panes [--fast]
 */

import React, { useState, useEffect } from "react"
import { Box, Text, ListView, useWindowSize } from "silvery"
import { SearchProvider, SearchBar } from "@silvery/ag-react"
import { run, useInput, type Key } from "silvery/runtime"
import type { ExampleMeta } from "../../_banner.js"
import { SCRIPT } from "../aichat/script.js"
import type { ScriptEntry } from "../aichat/types.js"
import type { Exchange } from "../aichat/types.js"

export const meta: ExampleMeta = {
  name: "VTerm Demo",
  description: "Same chat app in inline, fullscreen, and panes modes",
  demo: true,
  features: ["ListView", "SearchProvider", "inline", "fullscreen", "panes"],
}

interface ListItemMeta {
  isCursor: boolean
}

// ============================================================================
// Auto-advancing scripted content
// ============================================================================

function useAutoContent(script: ScriptEntry[], fast: boolean): Exchange[] {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (idx >= script.length) return
    const delay = fast ? 120 : 600 + Math.random() * 1000
    const timer = setTimeout(() => {
      const entry = script[idx]!
      setExchanges((prev) => [...prev, { ...entry, id: idx }])
      setIdx((i) => i + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [idx, script, fast])

  return exchanges
}

// ============================================================================
// ChatApp — reusable across all modes
// ============================================================================

function ChatApp({
  height,
  active = true,
  surfaceId,
  fast,
}: {
  height: number
  active?: boolean
  surfaceId?: string
  fast: boolean
}) {
  const exchanges = useAutoContent(SCRIPT, fast)

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
        isCacheable: (_ex: Exchange, i: number) => i < exchanges.length - 1,
      }}
      search={{ getText: (ex: Exchange) => ex.content }}
      renderItem={(ex: Exchange, _i: number, meta: ListItemMeta) => (
        <Box paddingX={1}>
          <Text>
            {meta.isCursor ? ">" : " "}{" "}
            <Text color={ex.role === "user" ? "$primary" : ex.role === "agent" ? "$success" : "$warning"} bold>
              {ex.role}
            </Text>
            : {ex.content.slice(0, 70)}
          </Text>
        </Box>
      )}
    />
  )
}

// ============================================================================
// Status bar
// ============================================================================

function StatusBar({ mode, count }: { mode: string; count: number }) {
  return (
    <Box paddingX={1}>
      <Text color="$muted">
        [{mode}] {count} exchanges | Ctrl+F search | q quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Fullscreen / Inline layout
// ============================================================================

function SingleApp({ mode, fast }: { mode: string; fast: boolean }) {
  const exchanges = useAutoContent(SCRIPT, fast)
  const { rows } = useWindowSize()

  useInput((_input: string, key: Key) => {
    if (key.escape || _input === "q") return "exit"
  })

  const listHeight = Math.max(5, rows - 2)

  return (
    <Box flexDirection="column" height={rows}>
      <ChatApp height={listHeight} fast={fast} />
      <SearchBar />
      <StatusBar mode={mode} count={exchanges.length} />
    </Box>
  )
}

// ============================================================================
// Panes layout
// ============================================================================

function PanesApp({ fast }: { fast: boolean }) {
  const [focus, setFocus] = useState<"left" | "right">("left")
  const exchanges = useAutoContent(SCRIPT, fast)
  const { rows } = useWindowSize()

  useInput((_input: string, key: Key) => {
    if (key.escape || _input === "q") return "exit"
    if (key.tab) setFocus((f) => (f === "left" ? "right" : "left"))
  })

  const listHeight = Math.max(5, rows - 4)

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="row" flexGrow={1}>
        <Box
          width="50%"
          flexDirection="column"
          borderStyle="single"
          borderColor={focus === "left" ? "$primary" : "$border"}
          overflow="hidden"
        >
          <Box paddingX={1}>
            <Text color={focus === "left" ? "$primary" : "$muted"} bold={focus === "left"}>
              Pane A
            </Text>
          </Box>
          <ChatApp height={listHeight} active={focus === "left"} surfaceId="left" fast={fast} />
        </Box>
        <Box
          width="50%"
          flexDirection="column"
          borderStyle="single"
          borderColor={focus === "right" ? "$primary" : "$border"}
          overflow="hidden"
        >
          <Box paddingX={1}>
            <Text color={focus === "right" ? "$primary" : "$muted"} bold={focus === "right"}>
              Pane B
            </Text>
          </Box>
          <ChatApp height={listHeight} active={focus === "right"} surfaceId="right" fast={fast} />
        </Box>
      </Box>
      <SearchBar />
      <StatusBar mode="panes" count={exchanges.length} />
    </Box>
  )
}

// ============================================================================
// Entry
// ============================================================================

export async function main() {
  const args = process.argv.slice(2)
  const fast = args.includes("--fast")
  const modeArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "fullscreen"
  const mode = modeArg as "inline" | "fullscreen" | "panes"

  const runtimeMode = mode === "panes" ? "fullscreen" : mode
  const app = mode === "panes" ? <PanesApp fast={fast} /> : <SingleApp mode={mode} fast={fast} />

  using handle = await run(<SearchProvider>{app}</SearchProvider>, {
    mode: runtimeMode,
    kitty: false,
    textSizing: false,
  })
  await handle.waitUntilExit()
}

if (import.meta.main) {
  await main()
}
