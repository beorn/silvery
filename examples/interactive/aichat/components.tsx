/**
 * UI components for the AI coding agent demo.
 *
 * Components: ExchangeItem, StatusBar, DemoFooter (public)
 * Internal: LinkifiedLine, ThinkingBlock, ToolCallBlock, StreamingText
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Box, Text, Link, Spinner, TextInput, useTerminalFocused } from "silvery"
import type { Exchange, ToolCall } from "./types.js"
import { TOOL_COLORS, URL_RE, RANDOM_USER_COMMANDS, CONTEXT_WINDOW } from "./script.js"
import type { StreamPhase } from "./state.js"
import { formatTokens, formatCost, computeCumulativeTokens } from "./state.js"

// ============================================================================
// Footer Control — simplified interface for parent to trigger submit
// ============================================================================

export interface FooterControl {
  submit: () => void
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Split content into a short title (first sentence) and the remaining body.
 * Title must be ≤40 chars to fit on the header line with metadata. */
function splitTitleBody(content: string): { title: string; body: string } {
  const match = content.match(/^(.+?[.!?])\s+(.+)$/s)
  if (match && match[1]!.length <= 40) return { title: match[1]!, body: match[2]! }
  // No sentence break or sentence too long — short content goes entirely to title
  if (content.length <= 40) return { title: content, body: "" }
  return { title: "", body: content }
}

// ============================================================================
// Internal Components
// ============================================================================

/** Render a line with auto-linked URLs. */
function LinkifiedLine({
  text,
  dim,
  color,
}: {
  text: string
  dim?: boolean
  color?: string
}): JSX.Element {
  const parts: JSX.Element[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`t${lastIndex}`} dim={dim} color={color}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      )
    }
    const url = match[0]
    parts.push(
      <Link key={`l${match.index}`} href={url} dim={dim}>
        {url}
      </Link>,
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`t${lastIndex}`} dim={dim} color={color}>
        {text.slice(lastIndex)}
      </Text>,
    )
  }
  if (parts.length === 0) {
    return (
      <Text dim={dim} color={color}>
        {text}
      </Text>
    )
  }
  return <Text>{parts}</Text>
}

/** Thinking block — shows thinking text preview in the body. */
function ThinkingBlock({ text, done }: { text: string; done: boolean }): JSX.Element {
  if (done)
    return (
      <Text color="$muted" italic>
        {"▸ thought"}
      </Text>
    )
  return (
    <Text color="$muted" wrap="truncate" italic>
      {text}
    </Text>
  )
}

/** Tool call with lifecycle: spinner -> output -> checkmark. */
function ToolCallBlock({
  call,
  phase,
}: {
  call: ToolCall
  phase: "pending" | "running" | "done"
}): JSX.Element {
  const color = TOOL_COLORS[call.tool] ?? "$muted"

  return (
    <Box flexDirection="column" marginTop={0}>
      <Text>
        {phase === "running" ? (
          <>
            <Spinner type="dots" />{" "}
          </>
        ) : phase === "done" ? (
          <Text color="$success">{"✓ "}</Text>
        ) : (
          <Text color="$muted">{"○ "}</Text>
        )}
        <Text color={color} bold>
          {call.tool}
        </Text>{" "}
        {call.tool === "Bash" || call.tool === "Grep" || call.tool === "Glob" ? (
          <Text color="$muted">{call.args}</Text>
        ) : (
          <Link href={`file://${call.args}`}>{call.args}</Link>
        )}
      </Text>
      {phase === "done" && (
        <Box flexDirection="column" paddingLeft={2}>
          {call.output.map((line, i) => {
            if (line.startsWith("+")) return <LinkifiedLine key={i} text={line} color="$success" />
            if (line.startsWith("-")) return <LinkifiedLine key={i} text={line} color="$error" />
            return <LinkifiedLine key={i} text={line} />
          })}
        </Box>
      )}
    </Box>
  )
}

/** Streaming text — reveals content word by word. */
function StreamingText({
  fullText,
  revealFraction,
  showCursor,
}: {
  fullText: string
  revealFraction: number
  showCursor: boolean
}): JSX.Element {
  if (revealFraction >= 1) {
    return <Text>{fullText}</Text>
  }

  const words = fullText.split(/(\s+)/)
  const totalWords = words.filter((w) => w.trim()).length
  const revealWords = Math.ceil(totalWords * revealFraction)

  let wordCount = 0
  let revealedText = ""
  for (const word of words) {
    if (word.trim()) {
      wordCount++
      if (wordCount > revealWords) break
    }
    revealedText += word
  }

  return (
    <Text>
      {revealedText}
      {showCursor && <Text color="$primary">{"▌"}</Text>}
    </Text>
  )
}

