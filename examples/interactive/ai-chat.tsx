/**
 * AI Chat — Coding Agent Showcase
 *
 * Demonstrates silvery's ScrollbackList component for building apps where
 * completed items freeze into real terminal scrollback:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Feature                          │ Claude Code │ silvery Showcase          │
 * ├──────────────────────────────────┼─────────────┼────────────────────────┤
 * │ Rich scrollback (colors/borders) │ ✗ plain     │ ✓ full JSX → ANSI     │
 * │ Clickable links in scrollback    │ partial     │ ✓ OSC 8 hyperlinks    │
 * │ Prompt navigation (Cmd+↑/↓)     │ ✗           │ ✓ OSC 133 markers     │
 * │ Streaming text                   │ ✓           │ ✓ word-by-word        │
 * │ Context visualization            │ ✗           │ ✓ live context bar    │
 * │ Token/cost tracking              │ ✓           │ ✓ per-exchange + sum  │
 * │ Thinking blocks                  │ ✓           │ ✓ with spinner        │
 * │ Tool call lifecycle              │ basic       │ ✓ spinner→output→✓    │
 * │ Auto-compact on resize           │ ✗           │ ✓                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Key APIs demonstrated:
 *   - ScrollbackList — declarative list with automatic scrollback management
 *   - useScrollbackItem — imperative freeze() from within list items
 *   - isFrozen prop — data-driven freezing for items marked as complete
 *   - OSC 133 markers — terminal prompt navigation via markers prop
 *
 * Controls:
 *   Enter - Fast-complete agent action / submit user message
 *   Tab   - Toggle auto-advance mode
 *   Esc   - Quit
 *   ^L    - Clear + scroll (compact)
 *
 * Flags:
 *   --auto    Start in auto-advance mode
 *   --fast    Skip streaming delays (instant reveal)
 *   --stress  Generate 200 exchanges instead of scripted content
 */

import React, { useEffect, useRef, useMemo } from "react"
import { Box, Text, Spinner, ScrollbackList, useTea } from "silvery"
import { run, useInput, useExit, type Key } from "@silvery/term/runtime"
import type { ExampleMeta } from "../_banner.js"
import type { ScriptEntry } from "./scrollback/types.js"
import { SCRIPT, generateStressScript, CONTEXT_WINDOW } from "./scrollback/script.js"
import { INIT_STATE, createDemoUpdate, computeCumulativeTokens, getNextMessage } from "./scrollback/state.js"
import { ExchangeItem, DemoFooter } from "./scrollback/components.js"
import type { FooterControl } from "./scrollback/components.js"

// Re-export for test consumers
export { SCRIPT, generateStressScript, CONTEXT_WINDOW } from "./scrollback/script.js"
export type { ScriptEntry } from "./scrollback/types.js"
export type { Exchange, ToolCall } from "./scrollback/types.js"

export const meta: ExampleMeta = {
  name: "AI Coding Agent",
  description: "Coding agent showcase — ScrollbackList, streaming, context tracking",
  features: [
    "ScrollbackList",
    "useScrollbackItem()",
    "isFrozen",
    "inline mode",
    "streaming",
    "OSC 8 links",
    "OSC 133 markers",
    "context tracking",
  ],
}

// ============================================================================
// Main App — TEA-driven with ScrollbackList
// ============================================================================

