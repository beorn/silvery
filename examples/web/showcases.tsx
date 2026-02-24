/**
 * Browser-Ready Showcase Components for inkx Live Demos
 *
 * Interactive components rendered via renderToXterm() in xterm.js iframes
 * on the VitePress docs site. Keyboard input via emitInput() event bus.
 */

import React, { useState, useEffect, useRef } from "react"
import { Box, Text, useContentRect } from "../../src/xterm/index.js"

// ============================================================================
// Input Event Bus
// ============================================================================

interface KeyInfo {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  return: boolean
  escape: boolean
  tab: boolean
  backspace: boolean
}

type InputHandler = (input: string, key: KeyInfo) => void

const inputListeners = new Set<InputHandler>()

/** Called from showcase-app.tsx via term.onData() */
export function emitInput(data: string): void {
  const key: KeyInfo = {
    upArrow: data === "\x1b[A",
    downArrow: data === "\x1b[B",
    rightArrow: data === "\x1b[C",
    leftArrow: data === "\x1b[D",
    return: data === "\r",
    escape: data === "\x1b",
    tab: data === "\t",
    backspace: data === "\x7f" || data === "\b",
  }
  const input = data.length === 1 && data >= " " ? data : ""
  for (const cb of inputListeners) cb(input, key)
}

/** Subscribe to keyboard input */
function useInput(handler: InputHandler): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const cb: InputHandler = (i, k) => ref.current(i, k)
    inputListeners.add(cb)
    return () => {
      inputListeners.delete(cb)
    }
  }, [])
}

// ============================================================================
// 1. DashboardShowcase
// ============================================================================

