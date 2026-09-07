/**
 * AI Chat — canonical Era 2 example.
 *
 * Read top-down: app → plugins (model inline) → view → types → utilities.
 * Shims (./shims/) stand in for @silvery/* packages.
 *
 * To swap demo for real LLM: replace `createDemoDriver(demo.SCRIPT)` with
 * a real AI provider (e.g. `claudeProvider(apiKey)`). Remove `withDemoScript`.
 * Everything else stays the same.
 */

import {
  pipe,
  create,
  withScope,
  withCommands,
  withTerm,
  withReact,
  extend,
  type AppBase,
  type WithCommands,
} from "./shims/app.js"
import { createScope, type Scope, type Task } from "./shims/scope.js"
import {
  signal,
  computed,
  useSignal,
  useModel,
  type WritableSignal,
  type Signal,
} from "./shims/signals.js"
import { when, type Command } from "./shims/commands.js"
import { createClock, type Clock } from "./shims/clock.js"
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type JSX,
  type ReactNode,
} from "react"
import { Box, Text, Link, Spinner, ListView, TextArea, useTerminalFocused } from "@silvery/ag-react"
import * as demo from "../../../examples/apps/aichat/script.ts"

// ── React context bridge ────────────────────────────────────────────────
// The chat model is provided via context at the top of the React tree —
// no module-level state. Production wiring pattern per app-composition.md:
// `<ChatContext.Provider value={app.chat}>`. This keeps the model scoped
// to the React subtree and lets the headless app tests skip React entirely.

const ChatContext = createContext<ChatModel | null>(null)

export function ChatProvider({
  chat,
  children,
}: {
  chat: ChatModel
  children: ReactNode
}): JSX.Element {
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>
}

function useChat<U>(selector: (m: ChatModel) => U): U {
  const chat = useContext(ChatContext)
  if (!chat) {
    throw new Error(
      "useChat() called outside <ChatProvider>. Wrap the view in <ChatProvider chat={app.chat}>.",
    )
  }
  return useModel(chat, selector)
}

/** Escape hatch for imperative access (e.g. input onChange handlers). */
function useChatModel(): ChatModel {
  const chat = useContext(ChatContext)
  if (!chat) {
    throw new Error(
      "useChatModel() called outside <ChatProvider>. Wrap the view in <ChatProvider chat={app.chat}>.",
    )
  }
  return chat
}

// ============================================================================
// App
// ============================================================================

async function main() {
  using scope = createScope()
  const demoDriver = createDemoDriver(demo.SCRIPT)

  // Create the model up-front so we can pass the same reference to
  // withChat (which wires it into app.chat + commands) AND to the
  // <ChatProvider> that exposes it to the React tree. `onExit` uses
  // a late-bound handle — app.quit() isn't defined until pipe() finishes.
  let quit = () => {}
  const chat = createChatModel({
    ai: demoDriver,
    scope,
    clock: createClock(scope),
    onExit: () => quit(),
  })

  using app = pipe(
    create(),
    withScope(scope),
    withCommands(),
    withTerm({ mode: "inline" }),
    withChat({ chat }),
    withKeymap(),
    withDemoScript(demoDriver),
    withReact({
      view: (
        <ChatProvider chat={chat}>
          <ChatView />
        </ChatProvider>
      ),
    }),
  )
  quit = () => app.quit()

  await app.run()
}

if (import.meta.main) {
  main().catch(console.error)
}

// ============================================================================
// Plugins
// ============================================================================

/**
 * Pure chat model factory — no app, no React, no rendering.
 *
 * Read top-down: signals, derived, mutation helpers, public interface.
 * Testable in isolation: `const chat = createChatModel({ ai, scope, clock, onExit })`
 */