// ============================================================================
// Exchange Item — live rendering with streaming, spinners, scrollback freeze
// ============================================================================

export function ExchangeItem({
  exchange,
  streamPhase,
  revealFraction,
  pulse,
  isLatest,
  isFirstInGroup,
  isLastInGroup,
}: {
  exchange: Exchange
  streamPhase: StreamPhase
  revealFraction: number
  pulse: boolean
  isLatest: boolean
  isFirstInGroup: boolean
  isLastInGroup: boolean
}): JSX.Element {
  if (exchange.role === "system") {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Text bold>AI Chat</Text>
        <Text> </Text>
        <Text color="$muted">{exchange.content}</Text>
        <Text> </Text>
      </Box>
    )
  }

  const isUser = exchange.role === "user"

  if (isUser) {
    return (
      <Box paddingX={1} flexDirection="row">
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1}>
          <Text backgroundColor="$muted-bg">{exchange.content}</Text>
        </Box>
      </Box>
    )
  }

  const phase = isLatest ? streamPhase : "done"
  const fraction = isLatest ? revealFraction : 1

  const toolCalls = exchange.toolCalls ?? []
  const toolRevealCount = phase === "tools" || phase === "done" ? toolCalls.length : 0
  const hasOperations = toolCalls.length > 0 || !!exchange.thinking

  // Metadata: token count + thought indicator
  const metaParts: string[] = []
  if (exchange.tokens && phase === "done")
    metaParts.push(`${formatTokens(exchange.tokens.output)} tokens`)
  if (exchange.thinking && (phase === "done" || phase === "streaming"))
    metaParts.push("thought for 1s")
  const metaStr = metaParts.length > 0 ? ` (${metaParts.join(" · ")})` : ""

  // Split content into title (first sentence) and body (rest)
  const { title, body } = splitTitleBody(exchange.content)

  const bulletColor = hasOperations ? "$success" : "$muted"
  const contentText = hasOperations ? body : exchange.content

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color={bulletColor} dimColor={hasOperations && !pulse && phase !== "done"}>
          {"●"}
        </Text>
        {phase === "thinking" ? (
          <Text color="$muted" italic>
            {" "}
            <Spinner type="dots" /> thinking
          </Text>
        ) : (
          <>
            {hasOperations && title && <Text> {title}</Text>}
            <Text color="$muted">{metaStr}</Text>
          </>
        )}
      </Text>

      <Box
        flexDirection="column"
        borderStyle="bold"
        borderColor="$border"
        borderLeft
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        paddingLeft={1}
      >
        {exchange.thinking && (phase === "thinking" || phase === "streaming") && (
          <ThinkingBlock text={exchange.thinking} done={phase !== "thinking"} />
        )}

        {(phase === "streaming" || phase === "tools" || phase === "done") && contentText && (
          <StreamingText
            fullText={contentText}
            revealFraction={phase === "streaming" ? fraction : 1}
            showCursor={phase === "streaming" && fraction < 1}
          />
        )}

        {toolRevealCount > 0 && (
          <Box flexDirection="column">
            {toolCalls.map((call, i) => (
              <ToolCallBlock
                key={i}
                call={call}
                phase={phase === "done" ? "done" : i < toolRevealCount - 1 ? "done" : "running"}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// ============================================================================
// Status Bar — single compact row
// ============================================================================

export function StatusBar({
  exchanges,
  compacting,
  done,
  elapsed,
  contextBaseline = 0,
  ctrlDPending = false,
}: {
  exchanges: Exchange[]
  compacting: boolean
  done: boolean
  elapsed: number
  contextBaseline?: number
  ctrlDPending?: boolean
}): JSX.Element {
  const cumulative = computeCumulativeTokens(exchanges)
  const cost = formatCost(cumulative.input, cumulative.output)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const elapsedStr = `${minutes}:${seconds.toString().padStart(2, "0")}`

  const CTX_W = 20
  const effectiveContext = Math.max(0, cumulative.currentContext - contextBaseline)
  const ctxFrac = effectiveContext / CONTEXT_WINDOW
  const ctxFilled = Math.round(Math.min(ctxFrac, 1) * CTX_W)
  const ctxPct = Math.round(ctxFrac * 100)
  const ctxColor = ctxPct > 100 ? "$error" : ctxPct > 80 ? "$warning" : "$primary"
  const ctxBar = "█".repeat(ctxFilled) + "░".repeat(CTX_W - ctxFilled)

  const keys = ctrlDPending ? "Ctrl-D again to exit" : compacting ? "compacting..." : "esc quit"

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text color="$muted" wrap="truncate">
        {elapsedStr}
        {"  "}
        {keys}
      </Text>
      <Text color="$muted" wrap="truncate">
        ctx <Text color={ctxColor}>{ctxBar}</Text> {ctxPct}%{"  "}
        {cost}
      </Text>
    </Box>
  )
}

// ============================================================================
// Footer — owns inputText state so typing doesn't re-render the parent
// ============================================================================

const AUTO_SUBMIT_DELAY = 10_000

export function DemoFooter({
  controlRef,
  onSubmit,
  streamPhase,
  done,
  compacting,
  exchanges,
  contextBaseline = 0,
  ctrlDPending = false,
  nextMessage = "",
  autoTypingText = null,
}: {
  controlRef: React.RefObject<FooterControl>
  onSubmit: (text: string) => void
  streamPhase: StreamPhase
  done: boolean
  compacting: boolean
  exchanges: Exchange[]
  contextBaseline?: number
  ctrlDPending?: boolean
  nextMessage?: string
  autoTypingText?: string | null
}): JSX.Element {
  const terminalFocused = useTerminalFocused()
  const [inputText, setInputText] = useState("")
  const inputTextRef = useRef(inputText)
  inputTextRef.current = inputText

  const startRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      1000,
    )
    return () => clearInterval(timer)
  }, [])

  const [randomIdx, setRandomIdx] = useState(() =>
    Math.floor(Math.random() * RANDOM_USER_COMMANDS.length),
  )
  const randomPlaceholder = RANDOM_USER_COMMANDS[randomIdx % RANDOM_USER_COMMANDS.length]!
  const effectiveMessage = nextMessage || randomPlaceholder
  const placeholder = !terminalFocused
    ? "Click to focus"
    : ctrlDPending
      ? "Press Ctrl-D again to exit"
      : effectiveMessage

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim() && effectiveMessage) {
        onSubmit(effectiveMessage)
      } else {
        onSubmit(text)
      }
      setInputText("")
      setRandomIdx((i) => i + 1)
    },
    [onSubmit, effectiveMessage],
  )

  // Expose submit() to parent — replaces the old getText/setText/getPlaceholder pattern
  controlRef.current = {
    submit: () => handleSubmit(inputTextRef.current),
  }

  // Auto-submit: if idle for AUTO_SUBMIT_DELAY, submit the placeholder message
  const autoSubmitRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (autoSubmitRef.current) clearTimeout(autoSubmitRef.current)
    if (
      done ||
      compacting ||
      streamPhase !== "done" ||
      !effectiveMessage ||
      inputText ||
      autoTypingText ||
      !terminalFocused
    )
      return
    autoSubmitRef.current = setTimeout(() => onSubmit(effectiveMessage), AUTO_SUBMIT_DELAY)
    return () => {
      if (autoSubmitRef.current) clearTimeout(autoSubmitRef.current)
    }
  }, [done, compacting, streamPhase, effectiveMessage, inputText, autoTypingText, onSubmit])

  const displayText = autoTypingText ?? inputText

  return (
    <Box flexDirection="column" width="100%">
      <Text> </Text>
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={!done && terminalFocused ? "$focusborder" : "$inputborder"}
        paddingX={1}
      >
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1} flexGrow={1}>
          <TextInput
            value={displayText}
            onChange={autoTypingText ? () => {} : setInputText}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            isActive={!done && !autoTypingText && terminalFocused}
          />
        </Box>
      </Box>
      <Box paddingX={2} width="100%">
        <StatusBar
          exchanges={exchanges}
          compacting={compacting}
          done={done}
          elapsed={elapsed}
          contextBaseline={contextBaseline}
          ctrlDPending={ctrlDPending}
        />
      </Box>
    </Box>
  )
}
