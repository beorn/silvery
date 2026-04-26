/**
 * TEA state machine for the AI coding agent demo.
 *
 * Pure (state, msg) → [state, effects] — all side effects are timer-based.
 * The update function is created via factory to close over script/mode config.
 */

import { fx } from "silvery"
import type { TeaResult, TimerEffect } from "silvery"
import type { Exchange, ScriptEntry } from "./types.js"
import {
  RANDOM_AGENT_RESPONSES,
  INPUT_COST_PER_M,
  OUTPUT_COST_PER_M,
  CONTEXT_WINDOW,
} from "./script.js"

// ============================================================================
// Types
// ============================================================================

/** Streaming phases: thinking -> streaming text -> tool calls -> done */
export type StreamPhase = "thinking" | "streaming" | "tools" | "done"

export type DemoState = {
  exchanges: Exchange[]
  scriptIdx: number
  streamPhase: StreamPhase
  revealFraction: number
  done: boolean
  compacting: boolean
  pulse: boolean
  ctrlDPending: boolean
  contextBaseline: number
  offScript: boolean
  nextId: number
  autoTyping: { full: string; revealed: number } | null
}

export type DemoMsg =
  | { type: "mount" }
  | { type: "advance" }
  | { type: "endThinking" }
  | { type: "streamTick" }
  | { type: "endTools" }
  | { type: "submit"; text: string }
  | { type: "compact" }
  | { type: "compactDone" }
  | { type: "pulse" }
  | { type: "autoAdvance" }
  | { type: "typingTick" }
  | { type: "autoTypingDone" }
  | { type: "respondRandom" }
  | { type: "setCtrlDPending"; pending: boolean }

export type DemoEffect = TimerEffect<DemoMsg>
export type DemoResult = TeaResult<DemoState, DemoEffect>

// ============================================================================
// Constants
// ============================================================================

const INTRO_TEXT = [
  "Coding agent simulation showcasing ListView:",
  " • ListView — unified virtualized list with cache",
  " • Cache mode — completed exchanges cached for performance",
  " • OSC 8 hyperlinks — clickable file paths and URLs",
  " • $token theme colors — semantic color tokens",
].join("\n")

export const INIT_STATE: DemoState = {
  exchanges: [{ id: 0, role: "system", content: INTRO_TEXT }],
  scriptIdx: 0,
  streamPhase: "done",
  revealFraction: 1,
  done: false,
  compacting: false,
  pulse: false,
  ctrlDPending: false,
  contextBaseline: 0,
  offScript: false,
  nextId: 1,
  autoTyping: null,
}