export function createChatModel({
  ai,
  scope,
  clock,
  onExit,
}: {
  ai: AIProvider
  scope: Scope
  clock: Clock
  onExit: () => void
}): ChatModel {
  let nextId = 1
  let activeTask: Task | null = null

  // ── Signals ───────────────────────────────────────────────────

  const messages = signal<ChatMessage[]>([systemMessage(INTRO_TEXT())])
  const isDone = signal(false)
  const draft = signal("")
  const placeholder = computed(() => ai.suggestInput?.(messages()) || "Type a message...")
  const isBlank = computed(() => !draft().trim())

  // ── Derived ───────────────────────────────────────────────────

  const tokenUsage = computed(() => {
    let input = 0,
      output = 0,
      maxInputTokens = 0
    for (const msg of messages()) {
      const t = "tokens" in msg ? msg.tokens : undefined
      if (t) {
        input += t.input
        output += t.output
        if (t.input > maxInputTokens) maxInputTokens = t.input
      }
    }
    return { input, output, maxInputTokens }
  })

  const isStreaming = computed(() => {
    const last = messages().at(-1)
    return !!(last && "delivery" in last && last.delivery)
  })
  const isCompacting = computed(() => messages().some((m) => m.role === "system" && m.delivery))
  const isBusy = computed(() => isCompacting() || isStreaming())

  // ── Mutation helpers ──────────────────────────────────────────

  function appendMessage(
    entry: Record<string, unknown> & { role: string; content: string },
  ): number {
    const id = nextId++
    const tokens =
      entry.role === "system" ? undefined : (entry.tokens ?? estimateTokens(entry.content))
    messages([...messages(), { ...entry, id, tokens } as ChatMessage])
    return id
  }

  function updateMessage(id: number, updates: Partial<ChatMessage>) {
    const msgs = [...messages()]
    const idx = msgs.findIndex((x) => x.id === id)
    if (idx >= 0) msgs[idx] = { ...msgs[idx]!, ...updates }
    messages(msgs)
  }

  function removeMessage(id: number) {
    messages(messages().filter((m) => m.id !== id))
  }

  /** Spawns a child task that streams AI chunks into an agent message. */
  function generateReply() {
    activeTask?.cancel()
    activeTask = scope.spawn(async (taskScope) => {
      const delivery = createDelivery("streaming")
      const toolRuns: ToolRun[] = []
      let thinking: string | undefined
      let tokens: TokenUsage | undefined
      const id = appendMessage({ role: "agent", content: "", delivery })
      let hasContent = false

      for await (const chunk of ai.generateResponse(messages())) {
        if (taskScope.cancelled) break
        switch (chunk.type) {
          case "thinking":
            thinking = chunk.text
            delivery.stage("thinking")
            updateMessage(id, { thinking })
            hasContent = true
            break
          case "text-delta":
            delivery.stage("streaming")
            delivery.visibleText(delivery.visibleText() + chunk.text)
            hasContent = true
            break
          case "tool-result": {
            const { tool, args, output } = chunk
            toolRuns.push({ tool, args, output })
            delivery.stage("revealing-tools")
            delivery.revealedTools(toolRuns.length)
            updateMessage(id, { toolRuns: [...toolRuns] })
            hasContent = true
            break
          }
          case "done":
            tokens = chunk.tokens
            break
        }
      }

      // Clean up: remove blank placeholder if aborted before any content
      if (taskScope.cancelled && !hasContent) {
        removeMessage(id)
      } else {
        updateMessage(id, { content: delivery.visibleText() || "", tokens, delivery: undefined })
      }
    })
  }

  // ── Public interface ──────────────────────────────────────────

  return {
    messages,
    isDone,
    input: { draft, placeholder, isBlank },
    tokenUsage,
    isBusy,
    isStreaming,
    isCompacting,

    submit(content: string) {
      if (!content.trim() || isDone()) return
      draft("")
      appendMessage({ role: "user", content })
      generateReply()
    },

    cancel() {
      activeTask?.cancel()
      activeTask = null
    },

    async compact() {
      const compactedAmount = tokenUsage().maxInputTokens
      const id = appendMessage({
        role: "system",
        content: "Compacting context...",
        compactedAmount,
        delivery: createDelivery("compacting"),
      })
      await clock.sleep(3000)
      if (clock.cancelled) return
      updateMessage(id, {
        content: `Context compacted (${formatTokens(compactedAmount)} tokens frozen).`,
        delivery: undefined,
      })
    },

    exit() {
      isDone(true)
      onExit()
    },
  }
}

/**
 * Domain plugin: wires a pre-built chat model + commands into the app.
 *
 * The model is created outside the plugin (in main() / tests) so the same
 * reference can be passed to <ChatProvider> for the React tree. This also
 * lets headless tests build the model with a fake clock/scope and then
 * compose the rest of the app around it.
 *
 * Legacy overload: `withChat({ ai })` still works — it creates the model
 * internally. New code should pass `{ chat }` directly.
 */
