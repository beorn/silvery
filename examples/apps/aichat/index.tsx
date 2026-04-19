/**
 * AI Chat — Coding Agent Demo
 *
 * Showcases ListView with streaming, tool calls, context tracking.
 * TEA state machine drives all animation; ListView caches completed
 * exchanges while live content stays in the React tree.
 *
 * Flags: --auto (auto-advance) --fast (skip animation) --stress (200 exchanges)
 */

import React, { useCallback, useEffect, useRef, useMemo } from "react"
import { Box, Text, Spinner, ListView, useTea, useWindowSize } from "silvery"
import type { ListItemMeta } from "silvery"
import { run, useInput, useExit, type Key } from "silvery/runtime"
import type { ExampleMeta } from "../../_banner.js"
import type { ScriptEntry } from "./types.js"
import { SCRIPT, generateStressScript, CONTEXT_WINDOW } from "./script.js"
import {
  INIT_STATE,
  createDemoUpdate,
  computeCumulativeTokens,
  getNextMessage,
  type DemoState,
  type DemoMsg,
} from "./state.js"
import { ExchangeItem, DemoFooter } from "./components.js"
import type { FooterControl } from "./components.js"

// Re-export for test consumers
export { SCRIPT, generateStressScript, CONTEXT_WINDOW } from "./script.js"
export type { ScriptEntry } from "./types.js"
export type { Exchange, ToolCall } from "./types.js"

export const meta: ExampleMeta = {
  name: "AI Coding Agent",
  description: "Coding agent showcase — ListView, streaming, context tracking",
  demo: true,
  features: ["ListView", "cache", "inline mode", "streaming", "OSC 8 links"],
  // TODO: Add OSC 133 marker support to ListView (km-silvery.listview-markers)
}

// ============================================================================
// AIChat — TEA state machine + ListView
// ============================================================================

export function AIChat({
  script,
  autoStart,
  fastMode,
}: {
  script: ScriptEntry[]
  autoStart: boolean
  fastMode: boolean
}) {
  const exit = useExit()
  const { rows: termRows } = useWindowSize()
  const update = useMemo(
    () => createDemoUpdate(script, fastMode, autoStart),
    [script, fastMode, autoStart],
  )
  const [state, send] = useTea(INIT_STATE, update)
  const footerControlRef = useRef<FooterControl>({ submit: () => {} })

  useEffect(() => send({ type: "mount" }), [send])
  useAutoCompact(state, send)
  useAutoExit(autoStart, state.done, exit)
  useKeyBindings(state, send, footerControlRef)

  const renderExchange = useCallback(
    (exchange: (typeof state.exchanges)[number], index: number, _meta: ListItemMeta) => {
      const isLatest = index === state.exchanges.length - 1
      return (
        <Box flexDirection="column">
          {index > 0 && <Text> </Text>}
          {state.compacting && isLatest && <CompactingOverlay />}
          {state.done && autoStart && isLatest && <SessionComplete />}
          <ExchangeItem
            exchange={exchange}
            streamPhase={state.streamPhase}
            revealFraction={state.revealFraction}
            pulse={state.pulse}
            isLatest={isLatest}
            isFirstInGroup={exchange.role !== (index > 0 ? state.exchanges[index - 1]!.role : null)}
            isLastInGroup={
              exchange.role !==
              (index < state.exchanges.length - 1 ? state.exchanges[index + 1]!.role : null)
            }
          />
        </Box>
      )
    },
    [state, autoStart],
  )

  return (
    <Box flexDirection="column" paddingX={1}>
      <ListView
        items={state.exchanges}
        getKey={(ex) => ex.id}
        height={termRows}
        estimateHeight={6}
        renderItem={renderExchange}
        scrollTo={state.exchanges.length - 1}
        cache={{
          mode: "virtual",
          isCacheable: (_ex, index) => index < state.exchanges.length - 1,
        }}
        listFooter={
          <DemoFooter
            controlRef={footerControlRef}
            onSubmit={(text) => send({ type: "submit", text })}
            streamPhase={state.streamPhase}
            done={state.done}
            compacting={state.compacting}
            exchanges={state.exchanges}
            contextBaseline={state.contextBaseline}
            ctrlDPending={state.ctrlDPending}
            nextMessage={getNextMessage(state, script, autoStart)}
            autoTypingText={
              state.autoTyping ? state.autoTyping.full.slice(0, state.autoTyping.revealed) : null
            }
          />
        }
      />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  const args = process.argv.slice(2)
  const script = args.includes("--stress") ? generateStressScript() : SCRIPT
  const mode = args.includes("--inline") ? "inline" : "fullscreen"

  using handle = await run(
    <AIChat
      script={script}
      autoStart={args.includes("--auto")}
      fastMode={args.includes("--fast")}
    />,
    { mode: mode as "inline" | "fullscreen", focusReporting: true },
  )
  await handle.waitUntilExit()
}
// ============================================================================
// Hooks
// ============================================================================

function useAutoCompact(state: DemoState, send: (msg: DemoMsg) => void) {
  useEffect(() => {
    if (state.done || state.compacting) return
    const cumulative = computeCumulativeTokens(state.exchanges)
    const effective = Math.max(0, cumulative.currentContext - state.contextBaseline)
    if (effective >= CONTEXT_WINDOW * 0.95) send({ type: "compact" })
  }, [state.exchanges, state.done, state.compacting, state.contextBaseline, send])
}

function useAutoExit(autoStart: boolean, done: boolean, exit: () => void) {
  useEffect(() => {
    if (!autoStart || !done) return
    const timer = setTimeout(exit, 1000)
    return () => clearTimeout(timer)
  }, [autoStart, done, exit])
}

function useKeyBindings(
  state: DemoState,
  send: (msg: DemoMsg) => void,
  footerControlRef: React.RefObject<FooterControl>,
) {
  const lastCtrlDRef = useRef(0)

  useInput((input: string, key: Key) => {
    if (key.escape) return "exit"
    if (key.ctrl && input === "d") {
      const now = Date.now()
      if (now - lastCtrlDRef.current < 500) return "exit"
      lastCtrlDRef.current = now
      send({ type: "setCtrlDPending", pending: true })
      return
    }
    if (lastCtrlDRef.current > 0) {
      lastCtrlDRef.current = 0
      send({ type: "setCtrlDPending", pending: false })
    }
    if (key.tab) {
      if (state.done || state.compacting) return
      footerControlRef.current.submit()
      return
    }
    if (key.ctrl && input === "l") {
      send({ type: "compact" })
    }
  })
}

// ============================================================================
// Inline UI fragments
// ============================================================================

function CompactingOverlay() {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="$warning"
      paddingX={1}
      overflow="hidden"
    >
      <Text color="$warning" bold>
        <Spinner type="arc" /> Compacting context
      </Text>
      <Text> </Text>
      <Text color="$muted">Freezing exchanges into terminal scrollback. Scroll up to review.</Text>
    </Box>
  )
}

function SessionComplete() {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$success" paddingX={1}>
      <Text color="$success" bold>
        {"✓"} Session complete
      </Text>
      <Text color="$muted">
        Scroll up to review — colors, borders, and hyperlinks preserved in scrollback.
      </Text>
    </Box>
  )
}