// ============================================================================
// Token & Cost Utilities
// ============================================================================

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function formatCost(inputTokens: number, outputTokens: number): string {
  const cost = (inputTokens * INPUT_COST_PER_M + outputTokens * OUTPUT_COST_PER_M) / 1_000_000
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

/**
 * Compute token stats for display and compaction.
 *
 * Token values in the script are CUMULATIVE — each exchange's `input` represents
 * the total context consumed at that point. So:
 * - `currentContext`: the LAST exchange's input tokens (= current context window usage)
 * - `totalCost`: sum of all (input + output) for cost calculation (each API call costs)
 */
export function computeCumulativeTokens(exchanges: Exchange[]): {
  input: number
  output: number
  currentContext: number
} {
  let input = 0
  let output = 0
  let currentContext = 0
  for (const ex of exchanges) {
    if (ex.tokens) {
      input += ex.tokens.input
      output += ex.tokens.output
      if (ex.tokens.input > currentContext) currentContext = ex.tokens.input
    }
  }
  return { input, output, currentContext }
}

/** Next scripted user message for footer placeholder. */
export function getNextMessage(state: DemoState, script: ScriptEntry[], autoMode: boolean): string {
  if (
    autoMode ||
    state.done ||
    state.offScript ||
    state.streamPhase !== "done" ||
    state.exchanges.length === 0
  )
    return ""
  const entry = script[state.scriptIdx]
  return entry?.role === "user" ? entry.content : ""
}

// ============================================================================
// Update Factory
// ============================================================================

export function createDemoUpdate(script: ScriptEntry[], fastMode: boolean, autoMode: boolean) {
  function addExchange(state: DemoState, entry: ScriptEntry): DemoState {
    const exchange: Exchange = { ...entry, id: state.nextId }
    return { ...state, exchanges: [...state.exchanges, exchange], nextId: state.nextId + 1 }
  }

  function startStreaming(state: DemoState, entry: ScriptEntry): [DemoState, DemoEffect[]] {
    const s = addExchange(state, entry)
    if (entry.role !== "agent" || fastMode) {
      return [{ ...s, streamPhase: "done", revealFraction: 1 }, []]
    }
    if (entry.thinking) {
      return [
        { ...s, streamPhase: "thinking", revealFraction: 0 },
        [fx.delay(1200, { type: "endThinking" })],
      ]
    }
    return [
      { ...s, streamPhase: "streaming", revealFraction: 0 },
      [fx.interval(50, { type: "streamTick" }, "reveal")],
    ]
  }

  function autoAdvanceEffects(state: DemoState): DemoEffect[] {
    if (state.done || state.compacting || state.streamPhase !== "done") return []
    const next = script[state.scriptIdx]
    if (!next) return autoMode ? [fx.delay(0, { type: "autoAdvance" })] : []
    if (autoMode || next.role !== "user")
      return [fx.delay(fastMode ? 100 : 400, { type: "autoAdvance" })]
    return []
  }

  function doAdvance(state: DemoState, extraEffects: DemoEffect[] = []): DemoResult {
    if (state.done || state.compacting || state.streamPhase !== "done") return state
    if (state.scriptIdx >= script.length) {
      // End of script: wait for user input instead of ending the session.
      // Previously we set `done: true` in autoMode, which blocked further
      // interaction and showed "Session complete" — particularly painful
      // after a compaction cycle that walked past the script end.
      return state
    }

    const entry = script[state.scriptIdx]!
    let s: DemoState = {
      ...state,
      scriptIdx: state.scriptIdx + 1,
    }
    const effects = [...extraEffects]
    let streamFx: DemoEffect[]

    ;[s, streamFx] = startStreaming(s, entry)
    effects.push(...streamFx)

    if (fastMode) {
      while (s.scriptIdx < script.length && script[s.scriptIdx]!.role !== "user") {
        ;[s, streamFx] = startStreaming({ ...s, scriptIdx: s.scriptIdx + 1 }, script[s.scriptIdx]!)
        effects.push(...streamFx)
      }
      effects.push(...autoAdvanceEffects(s))
    } else if (entry.role === "user") {
      if (s.scriptIdx < script.length && script[s.scriptIdx]!.role === "agent") {
        ;[s, streamFx] = startStreaming({ ...s, scriptIdx: s.scriptIdx + 1 }, script[s.scriptIdx]!)
        effects.push(...streamFx)
      }
    }

    return [s, effects]
  }

  return function update(state: DemoState, msg: DemoMsg): DemoResult {
    switch (msg.type) {
      case "mount": {
        // In auto mode, kick off the scripted walk-through immediately.
        // In interactive mode, leave the intro exchange visible and wait
        // for user input — auto-advancing on mount buries the intro text
        // under the first scripted user message before the user sees it.
        const pulseFx = fx.interval(400, { type: "pulse" } as const, "pulse")
        if (autoMode) return doAdvance(state, [pulseFx])
        return [state, [pulseFx]]
      }

      case "advance":
      case "autoAdvance": {
        if (
          autoMode &&
          !fastMode &&
          state.streamPhase === "done" &&
          !state.done &&
          !state.compacting
        ) {
          const next = script[state.scriptIdx]
          if (next?.role === "user") {
            return [
              { ...state, autoTyping: { full: next.content, revealed: 0 } },
              [fx.interval(30, { type: "typingTick" }, "typing")],
            ]
          }
        }
        if (autoMode && state.scriptIdx >= script.length && state.streamPhase === "done") {
          // Script exhausted in auto mode: keep the demo alive with a random
          // agent response rather than freezing on "Session complete". The
          // user can still Ctrl-D out; double-Ctrl-D in useKeyBindings
          // handles true exit.
          return [{ ...state, offScript: true }, [fx.delay(1200, { type: "respondRandom" })]]
        }
        return doAdvance(state)
      }

      case "typingTick": {
        if (!state.autoTyping) return state
        const next = state.autoTyping.revealed + 1
        if (next >= state.autoTyping.full.length) {
          return [
            {
              ...state,
              autoTyping: { ...state.autoTyping, revealed: state.autoTyping.full.length },
            },
            [fx.cancel("typing"), fx.delay(300, { type: "autoTypingDone" })],
          ]
        }
        return { ...state, autoTyping: { ...state.autoTyping, revealed: next } }
      }

      case "autoTypingDone":
        return doAdvance({ ...state, autoTyping: null })

      case "endThinking":
        return [
          { ...state, streamPhase: "streaming", revealFraction: 0 },
          [fx.interval(50, { type: "streamTick" }, "reveal")],
        ]

      case "streamTick": {
        const last = state.exchanges[state.exchanges.length - 1]
        const rate = last?.thinking ? 0.08 : 0.12
        const frac = Math.min(state.revealFraction + rate, 1)
        if (frac < 1) return { ...state, revealFraction: frac }

        const tools = last?.toolCalls ?? []
        if (tools.length > 0) {
          const s = { ...state, streamPhase: "tools" as StreamPhase, revealFraction: 1 }
          return [s, [fx.cancel("reveal"), fx.delay(600 * tools.length, { type: "endTools" })]]
        }
        const s = { ...state, streamPhase: "done" as StreamPhase, revealFraction: 1 }
        return [s, [fx.cancel("reveal"), ...autoAdvanceEffects(s)]]
      }

      case "endTools": {
        const s = { ...state, streamPhase: "done" as StreamPhase }
        return [s, autoAdvanceEffects(s)]
      }

      case "submit": {
        // Fast-forward streaming if still animating. Also clear `done` —
        // any user interaction should reopen the session, so the "Session
        // complete" overlay never traps the user. Auto-exit in --auto mode
        // is driven by done=true via useAutoExit; once the user types, we
        // assume they want to keep talking.
        const fastForward = {
          streamPhase: "done" as StreamPhase,
          revealFraction: 1,
          autoTyping: null,
          done: false,
        }
        const base =
          state.streamPhase !== "done" || state.autoTyping || state.done
            ? { ...state, ...fastForward }
            : state
        const cancelEffects: DemoEffect[] =
          state.streamPhase !== "done"
            ? [fx.cancel("reveal"), fx.cancel("typing")]
            : [fx.cancel("typing")]

        // Empty submit just fast-forwards (no text to queue)
        if (!msg.text.trim()) return [base, cancelEffects]

        const s = addExchange(base, {
          role: "user",
          content: msg.text,
          tokens: { input: msg.text.length * 4, output: 0 },
        })

        if (s.scriptIdx < script.length) {
          let nextIdx = s.scriptIdx
          while (nextIdx < script.length && script[nextIdx]!.role === "user") nextIdx++
          return [
            { ...s, scriptIdx: nextIdx },
            [...cancelEffects, fx.delay(150, { type: "autoAdvance" })],
          ]
        }

        return [
          { ...s, offScript: true },
          [...cancelEffects, fx.delay(150, { type: "respondRandom" })],
        ]
      }

      case "respondRandom": {
        const resp =
          RANDOM_AGENT_RESPONSES[Math.floor(Math.random() * RANDOM_AGENT_RESPONSES.length)]!
        const [s, effects] = startStreaming(state, resp)
        return [{ ...s, offScript: true }, effects]
      }

      case "compact": {
        if (state.done || state.compacting) return state
        const cumulative = computeCumulativeTokens(state.exchanges)
        return [
          {
            ...state,
            streamPhase: "done",
            revealFraction: 1,
            compacting: true,
            contextBaseline: cumulative.currentContext,
            exchanges: state.exchanges,
            autoTyping: null,
          },
          [
            fx.cancel("reveal"),
            fx.cancel("typing"),
            fx.delay(fastMode ? 300 : 3000, { type: "compactDone" }),
          ],
        ]
      }

      case "compactDone":
        return doAdvance({ ...state, compacting: false })

      case "pulse":
        return { ...state, pulse: !state.pulse }

      case "setCtrlDPending":
        return { ...state, ctrlDPending: msg.pending }

      default:
        return state
    }
  }
}