export function withChat(options: { chat: ChatModel } | { ai: AIProvider }) {
  return <A extends AppBase & { scope: Scope } & WithCommands>(app: A) => {
    const chat =
      "chat" in options
        ? options.chat
        : createChatModel({
            ai: options.ai,
            scope: app.scope,
            clock: createClock(app.scope),
            onExit: () => app.quit(),
          })

    const chatCommands = {
      submit: { fn: ({ content }: { content: string }) => chat.submit(content) },
      compact: { fn: () => chat.compact() },
      exit: { fn: () => chat.exit() },
    } satisfies ChatCommandSet
    app.commands.chat = chatCommands

    return extend(app, {
      chat,
      commands: app.commands as A["commands"] & WithChatCommands["commands"],
    })
  }
}

interface ChatCommandSet {
  submit: Command
  compact: Command
  exit: Command
}

interface WithChatCommands {
  commands: { chat: ChatCommandSet }
}

/**
 * Drives a scripted demo conversation.
 *
 * The demo driver owns the script cursor and serves as both AI provider (agent
 * responses) and user-side driver (placeholder hints, idle auto-submit).
 *
 * On startup: submits the AI's suggested input (first scripted user message).
 * After each submit: advances the script cursor past agent entries.
 * After 10s idle: auto-submits the AI's suggestion (hands-free demo mode).
 * Placeholder is derived — the AI provider's suggestInput() drives it automatically.
 *
 * For real LLM: remove this plugin entirely. Users type their own messages.
 */
/** Keybindings for the chat. Separate from withChat so headless apps skip it. */
function withKeymap() {
  return <A extends WithCommands & WithChatCommands & { chat: ChatModel }>(app: A) => {
    app.keymap({
      "ctrl+l": app.commands.chat.compact,
      escape: app.commands.chat.exit,
      ...when(app.chat.input.isBlank, { "ctrl+d": app.commands.chat.exit }),
    })
    return app
  }
}

export function withDemoScript(driver: AIProvider) {
  return <A extends AppBase & { scope: Scope } & { chat: ChatModel }>(app: A) => {
    const chat = app.chat
    const clock = createClock(app.scope)
    let cancelIdleTimer = () => {}

    // Wrap submit: arm idle timer after each user message.
    // Prototype shortcut — production: command middleware or domain events.
    const _submit = chat.submit
    chat.submit = (...args) => {
      _submit(...args)
      armIdleTimer()
    }

    // Play the first script entry on startup
    const content = chat.input.placeholder()
    if (content) chat.submit(content)
    armIdleTimer()

    return app

    function armIdleTimer() {
      cancelIdleTimer()
      if (chat.isDone()) return
      const content = driver.suggestInput?.(chat.messages()) ?? ""
      if (content) {
        cancelIdleTimer = clock.timeout(10_000, () => {
          chat.submit(content)
        })
      }
    }
  }
}

// ============================================================================
// Demo Driver — fake LLM + script cursor (one object, one cursor)
// ============================================================================

/**
 * Creates a demo AI provider from a scripted conversation.
 *
 * The script alternates user/agent messages. The driver tracks position
 * with a single cursor. Satisfies AIProvider for agent responses and
 * suggestInput for placeholder hints.
 *
 * When the script is exhausted, falls back to random canned responses.
 */
function createDemoDriver(entries: ScriptEntry[]): AIProvider {
  let cursor = 0

  return {
    async *generateResponse(_messages) {
      // Find next agent entry
      while (cursor < entries.length && entries[cursor]!.role === "user") cursor++
      const entry =
        cursor < entries.length
          ? entries[cursor++]!
          : demo.RANDOM_AGENT_RESPONSES[
              Math.floor(Math.random() * demo.RANDOM_AGENT_RESPONSES.length)
            ]!

      const { content, thinking, toolCalls, tokens } = entry
      if (thinking) yield { type: "thinking", text: thinking }
      for (const word of content.split(/(\s+)/)) yield { type: "text-delta", text: word }
      for (const { tool, args, output } of toolCalls ?? []) {
        yield { type: "tool-result", tool, args, output }
      }
      yield { type: "done", tokens }
    },

    suggestInput(_messages: ChatMessage[]) {
      const entry = entries[cursor]
      return entry?.role === "user" ? entry.content : ""
    },
  }
}