export function CodingAgent({
  script,
  autoStart,
  fastMode,
}: {
  script: ScriptEntry[]
  autoStart: boolean
  fastMode: boolean
}): JSX.Element {
  const exit = useExit()
  const update = useMemo(() => createDemoUpdate(script, fastMode, autoStart), [script, fastMode, autoStart])
  const [state, send] = useTea(INIT_STATE, update)

  useEffect(() => {
    send({ type: "mount" })
  }, [send])

  // Auto-compact when context reaches 95%
  useEffect(() => {
    if (state.done || state.compacting) return
    const active = state.exchanges.filter((ex) => !ex.frozen)
    const cumulative = computeCumulativeTokens(active)
    const effective = Math.max(0, cumulative.currentContext - state.contextBaseline)
    if (effective >= CONTEXT_WINDOW * 0.95) send({ type: "compact" })
  }, [state.exchanges, state.done, state.compacting, state.contextBaseline, send])

  // Auto-exit in auto mode
  useEffect(() => {
    if (!autoStart || !state.done) return
    const timer = setTimeout(exit, 1000)
    return () => clearTimeout(timer)
  }, [autoStart, state.done, exit])

  const lastCtrlDRef = useRef(0)
  const footerControlRef = useRef<FooterControl>({ submit: () => {} })

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
      return
    }
  })

  const frozenCount = state.exchanges.filter((ex) => ex.frozen).length
  const nextMessage = getNextMessage(state, script, autoStart)

  return (
    <Box flexDirection="column" paddingX={1}>
      {frozenCount === 0 && (
        <Box flexDirection="column">
          <Text> </Text>
          <Text bold>AI Chat</Text>
          <Text> </Text>
          <Text>Coding agent simulation showcasing ScrollbackList:</Text>
          <Text> {"•"} ScrollbackList — declarative list with automatic scrollback</Text>
          <Text> {"•"} useScrollbackItem() — imperative freeze() from within items</Text>
          <Text> {"•"} isFrozen prop — data-driven freezing for completed items</Text>
          <Text> {"•"} OSC 8 hyperlinks — clickable file paths and URLs</Text>
          <Text>
            {" "}
            {"•"} OSC 133 markers — Cmd+{"↑"}/{"↓"} to jump between exchanges
          </Text>
          <Text> {"•"} $token theme colors — semantic color tokens</Text>
          <Text> </Text>
        </Box>
      )}

      <ScrollbackList
        items={state.exchanges}
        keyExtractor={(ex) => ex.id}
        isFrozen={(ex) => ex.frozen}
        markers={true}
        footer={
          <DemoFooter
            controlRef={footerControlRef}
            onSubmit={(text) => send({ type: "submit", text })}
            streamPhase={state.streamPhase}
            done={state.done}
            compacting={state.compacting}
            exchanges={state.exchanges}
            frozenCount={frozenCount}
            contextBaseline={state.contextBaseline}
            ctrlDPending={state.ctrlDPending}
            nextMessage={nextMessage}
            autoTypingText={state.autoTyping ? state.autoTyping.full.slice(0, state.autoTyping.revealed) : null}
          />
        }
      >
        {(exchange, index) => {
          const isLatest = index === state.exchanges.length - 1
          const prevRole = index > 0 ? state.exchanges[index - 1]!.role : null
          const nextRole = index < state.exchanges.length - 1 ? state.exchanges[index + 1]!.role : null

          return (
            <Box flexDirection="column">
              {index > 0 && <Text> </Text>}

              {state.compacting && isLatest && (
                <Box flexDirection="column" borderStyle="round" borderColor="$warning" paddingX={1} overflow="hidden">
                  <Text color="$warning" bold>
                    <Spinner type="arc" /> Compacting context
                  </Text>
                  <Text> </Text>
                  <Text color="$muted">Freezing exchanges into terminal scrollback. Scroll up to review.</Text>
                </Box>
              )}

              {state.done && autoStart && isLatest && (
                <Box flexDirection="column" borderStyle="round" borderColor="$success" paddingX={1}>
                  <Text color="$success" bold>
                    {"✓"} Session complete
                  </Text>
                  <Text color="$muted">
                    Scroll up to review — colors, borders, and hyperlinks preserved in scrollback.
                  </Text>
                </Box>
              )}

              <ExchangeItem
                exchange={exchange}
                streamPhase={state.streamPhase}
                revealFraction={state.revealFraction}
                pulse={state.pulse}
                isLatest={isLatest}
                isFirstInGroup={exchange.role !== prevRole}
                isLastInGroup={exchange.role !== nextRole}
              />
            </Box>
          )
        }}
      </ScrollbackList>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  const args = process.argv.slice(2)
  const isStress = args.includes("--stress")
  const isAuto = args.includes("--auto")
  const isFast = args.includes("--fast")

  const script = isStress ? generateStressScript() : SCRIPT

  const mode = args.includes("--fullscreen") ? "fullscreen" : "inline"
  using handle = await run(<CodingAgent script={script} autoStart={isAuto} fastMode={isFast} />, {
    mode: mode as "inline" | "fullscreen",
    focusReporting: true,
  })
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