function DashboardShowcase(): JSX.Element {
  const [tick, setTick] = useState(0)
  const [activePanel, setActivePanel] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1500)
    return () => clearInterval(id)
  }, [])

  useInput((_input, key) => {
    if (key.leftArrow) setActivePanel((p) => Math.max(0, p - 1))
    if (key.rightArrow) setActivePanel((p) => Math.min(2, p + 1))
  })

  const cpu = 28 + ((tick * 7) % 45)
  const mem = 52 + ((tick * 5) % 30)
  const disk = 41 + ((tick * 3) % 20)
  const net = 12 + ((tick * 9) % 65)

  const metrics = [
    { label: "CPU", value: cpu, color: cpu > 60 ? "red" : cpu > 40 ? "yellow" : "green" },
    { label: "Memory", value: mem, color: mem > 70 ? "red" : mem > 50 ? "yellow" : "green" },
    { label: "Disk", value: disk, color: disk > 60 ? "red" : disk > 40 ? "yellow" : "green" },
    { label: "Network", value: net, color: net > 60 ? "red" : net > 40 ? "yellow" : "green" },
  ]

  const barWidth = 20

  const services = [
    { name: "api-gateway", status: "up" as const, uptime: "14d 6h" },
    { name: "auth-service", status: "up" as const, uptime: "14d 6h" },
    { name: "worker-pool", status: "warn" as const, uptime: "2h 15m" },
    { name: "cache-redis", status: "up" as const, uptime: "7d 3h" },
    { name: "mail-service", status: "down" as const, uptime: "0m" },
  ]

  const statusIcon = (s: "up" | "warn" | "down") =>
    s === "up" ? "●" : s === "warn" ? "▲" : "✕"
  const statusColor = (s: "up" | "warn" | "down") =>
    s === "up" ? "green" : s === "warn" ? "yellow" : "red"

  const allEvents = [
    "[14:23:01] Deploy v2.4.1 completed",
    "[14:23:15] Auth service restarted",
    "[14:23:30] Backup job finished (12.4 GB)",
    "[14:23:45] SSL certificate renewed",
    "[14:24:01] Cache purged successfully",
    "[14:24:12] DB migration v38 applied",
    "[14:24:30] Worker pool scaled to 8",
    "[14:24:45] Health check: all green",
  ]
  const eventOffset = (tick % 4)
  const visibleEvents = allEvents.slice(eventOffset, eventOffset + 5)

  return (
    <Box flexDirection="column" padding={1}>
      {/* Top row: Metrics + Services */}
      <Box flexDirection="row" gap={1}>
        {/* Metrics panel */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor={activePanel === 0 ? "cyan" : "#444"}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color={activePanel === 0 ? "cyan" : "white"}>
              Metrics
            </Text>
          </Box>
          {metrics.map((m) => {
            const filled = Math.round((m.value / 100) * barWidth)
            const empty = barWidth - filled
            return (
              <Box key={m.label} flexDirection="row" gap={1}>
                <Box width={8}>
                  <Text>{m.label}</Text>
                </Box>
                <Text>
                  <Text color={m.color}>{"━".repeat(filled)}</Text>
                  <Text color="#444">{"─".repeat(empty)}</Text>
                </Text>
                <Text bold color={m.color}>
                  {String(m.value).padStart(3)}%
                </Text>
              </Box>
            )
          })}
        </Box>

        {/* Services panel */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor={activePanel === 1 ? "cyan" : "#444"}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color={activePanel === 1 ? "cyan" : "white"}>
              Services
            </Text>
          </Box>
          {services.map((s) => (
            <Box key={s.name} flexDirection="row" justifyContent="space-between">
              <Text>
                <Text color={statusColor(s.status)}>{statusIcon(s.status)}</Text>
                <Text> {s.name}</Text>
              </Text>
              <Text color="#999">{s.uptime}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Bottom row: Events */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={activePanel === 2 ? "cyan" : "#444"}
        paddingX={1}
        marginTop={1}
      >
        <Box marginBottom={1}>
          <Text bold color={activePanel === 2 ? "cyan" : "white"}>
            Events
          </Text>
        </Box>
        {visibleEvents.map((e, i) => (
          <Text key={i} color={i === 0 ? "white" : "#999"}>
            {e}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// 2. AIChatShowcase
// ============================================================================

interface ChatMsg {
  role: "user" | "assistant"
  text: string
  time: string
}

const CHAT_SCRIPT: ChatMsg[] = [
  {
    role: "user",
    text: "What should I build with inkx?",
    time: "14:23",
  },
  {
    role: "assistant",
    text: "Terminal dashboards, CLI wizards, kanban boards — anything you'd build with React, but for the terminal.",
    time: "14:23",
  },
  {
    role: "user",
    text: "Can it handle complex layouts?",
    time: "14:24",
  },
  {
    role: "assistant",
    text: "Absolutely. inkx uses two-phase rendering so components know their size during render. No layout thrashing, no useEffect hacks.",
    time: "14:24",
  },
]

function AIChatShowcase(): JSX.Element {
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string; time: string; done: boolean }[]
  >([])
  const [scriptIdx, setScriptIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [autoTimer, setAutoTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  // Advance to next message
  const advanceMessage = () => {
    if (scriptIdx >= CHAT_SCRIPT.length) return
    const current = CHAT_SCRIPT[scriptIdx]!
    if (messages.length <= scriptIdx || !messages[scriptIdx]) {
      // Add a new message shell
      setMessages((prev) => [...prev, { ...current, text: "", done: false }])
    }
    // If current message is done, move to next
    const msg = messages[scriptIdx]
    if (msg && msg.done) {
      setScriptIdx((i) => i + 1)
      setCharIdx(0)
    }
  }

  // Character-by-character streaming
  useEffect(() => {
    if (scriptIdx >= CHAT_SCRIPT.length) return

    const current = CHAT_SCRIPT[scriptIdx]!

    // Add message shell on first char
    if (charIdx === 0 && (messages.length <= scriptIdx || !messages[scriptIdx])) {
      setMessages((prev) => [...prev, { ...current, text: "", done: false }])
      return
    }

    if (charIdx < current.text.length) {
      const isAssistant = current.role === "assistant"
      const speed = isAssistant ? 20 : 40
      const step = isAssistant ? 2 : 1
      const id = setTimeout(() => {
        const next = Math.min(charIdx + step, current.text.length)
        setMessages((prev) => {
          const updated = [...prev]
          updated[scriptIdx] = {
            ...current,
            text: current.text.slice(0, next),
            done: next >= current.text.length,
          }
          return updated
        })
        setCharIdx(next)
      }, speed)
      return () => clearTimeout(id)
    } else {
      // Pause then advance
      const id = setTimeout(() => {
        setScriptIdx((i) => i + 1)
        setCharIdx(0)
      }, 3000)
      setAutoTimer(id)
      return () => clearTimeout(id)
    }
  }, [scriptIdx, charIdx, messages.length])

  // Enter skips to next message
  useInput((_input, key) => {
    if (key.return) {
      if (autoTimer) clearTimeout(autoTimer)
      if (scriptIdx < CHAT_SCRIPT.length) {
        const current = CHAT_SCRIPT[scriptIdx]!
        // Complete current message immediately
        setMessages((prev) => {
          const updated = [...prev]
          updated[scriptIdx] = { ...current, text: current.text, done: true }
          return updated
        })
        setCharIdx(current.text.length)
        // Move to next after a tick
        setTimeout(() => {
          setScriptIdx((i) => i + 1)
          setCharIdx(0)
        }, 100)
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" flexGrow={1} gap={1}>
        {messages.map((msg, i) => {
          const isUser = msg.role === "user"
          return (
            <Box key={i} flexDirection="column" paddingX={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold color={isUser ? "cyan" : "green"}>
                  {isUser ? "You" : "Assistant"}
                </Text>
                <Text color="#666">{msg.time}</Text>
              </Box>
              <Text wrap="wrap">
                {"  "}
                {msg.text}
                {!msg.done && <Text color="yellow"> ●</Text>}
              </Text>
            </Box>
          )
        })}
      </Box>

      <Box
        borderStyle="round"
        borderColor="#444"
        paddingX={1}
        marginTop={1}
      >
        <Text color="#666">&gt; Type a message...</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// 3. KanbanShowcase
// ============================================================================

interface KanbanCard {
  title: string
  tag: { name: string; color: string }
}

interface KanbanColumn {
  title: string
  color: string
  cards: KanbanCard[]
}

const KANBAN_DATA: KanbanColumn[] = [
  {
    title: "To Do",
    color: "red",
    cards: [
      { title: "Design landing page", tag: { name: "design", color: "yellow" } },
      { title: "Write API docs", tag: { name: "docs", color: "blue" } },
      { title: "Set up monitoring", tag: { name: "devops", color: "green" } },
    ],
  },
  {
    title: "In Progress",
    color: "yellow",
    cards: [
      { title: "User authentication", tag: { name: "backend", color: "magenta" } },
      { title: "Dashboard redesign", tag: { name: "frontend", color: "cyan" } },
      { title: "Rate limiting", tag: { name: "backend", color: "magenta" } },
    ],
  },
  {
    title: "Done",
    color: "green",
    cards: [
      { title: "Project setup", tag: { name: "devops", color: "green" } },
      { title: "CI/CD pipeline", tag: { name: "devops", color: "green" } },
      { title: "Initial wireframes", tag: { name: "design", color: "yellow" } },
    ],
  },
]

function KanbanShowcase(): JSX.Element {
  const [col, setCol] = useState(0)
  const [card, setCard] = useState(0)

  // Auto-animate: cycle through cards every 2s
  useEffect(() => {
    const id = setInterval(() => {
      setCard((c) => {
        const maxCards = KANBAN_DATA[col]?.cards.length ?? 3
        if (c + 1 >= maxCards) {
          setCol((co) => (co + 1) % 3)
          return 0
        }
        return c + 1
      })
    }, 2000)
    return () => clearInterval(id)
  }, [col])

  useInput((_input, key) => {
    if (key.leftArrow) {
      setCol((c) => Math.max(0, c - 1))
      setCard(0)
    }
    if (key.rightArrow) {
      setCol((c) => Math.min(2, c + 1))
      setCard(0)
    }
    if (key.upArrow) setCard((c) => Math.max(0, c - 1))
    if (key.downArrow) {
      const maxCards = KANBAN_DATA[col]?.cards.length ?? 3
      setCard((c) => Math.min(maxCards - 1, c + 1))
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="white">
          Kanban Board
        </Text>
        <Text color="#999"> - 9 cards across 3 columns</Text>
      </Box>

      <Box flexDirection="row" gap={1} flexGrow={1}>
        {KANBAN_DATA.map((column, colIdx) => (
          <Box
            key={column.title}
            flexDirection="column"
            flexGrow={1}
            borderStyle="single"
            borderColor={colIdx === col ? "cyan" : "#444"}
          >
            <Box paddingX={1}>
              <Text bold color={column.color}>
                {column.title}
              </Text>
              <Text color="#999"> ({column.cards.length})</Text>
            </Box>

            <Box flexDirection="column" paddingX={1} marginTop={1}>
              {column.cards.map((c, cardIdx) => {
                const isSelected = colIdx === col && cardIdx === card
                return (
                  <Box key={c.title} flexDirection="column" marginBottom={1}>
                    <Text bold={isSelected} color={isSelected ? "cyan" : "white"}>
                      {isSelected ? "▸ " : "  "}
                      {c.title}
                    </Text>
                    <Text color={c.tag.color}>
                      {"  "}#{c.tag.name}
                    </Text>
                  </Box>
                )
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// 4. CLIWizardShowcase (Clack-style)
// ============================================================================

interface WizardState {
  step: number
  cursor: number
  answers: string[]
}

const WIZARD_STEPS = [
  { label: "Project name", type: "text" as const, answer: "my-app" },
  {
    label: "Framework",
    type: "select" as const,
    options: ["Vanilla", "React", "Vue", "Svelte"],
    answer: "React",
    defaultCursor: 1,
  },
  {
    label: "TypeScript?",
    type: "select" as const,
    options: ["Yes", "No"],
    answer: "Yes",
    defaultCursor: 0,
  },
  {
    label: "Package manager",
    type: "select" as const,
    options: ["bun", "npm", "yarn", "pnpm"],
    answer: "bun",
    defaultCursor: 0,
  },
]

function CLIWizardShowcase(): JSX.Element {
  const [state, setState] = useState<WizardState>({
    step: 0,
    cursor: 0,
    answers: [],
  })
  const [done, setDone] = useState(false)

  // Auto-animate: advance step every 2.5s
  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => {
        if (s.step >= WIZARD_STEPS.length) {
          // Reset after done
          setDone(false)
          return { step: 0, cursor: 0, answers: [] }
        }
        const currentStep = WIZARD_STEPS[s.step]!
        const answer = currentStep.answer
        const newAnswers = [...s.answers, answer]
        if (s.step + 1 >= WIZARD_STEPS.length) {
          setDone(true)
          return { step: s.step + 1, cursor: 0, answers: newAnswers }
        }
        const nextStep = WIZARD_STEPS[s.step + 1]!
        const nextCursor =
          nextStep.type === "select" ? (nextStep.defaultCursor ?? 0) : 0
        return { step: s.step + 1, cursor: nextCursor, answers: newAnswers }
      })
    }, 2500)
    return () => clearInterval(id)
  }, [])

  // Interactive: arrows + enter
  useInput((_input, key) => {
    if (done) return
    const currentStep = WIZARD_STEPS[state.step]
    if (!currentStep) return

    if (currentStep.type === "select") {
      const opts = currentStep.options!
      if (key.upArrow) setState((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }))
      if (key.downArrow)
        setState((s) => ({ ...s, cursor: Math.min(opts.length - 1, s.cursor + 1) }))
    }

    if (key.return) {
      const answer =
        currentStep.type === "select"
          ? currentStep.options![state.cursor]!
          : currentStep.answer
      const newAnswers = [...state.answers, answer]
      if (state.step + 1 >= WIZARD_STEPS.length) {
        setDone(true)
        setState({ step: state.step + 1, cursor: 0, answers: newAnswers })
      } else {
        const nextStep = WIZARD_STEPS[state.step + 1]!
        const nextCursor =
          nextStep.type === "select" ? (nextStep.defaultCursor ?? 0) : 0
        setState({ step: state.step + 1, cursor: nextCursor, answers: newAnswers })
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1} paddingLeft={2}>
      <Text bold color="cyan">
        ┌  create-app
      </Text>
      <Text color="#444">│</Text>

      {WIZARD_STEPS.map((ws, i) => {
        const isDone = i < state.step
        const isActive = i === state.step && !done
        const isPending = i > state.step

        if (isDone) {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="green">◇</Text>
                <Text>  {ws.label}</Text>
              </Text>
              <Text color="#999">│  {state.answers[i]}</Text>
              <Text color="#444">│</Text>
            </React.Fragment>
          )
        }

        if (isActive && ws.type === "text") {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="cyan">◆</Text>
                <Text bold>  {ws.label}</Text>
              </Text>
              <Text>
                │  <Text color="cyan">{ws.answer}</Text>
              </Text>
              <Text color="#444">│</Text>
            </React.Fragment>
          )
        }

        if (isActive && ws.type === "select") {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="cyan">◆</Text>
                <Text bold>  {ws.label}</Text>
              </Text>
              {ws.options!.map((opt, oi) => (
                <Text key={opt}>
                  │  {oi === state.cursor ? (
                    <Text color="cyan">● {opt}</Text>
                  ) : (
                    <Text color="#999">○ {opt}</Text>
                  )}
                </Text>
              ))}
              <Text color="#444">│</Text>
            </React.Fragment>
          )
        }

        if (isPending) {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#666">○</Text>
                <Text color="#666">  {ws.label}</Text>
              </Text>
              <Text color="#444">│</Text>
            </React.Fragment>
          )
        }

        return null
      })}

      {done ? (
        <>
          <Text>
            <Text color="green">◇</Text>
            <Text color="green">  Done!</Text>
          </Text>
          <Text color="#444">│</Text>
          <Text>
            <Text color="cyan">└  </Text>
            <Text>cd my-app && bun dev</Text>
          </Text>
        </>
      ) : (
        <Text color="#444">└</Text>
      )}
    </Box>
  )
}

// ============================================================================
// 5. DataExplorerShowcase
// ============================================================================

interface ProcessRow {
  id: string
  name: string
  status: "running" | "idle" | "stopped"
  cpu: number
  mem: string
}

const PROCESS_DATA: ProcessRow[] = [
  { id: "1024", name: "web-server", status: "running", cpu: 67, mem: "128 MB" },
  { id: "1025", name: "db-primary", status: "running", cpu: 54, mem: "512 MB" },
  { id: "1026", name: "api-gateway", status: "running", cpu: 48, mem: "192 MB" },
  { id: "1027", name: "worker-pool", status: "running", cpu: 35, mem: "96 MB" },
  { id: "1028", name: "cache-redis", status: "running", cpu: 22, mem: "256 MB" },
  { id: "1029", name: "metrics", status: "running", cpu: 18, mem: "64 MB" },
  { id: "1030", name: "log-shipper", status: "idle", cpu: 4, mem: "32 MB" },
  { id: "1031", name: "cron-sched", status: "idle", cpu: 1, mem: "16 MB" },
  { id: "1032", name: "backup-agent", status: "stopped", cpu: 0, mem: "0 MB" },
  { id: "1033", name: "mail-service", status: "stopped", cpu: 0, mem: "0 MB" },
]

function DataExplorerShowcase(): JSX.Element {
  const [tick, setTick] = useState(0)
  const [selectedRow, setSelectedRow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  useInput((_input, key) => {
    if (key.upArrow) setSelectedRow((r) => Math.max(0, r - 1))
    if (key.downArrow) setSelectedRow((r) => Math.min(PROCESS_DATA.length - 1, r + 1))
  })

  // Jitter CPU values for running processes
  const rows = PROCESS_DATA.map((row) => ({
    ...row,
    cpu:
      row.status === "running"
        ? Math.max(1, Math.min(99, row.cpu + ((tick * 7 + row.cpu) % 13) - 6))
        : row.cpu,
  })).sort((a, b) => b.cpu - a.cpu)

  const statusColor = (s: string) =>
    s === "running" ? "green" : s === "idle" ? "yellow" : "red"

  const cpuColor = (v: number) => (v > 50 ? "red" : v > 20 ? "yellow" : "green")

  const colW = { id: 6, name: 15, status: 10, cpu: 6, mem: 8 }

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="row">
          <Text bold color="white">
            Process Explorer
          </Text>
          <Text color="#999"> - {rows.length} processes</Text>
        </Box>
        <Text color="#999">
          Sorted by <Text bold color="cyan">CPU ▼</Text>
        </Text>
      </Box>

      {/* Header */}
      <Box flexDirection="row" backgroundColor="#334">
        <Box width={colW.id} paddingX={1}>
          <Text bold color="white">ID</Text>
        </Box>
        <Box width={colW.name} paddingX={1}>
          <Text bold color="white">Name</Text>
        </Box>
        <Box width={colW.status} paddingX={1}>
          <Text bold color="white">Status</Text>
        </Box>
        <Box width={colW.cpu} paddingX={1}>
          <Text bold color="white">CPU%</Text>
        </Box>
        <Box width={colW.mem} paddingX={1}>
          <Text bold color="white">Mem</Text>
        </Box>
      </Box>

      {/* Rows */}
      {rows.map((row, i) => {
        const isSelected = i === selectedRow
        const bgColor = isSelected
          ? "#2a2a4e"
          : i % 2 === 1
            ? "#1e1e3e"
            : undefined
        return (
          <Box key={row.id} flexDirection="row" backgroundColor={bgColor}>
            <Box width={colW.id} paddingX={1}>
              <Text color="#999">{row.id}</Text>
            </Box>
            <Box width={colW.name} paddingX={1}>
              <Text>{row.name}</Text>
            </Box>
            <Box width={colW.status} paddingX={1}>
              <Text color={statusColor(row.status)}>{row.status}</Text>
            </Box>
            <Box width={colW.cpu} paddingX={1}>
              <Text bold color={cpuColor(row.cpu)}>
                {String(row.cpu).padStart(3)}
              </Text>
            </Box>
            <Box width={colW.mem} paddingX={1}>
              <Text>{row.mem}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

// ============================================================================
// 6. DevToolsShowcase
// ============================================================================

interface LogEntry {
  time: string
  level: "INFO" | "WARN" | "ERROR" | "DEBUG"
  message: string
}

const ALL_LOGS: LogEntry[] = [
  { time: "14:23:01", level: "INFO", message: "Server started on port 3000" },
  { time: "14:23:02", level: "INFO", message: "Database connection established" },
  { time: "14:23:05", level: "DEBUG", message: "Loading configuration from env" },
  { time: "14:23:08", level: "WARN", message: "Cache miss ratio above threshold (42%)" },
  { time: "14:23:12", level: "ERROR", message: "Failed to connect to Redis: ECONNREFUSED" },
  { time: "14:23:15", level: "INFO", message: "Retry succeeded: Redis connected" },
  { time: "14:23:18", level: "INFO", message: "Worker pool initialized (4 threads)" },
  { time: "14:23:22", level: "WARN", message: "Deprecated API v1 endpoint called" },
  { time: "14:23:25", level: "DEBUG", message: "GC pause: 12ms (minor collection)" },
  { time: "14:23:30", level: "ERROR", message: "Timeout: /api/analytics took 5200ms" },
  { time: "14:23:33", level: "INFO", message: "Health check: all services green" },
  { time: "14:23:38", level: "INFO", message: "Request processed: 200 OK (23ms)" },
]

const SEARCH_QUERIES = ["", "error", "redis", "api", "warn", ""]

function DevToolsShowcase(): JSX.Element {
  const [queryIdx, setQueryIdx] = useState(0)
  const [typedQuery, setTypedQuery] = useState("")
  const [scrollOffset, setScrollOffset] = useState(0)
  const [isAutoMode, setIsAutoMode] = useState(true)

  // Auto-animate: cycle through search queries with typing
  useEffect(() => {
    if (!isAutoMode) return
    const id = setInterval(() => {
      setQueryIdx((i) => (i + 1) % SEARCH_QUERIES.length)
      setScrollOffset(0)
    }, 3000)
    return () => clearInterval(id)
  }, [isAutoMode])

  // Typing animation for auto mode
  useEffect(() => {
    if (!isAutoMode) return
    const target = SEARCH_QUERIES[queryIdx]!
    if (target === "") {
      setTypedQuery("")
      return
    }
    let charI = 0
    setTypedQuery("")
    const id = setInterval(() => {
      charI++
      if (charI > target.length) {
        clearInterval(id)
        return
      }
      setTypedQuery(target.slice(0, charI))
    }, 80)
    return () => clearInterval(id)
  }, [queryIdx, isAutoMode])

  // Keyboard input: typing filters, arrows scroll
  useInput((input, key) => {
    if (input) {
      setIsAutoMode(false)
      setTypedQuery((q) => q + input)
      setScrollOffset(0)
    }
    if (key.backspace) {
      setIsAutoMode(false)
      setTypedQuery((q) => q.slice(0, -1))
      setScrollOffset(0)
    }
    if (key.escape) {
      setTypedQuery("")
      setScrollOffset(0)
      setIsAutoMode(true)
    }
    if (key.upArrow) setScrollOffset((o) => Math.max(0, o - 1))
    if (key.downArrow) setScrollOffset((o) => o + 1)
  })

  const query = typedQuery.toLowerCase()
  const filtered = query
    ? ALL_LOGS.filter(
        (l) =>
          l.message.toLowerCase().includes(query) ||
          l.level.toLowerCase().includes(query),
      )
    : ALL_LOGS

  // Clamp scroll offset
  const maxVisible = 10
  const maxOffset = Math.max(0, filtered.length - maxVisible)
  const clampedOffset = Math.min(scrollOffset, maxOffset)
  const visibleLogs = filtered.slice(clampedOffset, clampedOffset + maxVisible)

  const levelColor = (level: string) => {
    switch (level) {
      case "INFO":
        return "green"
      case "WARN":
        return "yellow"
      case "ERROR":
        return "red"
      case "DEBUG":
        return "blue"
      default:
        return "white"
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" marginBottom={1}>
        <Text bold color="white">
          Log Viewer
        </Text>
        <Text color="#999">
          {" "}
          - {filtered.length} entries
        </Text>
      </Box>

      {/* Search box */}
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color="cyan">
          /{" "}
        </Text>
        <Text>{typedQuery}</Text>
        <Text color="cyan">|</Text>
      </Box>

      {/* Log entries */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleLogs.map((log, i) => (
          <Box key={clampedOffset + i} flexDirection="row" gap={1}>
            <Text color="#888">{log.time}</Text>
            <Box width={7}>
              <Text bold color={levelColor(log.level)}>
                {log.level.padEnd(5)}
              </Text>
            </Box>
            <Text wrap="truncate">{log.message}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// Exports
// ============================================================================

export const SHOWCASES: Record<string, () => JSX.Element> = {
  dashboard: DashboardShowcase,
  "ai-chat": AIChatShowcase,
  kanban: KanbanShowcase,
  "cli-wizard": CLIWizardShowcase,
  "dev-tools": DevToolsShowcase,
  "data-explorer": DataExplorerShowcase,
}