// ============================================================================
// View
// ============================================================================

function ChatView(): JSX.Element {
  const messages = useChat((m) => m.messages())

  return (
    <Box flexDirection="column" paddingX={1}>
      <ListView
        items={messages}
        getKey={(msg: ChatMessage) => msg.id}
        height={40}
        estimateHeight={3}
        renderItem={(message: ChatMessage, index: number) => (
          <Box flexDirection="column">
            {index > 0 && <Text> </Text>}
            <MessageItem message={message} />
          </Box>
        )}
        listFooter={<InputFooter />}
      />
    </Box>
  )
}

function InputFooter(): JSX.Element {
  const terminalFocused = useTerminalFocused()
  const chat = useChatModel()
  const isDone = useChat((m) => m.isDone())
  const draft = useChat((m) => m.input.draft())
  const placeholder = useChat((m) => m.input.placeholder())
  const elapsed = useElapsed()

  return (
    <Box flexDirection="column" width="100%">
      <Text> </Text>
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={!isDone && terminalFocused ? "$border-focus" : "$border-default"}
        paddingX={1}
      >
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1} flexGrow={1}>
          <TextArea
            value={draft}
            onChange={(text: string) => chat.input.draft(text)}
            onSubmit={(text: string) => {
              const msg = text.trim() || placeholder
              if (msg) {
                chat.submit(msg)
                chat.input.draft("")
              }
            }}
            submitKey="enter"
            fieldSizing="fixed"
            rows={1}
            placeholder={!terminalFocused ? "Click to focus" : placeholder}
            isActive={!isDone && terminalFocused}
          />
        </Box>
      </Box>
      <Box paddingX={2} width="100%">
        <StatusBar elapsed={elapsed} />
      </Box>
    </Box>
  )
}

function MessageItem({ message }: { message: ChatMessage }): JSX.Element {
  if (message.role === "system") {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Text bold>AI Chat</Text>
        <Text> </Text>
        <Text color="$fg-muted">{message.content}</Text>
        <Text> </Text>
      </Box>
    )
  }

  if (message.role === "user") {
    return (
      <Box paddingX={1} flexDirection="row" backgroundColor="$bg-surface-raised">
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1}>
          <Text>{message.content}</Text>
        </Box>
      </Box>
    )
  }

  // Agent messages split by delivery state to avoid conditional hooks
  return message.delivery ? (
    <StreamingAgentMessage message={message} />
  ) : (
    <SettledAgentMessage message={message} />
  )
}

/** Agent message being delivered — hooks always called. */
function StreamingAgentMessage({ message }: { message: AgentMessage }): JSX.Element {
  const delivery = message.delivery!
  const stage = useSignal(delivery.stage)
  const visibleText = useSignal(delivery.visibleText)
  const revealedTools = useSignal(delivery.revealedTools)
  const pulse = usePulse()

  const toolRuns = message.toolRuns ?? []
  const hasOps = toolRuns.length > 0 || !!message.thinking

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color={hasOps && pulse ? "$fg-success" : "$fg-muted"}>
          {"●"}
        </Text>
        {stage === "thinking" ? (
          <Text color="$fg-muted" italic>
            {" "}
            <Spinner type="dots" /> thinking
          </Text>
        ) : null}
      </Text>
      <Box flexDirection="column" {...agentBorderProps}>
        {message.thinking && (stage === "thinking" || stage === "streaming") && (
          <ThinkingBlock text={message.thinking} done={stage !== "thinking"} />
        )}
        {visibleText && (
          <Text>
            {visibleText}
            <Text color="$fg-accent">{"▌"}</Text>
          </Text>
        )}
        {stage === "revealing-tools" && revealedTools > 0 && (
          <Box flexDirection="column">
            {toolRuns.slice(0, revealedTools).map((run, i) => (
              <ToolRunBlock key={i} run={run} done={i < revealedTools - 1} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

/** Agent message that's fully delivered — no delivery signals. */
function SettledAgentMessage({ message }: { message: AgentMessage }): JSX.Element {
  const toolRuns = message.toolRuns ?? []
  const hasOps = toolRuns.length > 0 || !!message.thinking

  const metaParts: string[] = []
  if (message.tokens) metaParts.push(`${formatTokens(message.tokens.output)} tokens`)
  if (message.thinking) metaParts.push("thought for 1s")
  const metaStr = metaParts.length > 0 ? ` (${metaParts.join(" · ")})` : ""
  const { title, body } = splitTitleBody(message.content)
  const contentText = title ? body || message.content : message.content

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color={hasOps ? "$fg-success" : "$fg-muted"}>
          {"●"}
        </Text>
        {title && <Text> {title}</Text>}
        <Text color="$fg-muted">{metaStr}</Text>
      </Text>
      <Box flexDirection="column" {...agentBorderProps}>
        {message.thinking && <ThinkingBlock text={message.thinking} done />}
        {contentText && <Text>{contentText}</Text>}
        {toolRuns.length > 0 && (
          <Box flexDirection="column">
            {toolRuns.map((run, i) => (
              <ToolRunBlock key={i} run={run} done />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

const agentBorderProps = {
  borderStyle: "bold" as const,
  borderColor: "$border-default",
  borderLeft: true,
  borderRight: false,
  borderTop: false,
  borderBottom: false,
  paddingLeft: 1,
}

// ── View sub-components ─────────────────────────────────────────

function StatusBar({ elapsed }: { elapsed: number }): JSX.Element {
  const usage = useChat((m) => m.tokenUsage())
  const isCompacting = useChat((m) => m.isCompacting())
  const messages = useChat((m) => m.messages())

  const compacted = messages.reduce(
    (sum, m) => sum + (m.role === "system" && m.compactedAmount ? m.compactedAmount : 0),
    0,
  )
  const cost = formatCost(usage)
  const elapsedStr = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`
  const effectiveContext = Math.max(0, usage.maxInputTokens - compacted)
  const ctxPct = Math.round((effectiveContext / demo.CONTEXT_WINDOW) * 100)
  const ctxFilled = Math.round(Math.min(effectiveContext / demo.CONTEXT_WINDOW, 1) * 20)
  const ctxColor = ctxPct > 100 ? "$fg-error" : ctxPct > 80 ? "$fg-warning" : "$fg-accent"

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text color="$fg-muted" wrap="truncate">
        {elapsedStr}
        {"  "}
        {isCompacting ? "compacting..." : "esc quit · ctrl+d quit"}
      </Text>
      <Text color={ctxPct > 80 ? ctxColor : "$fg-muted"} wrap="truncate">
        ctx {"█".repeat(ctxFilled)}
        {"░".repeat(20 - ctxFilled)} {ctxPct}%{"  "}
        {cost}
      </Text>
    </Box>
  )
}

function ThinkingBlock({ text, done }: { text: string; done: boolean }): JSX.Element {
  if (done) {
    return (
      <Text color="$fg-muted" italic>
        {"▸ thought"}
      </Text>
    )
  }
  return (
    <Text color="$fg-muted" wrap="truncate" italic>
      {text}
    </Text>
  )
}

function ToolRunBlock({ run, done }: { run: ToolRun; done: boolean }): JSX.Element {
  const color = demo.TOOL_COLORS[run.tool] ?? "$fg-muted"
  return (
    <Box flexDirection="column">
      <Text>
        {done ? (
          <Text color="$fg-success">{"✓ "}</Text>
        ) : (
          <>
            <Spinner type="dots" />{" "}
          </>
        )}
        <Text color={color} bold>
          {run.tool}
        </Text>{" "}
        {run.tool === "Bash" || run.tool === "Grep" || run.tool === "Glob" ? (
          <Text color="$fg-muted">{run.args}</Text>
        ) : (
          <Link href={`file://${run.args}`}>{run.args}</Link>
        )}
      </Text>
      {done && (
        <Box flexDirection="column" paddingLeft={2}>
          {run.output.map((line, i) => (
            <LinkifiedLine
              key={i}
              text={line}
              color={
                line.startsWith("+")
                  ? "$fg-success"
                  : line.startsWith("-")
                    ? "$fg-error"
                    : undefined
              }
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

function LinkifiedLine({ text, color }: { text: string; color?: string }): JSX.Element {
  const parts: JSX.Element[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  demo.URL_RE.lastIndex = 0
  while ((match = demo.URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`t${lastIndex}`} color={color}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      )
    }
    parts.push(
      <Link key={`l${match.index}`} href={match[0]}>
        {match[0]}
      </Link>,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`t${lastIndex}`} color={color}>
        {text.slice(lastIndex)}
      </Text>,
    )
  }
  return parts.length > 0 ? <Text>{parts}</Text> : <Text color={color}>{text}</Text>
}

// ── View hooks (era2: scope-owned signals would replace these) ──

function usePulse(): boolean {
  const [val, setVal] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setVal((v) => !v), 400)
    return () => clearInterval(id)
  }, [])
  return val
}

function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const s = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - s) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  return elapsed
}

// ============================================================================
// Types
// ============================================================================

// ── Chat Model (the domain model added by withChat) ─────────────

export interface ChatModel {
  messages: WritableSignal<ChatMessage[]>
  isDone: WritableSignal<boolean>
  input: {
    draft: WritableSignal<string>
    placeholder: Signal<string>
    isBlank: Signal<boolean>
  }
  tokenUsage: Signal<{ input: number; output: number; maxInputTokens: number }>
  isBusy: Signal<boolean>
  isStreaming: Signal<boolean>
  isCompacting: Signal<boolean>
  submit(content: string): void
  cancel(): void
  compact(): Promise<void>
  exit(): void
}

// ── AI Provider ─────────────────────────────────────────────────

interface AIProvider {
  generateResponse(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<AgentChunk>
  /** AI-suggested next user input — shown as placeholder in the composer. */
  suggestInput?(messages: ChatMessage[]): string
}

type AgentChunk =
  | { type: "thinking"; text: string }
  | { type: "text-delta"; text: string }
  | { type: "tool-result"; tool: string; args: string; output: string[] }
  | { type: "done"; tokens?: TokenUsage }

// ── Messages (discriminated union) ──────────────────────────────

type ChatMessage = SystemMessage | UserMessage | AgentMessage

interface SystemMessage {
  id: number
  role: "system"
  content: string
  delivery?: DeliveryState
  compactedAmount?: number
}
interface UserMessage {
  id: number
  role: "user"
  content: string
  tokens?: TokenUsage
}
interface AgentMessage {
  id: number
  role: "agent"
  content: string
  thinking?: string
  toolRuns?: ToolRun[]
  tokens?: TokenUsage
  delivery?: DeliveryState
}

interface TokenUsage {
  input: number
  output: number
}

type DeliveryStage = "thinking" | "streaming" | "revealing-tools" | "compacting"
interface DeliveryState {
  stage: WritableSignal<DeliveryStage>
  visibleText: WritableSignal<string>
  revealedTools: WritableSignal<number>
}

interface ToolRun {
  tool: string
  args: string
  output: string[]
}

/** Script entries can be user or agent turns — typed loosely for demo compatibility. */
type ScriptEntry = {
  role: string
  content: string
  thinking?: string
  toolCalls?: ToolRun[]
  tokens?: TokenUsage
}

// ============================================================================
// Utilities
// ============================================================================

function systemMessage(content: string): SystemMessage {
  return { id: 0, role: "system", content }
}

function estimateTokens(content: string): TokenUsage {
  return { input: Math.ceil(content.length / 4), output: 0 }
}

function createDelivery(stage: DeliveryStage): DeliveryState {
  return { stage: signal(stage), visibleText: signal(""), revealedTools: signal(0) }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatCost({ input, output }: TokenUsage): string {
  const cost = (input * demo.INPUT_COST_PER_M + output * demo.OUTPUT_COST_PER_M) / 1_000_000
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`
}

function splitTitleBody(content: string): { title: string; body: string } {
  const match = content.match(/^(.+?[.!?])\s+(.+)$/s)
  if (match && match[1]!.length <= 40) return { title: match[1]!, body: match[2]! }
  if (content.length <= 40) return { title: content, body: "" }
  return { title: "", body: content }
}

function INTRO_TEXT() {
  return [
    "AI Chat v2 — Era 2 API prototype:",
    " • @silvery/signals — callable accessor: count() read, count(5) write",
    " • @silvery/commands — { fn } state-agnostic, when(() => bool), keymap()",
    " • @silvery/create — pipe(), with*() composition, domain plugins",
    " • @silvery/scope — structured concurrency for timers and lifecycle",
    " • useModel() — generic React bridge for any model with signals",
  ].join("\n")
}
