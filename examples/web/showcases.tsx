/**
 * Browser-Ready Showcase Components for Silvery Live Demos
 *
 * Interactive components rendered via renderToXterm() in xterm.js iframes
 * on the VitePress docs site. Keyboard input via emitInput() event bus.
 */

import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useContentRect } from "@silvery/term/xterm/index.ts";
import { builtinPalettes, type ColorPalette } from "@silvery/theme";

// ============================================================================
// Input Event Bus
// ============================================================================

interface KeyInfo {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  return: boolean;
  escape: boolean;
  tab: boolean;
  backspace: boolean;
}

type InputHandler = (input: string, key: KeyInfo) => void;

const inputListeners = new Set<InputHandler>();

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
  };
  const input = data.length === 1 && data >= " " && data < "\x7f" ? data : "";
  for (const cb of inputListeners) cb(input, key);
}

/** Subscribe to keyboard input */
function useInput(handler: InputHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const cb: InputHandler = (i, k) => ref.current(i, k);
    inputListeners.add(cb);
    return () => {
      inputListeners.delete(cb);
    };
  }, []);
}

// ============================================================================
// Mouse Event Bus
// ============================================================================

interface MouseInfo {
  x: number;
  y: number;
  button: number;
}

type MouseHandler = (info: MouseInfo) => void;

const mouseListeners = new Set<MouseHandler>();

/** Called from showcase-app.tsx via term.onBinary() */
export function emitMouse(x: number, y: number, button: number): void {
  for (const cb of mouseListeners) cb({ x, y, button });
}

/** Subscribe to mouse click events */
function useMouseClick(handler: MouseHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const cb: MouseHandler = (info) => ref.current(info);
    mouseListeners.add(cb);
    return () => {
      mouseListeners.delete(cb);
    };
  }, []);
}

// ============================================================================
// Focus State — tracks whether the xterm terminal has focus
// ============================================================================

let _termFocused = false;
const focusListeners = new Set<(focused: boolean) => void>();

/** Called from viewer-app.tsx when xterm gains/loses focus */
export function setTermFocused(focused: boolean): void {
  _termFocused = focused;
  for (const cb of focusListeners) cb(focused);
}

/** Hook: subscribe to terminal focus state */
function useTermFocused(): boolean {
  const [focused, setFocused] = useState(_termFocused);
  useEffect(() => {
    const cb = (f: boolean) => setFocused(f);
    focusListeners.add(cb);
    return () => {
      focusListeners.delete(cb);
    };
  }, []);
  return focused;
}

// ============================================================================
// KeyHints — bottom bar showing available keys
// ============================================================================

function KeyHints({ hints }: { hints: string }): JSX.Element {
  return (
    <Box marginTop={1}>
      <Text color="#555">{hints}</Text>
    </Box>
  );
}

// ============================================================================
// 1. DashboardShowcase — btop-inspired system monitor
// ============================================================================

const SPARKLINE = "▁▂▃▄▅▆▇█";
const sparkChar = (v: number) => SPARKLINE[Math.min(7, Math.round((v / 100) * 7))]!;
const gaugeColor = (v: number) => (v > 70 ? "#f38ba8" : v > 40 ? "#f9e2af" : "#a6e3a1");

function DashboardShowcase(): JSX.Element {
  const [tick, setTick] = useState(0);
  const [activePanel, setActivePanel] = useState(0);
  const [cpuHistory] = useState(() =>
    Array.from({ length: 20 }, () => 20 + Math.floor(Math.random() * 40)),
  );
  const [memHistory] = useState(() =>
    Array.from({ length: 20 }, () => 40 + Math.floor(Math.random() * 30)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => {
        const newT = t + 1;
        cpuHistory.push(
          Math.max(
            5,
            Math.min(95, cpuHistory[cpuHistory.length - 1]! + Math.floor(Math.random() * 21) - 10),
          ),
        );
        cpuHistory.shift();
        memHistory.push(
          Math.max(
            20,
            Math.min(90, memHistory[memHistory.length - 1]! + Math.floor(Math.random() * 11) - 5),
          ),
        );
        memHistory.shift();
        return newT;
      });
    }, 1200);
    return () => clearInterval(id);
  }, []);

  useInput((_input, key) => {
    if (key.leftArrow) setActivePanel((p) => Math.max(0, p - 1));
    if (key.rightArrow) setActivePanel((p) => Math.min(2, p + 1));
  });

  const cpu = cpuHistory[cpuHistory.length - 1]!;
  const mem = memHistory[memHistory.length - 1]!;

  const cores = [
    { label: "C0", value: Math.max(5, cpu + ((tick * 3) % 15) - 7) },
    { label: "C1", value: Math.max(5, cpu - ((tick * 5) % 20) + 5) },
    { label: "C2", value: Math.max(5, cpu + ((tick * 2) % 18) - 3) },
    { label: "C3", value: Math.max(5, cpu - ((tick * 4) % 12) + 2) },
  ].map((c) => ({ ...c, value: Math.min(99, c.value) }));

  const services = [
    { name: "api-gateway", status: "up" as const, uptime: "14d 6h", latency: "12ms" },
    { name: "auth-service", status: "up" as const, uptime: "14d 6h", latency: "8ms" },
    { name: "worker-pool", status: "warn" as const, uptime: "2h 15m", latency: "245ms" },
    { name: "cache-redis", status: "up" as const, uptime: "7d 3h", latency: "2ms" },
    { name: "mail-service", status: "down" as const, uptime: "0m", latency: "—" },
  ];

  const statusIcon = (s: "up" | "warn" | "down") => (s === "up" ? "●" : s === "warn" ? "▲" : "✕");
  const statusColor = (s: "up" | "warn" | "down") =>
    s === "up" ? "#a6e3a1" : s === "warn" ? "#f9e2af" : "#f38ba8";

  const allEvents = [
    { tag: "DEPLOY", color: "#a6e3a1", time: "14:23:01", msg: "v2.4.1 completed" },
    { tag: "ALERT", color: "#f9e2af", time: "14:23:15", msg: "Auth service restarted" },
    { tag: "BACKUP", color: "#89b4fa", time: "14:23:30", msg: "Finished (12.4 GB)" },
    { tag: "CERT", color: "#94e2d5", time: "14:23:45", msg: "SSL renewed (90d)" },
    { tag: "CACHE", color: "#cba6f7", time: "14:24:01", msg: "Purged successfully" },
    { tag: "DB", color: "#89b4fa", time: "14:24:12", msg: "Migration v38 applied" },
    { tag: "SCALE", color: "#a6e3a1", time: "14:24:30", msg: "Workers → 8" },
    { tag: "HEALTH", color: "#a6e3a1", time: "14:24:45", msg: "All services green" },
  ];
  const eventOffset = tick % 4;
  const visibleEvents = allEvents.slice(eventOffset, eventOffset + 4);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box>
        <Text color="#a6e3a1">● </Text>
        <Text bold color="#cdd6f4">
          System Monitor
        </Text>
        <Text color="#6c7086">
          {" "}
          — {cores.length} cores, {services.length} services
        </Text>
      </Box>

      {/* Top row: Metrics + Services */}
      <Box flexDirection="row" gap={1}>
        {/* Metrics panel */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor={activePanel === 0 ? "#89b4fa" : "#45475a"}
          paddingX={1}
        >
          <Text bold color={activePanel === 0 ? "#89b4fa" : "#a6adc8"}>
            CPU / Memory
          </Text>
          {/* Sparkline graphs */}
          <Box flexDirection="row" gap={1}>
            <Box width={5}>
              <Text color="#6c7086">CPU</Text>
            </Box>
            <Text>
              {cpuHistory.map((v, i) => (
                <Text key={i} color={gaugeColor(v)}>
                  {sparkChar(v)}
                </Text>
              ))}
            </Text>
            <Text bold color={gaugeColor(cpu)}>
              {" "}
              {String(cpu).padStart(2)}%
            </Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Box width={5}>
              <Text color="#6c7086">MEM</Text>
            </Box>
            <Text>
              {memHistory.map((v, i) => (
                <Text key={i} color={gaugeColor(v)}>
                  {sparkChar(v)}
                </Text>
              ))}
            </Text>
            <Text bold color={gaugeColor(mem)}>
              {" "}
              {String(mem).padStart(2)}%
            </Text>
          </Box>
          {/* Per-core mini bars */}
          {cores.map((c) => {
            const blocks = Math.round((c.value / 100) * 12);
            return (
              <Box key={c.label} flexDirection="row" gap={1}>
                <Box width={5}>
                  <Text color="#6c7086">{c.label}</Text>
                </Box>
                <Text>
                  <Text color={gaugeColor(c.value)}>{"█".repeat(blocks)}</Text>
                  <Text color="#313244">{"░".repeat(12 - blocks)}</Text>
                </Text>
                <Text bold color={gaugeColor(c.value)}>
                  {" "}
                  {String(c.value).padStart(2)}%
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Services panel */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor={activePanel === 1 ? "#89b4fa" : "#45475a"}
          paddingX={1}
        >
          <Text bold color={activePanel === 1 ? "#89b4fa" : "#a6adc8"}>
            Services
          </Text>
          {services.map((s) => (
            <Box key={s.name} flexDirection="row" justifyContent="space-between" marginBottom={0}>
              <Text>
                <Text color={statusColor(s.status)}>{statusIcon(s.status)} </Text>
                <Text color={s.status === "down" ? "#6c7086" : "#cdd6f4"}>{s.name}</Text>
              </Text>
              <Text>
                <Text color="#6c7086">{s.latency} </Text>
                <Text dim color="#585b70">
                  {s.uptime}
                </Text>
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Bottom row: Events */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={activePanel === 2 ? "#89b4fa" : "#45475a"}
        paddingX={1}
      >
        <Text bold color={activePanel === 2 ? "#89b4fa" : "#a6adc8"}>
          Events
        </Text>
        {visibleEvents.map((e, i) => (
          <Box key={i} flexDirection="row" gap={1}>
            <Text dim color="#585b70">
              {e.time}
            </Text>
            <Box width={8}>
              <Text color={e.color} bold>
                [{e.tag}]
              </Text>
            </Box>
            <Text color={i === 0 ? "#cdd6f4" : "#a6adc8"}>{e.msg}</Text>
          </Box>
        ))}
      </Box>

      <KeyHints hints="←→ panels" />
    </Box>
  );
}

// ============================================================================
// 2. CodingAgentShowcase — interactive coding agent demo
// ============================================================================

interface AgentToolCall {
  tool: string;
  args: string;
  output: string[];
}

interface AgentExchange {
  id: number;
  role: "user" | "agent";
  content: string;
  thinking?: string;
  toolCalls?: AgentToolCall[];
  tokens?: { input: number; output: number };
}

type AgentScriptEntry = Omit<AgentExchange, "id">;

// --- Constants ---

const AGENT_MODEL = "claude-opus-4-6";
const AGENT_INPUT_COST_PER_M = 15;
const AGENT_OUTPUT_COST_PER_M = 75;
const AGENT_CONTEXT_WINDOW = 200_000;

const AGENT_TOOL_ICONS: Record<string, string> = {
  Read: "\u25B8",
  Edit: "\u25B8",
  Bash: "\u25B8",
  Write: "\u25B8",
  Glob: "\u25B8",
  Grep: "\u25B8",
};

const AGENT_TOOL_COLORS: Record<string, string> = {
  Read: "#89b4fa",
  Edit: "#f9e2af",
  Bash: "#a6e3a1",
  Write: "#cba6f7",
  Glob: "#6c7086",
  Grep: "#94e2d5",
};

const AGENT_TOOL_BORDER_COLORS: Record<string, string> = {
  Read: "#304060",
  Edit: "#5a4520",
  Bash: "#2a4a2a",
  Write: "#3d2a5a",
  Glob: "#3a3a3a",
  Grep: "#2a4a4a",
};

// --- Script: realistic multi-turn coding conversation ---

const AGENT_SCRIPT: AgentScriptEntry[] = [
  {
    role: "user",
    content: "Fix the login bug in auth.ts \u2014 expired tokens throw instead of refreshing.",
    tokens: { input: 84, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "The user reports expired tokens throw instead of refreshing. This is likely in the token validation flow. I should read auth.ts to see the current expiry check logic.",
    content: "Let me look at the auth module.",
    toolCalls: [
      {
        tool: "Read",
        args: "src/auth.ts",
        output: [
          "export async function login(token: string) {",
          "  const decoded = jwt.decode(token)",
          "  if (decoded.exp < Date.now()) {",
          '    throw new Error("Token expired")',
          "  }",
          "  return decoded.user",
          "}",
        ],
      },
    ],
    tokens: { input: 3694, output: 624 },
  },
  {
    role: "agent",
    thinking:
      "Found it \u2014 decoded.exp is in seconds (Unix timestamp) but Date.now() returns milliseconds. Every token appears expired. I need to divide Date.now() by 1000.",
    content: "Found it. The expiry check compares seconds to milliseconds. Fixing now.",
    toolCalls: [
      {
        tool: "Edit",
        args: "src/auth.ts",
        output: [
          "  const decoded = jwt.decode(token)",
          "- if (decoded.exp < Date.now()) {",
          '-   throw new Error("Token expired")',
          "+ if (decoded.exp < Date.now() / 1000) {",
          "+   return refreshToken(token)",
          "  }",
        ],
      },
    ],
    tokens: { input: 4312, output: 574 },
  },
  {
    role: "agent",
    content: "Running tests to verify the fix.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test src/auth.test.ts",
        output: [
          "auth.test.ts",
          "  \u2713 login with valid token (2ms)",
          "  \u2713 login with expired token refreshes (3ms)",
          "  \u2713 login with invalid token rejects (1ms)",
          "",
          "3 passed | 0 failed",
        ],
      },
    ],
    tokens: { input: 4978, output: 312 },
  },
  {
    role: "agent",
    content:
      "Fixed! The bug was comparing jwt.exp (seconds) with Date.now() (milliseconds). Expired tokens now refresh instead of throwing.",
    tokens: { input: 5202, output: 178 },
  },
  {
    role: "user",
    content: "Nice. Can you also add rate limiting to the login endpoint?",
    tokens: { input: 116, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "The user wants rate limiting on login. Let me check if there's existing rate limiting infrastructure before building from scratch.",
    content: "I'll check what rate limiting infrastructure exists.",
    toolCalls: [
      {
        tool: "Grep",
        args: "rateLimit|rate-limit",
        output: ["src/middleware/rate-limit.ts", "src/config.ts"],
      },
      {
        tool: "Read",
        args: "src/middleware/rate-limit.ts",
        output: [
          "import { RateLimiter } from '@lib/rate-limit'",
          "",
          "export function createLimiter(opts: { window: number; max: number }) {",
          "  return new RateLimiter(opts)",
          "}",
        ],
      },
    ],
    tokens: { input: 6490, output: 846 },
  },
  {
    role: "agent",
    thinking:
      "Good \u2014 there's already a RateLimiter abstraction. I just need to create an instance with appropriate settings and wire it into the auth route.",
    content: "Good, there's already a rate limiter. I'll wire it into the auth route.",
    toolCalls: [
      {
        tool: "Edit",
        args: "src/routes/auth.ts",
        output: [
          "+ import { createLimiter } from '../middleware/rate-limit'",
          "+",
          "+ const loginLimiter = createLimiter({ window: 60_000, max: 5 })",
          "+",
          "  router.post('/login', async (req, res) => {",
          "+   const limited = await loginLimiter.check(req.ip)",
          "+   if (limited) return res.status(429).json({ error: 'Too many attempts' })",
          "    const { token } = req.body",
        ],
      },
    ],
    tokens: { input: 7782, output: 756 },
  },
  {
    role: "agent",
    content: "Running the full test suite.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test",
        output: [
          "auth.test.ts ........... 3 passed",
          "rate-limit.test.ts ..... 5 passed",
          "routes/auth.test.ts .... 7 passed",
          "",
          "15 passed | 0 failed | 3 files",
        ],
      },
    ],
    tokens: { input: 8204, output: 334 },
  },
  {
    role: "agent",
    content:
      "Rate limiting added: 5 attempts per minute per IP on the login endpoint. All 15 tests pass.",
    tokens: { input: 8468, output: 156 },
  },
  {
    role: "user",
    content: "Add a health check endpoint at /health that returns the service version.",
    tokens: { input: 104, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "Simple task \u2014 read the version from package.json and expose it on GET /health alongside uptime.",
    content: "Simple addition \u2014 reading package.json for the version, then adding the route.",
    toolCalls: [
      {
        tool: "Read",
        args: "package.json",
        output: ["{", '  "name": "auth-service",', '  "version": "2.4.1",', "  ...", "}"],
      },
      {
        tool: "Edit",
        args: "src/routes/health.ts",
        output: [
          "+ import { version } from '../../package.json'",
          "+",
          "+ router.get('/health', (req, res) => {",
          "+   res.json({ status: 'ok', version, uptime: process.uptime() })",
          "+ })",
        ],
      },
    ],
    tokens: { input: 21578, output: 468 },
  },
  {
    role: "agent",
    content: "Running final tests.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test",
        output: [
          "auth.test.ts ........... 3 passed",
          "rate-limit.test.ts ..... 5 passed",
          "routes/auth.test.ts .... 7 passed",
          "routes/health.test.ts .. 2 passed",
          "",
          "17 passed | 0 failed | 4 files",
        ],
      },
    ],
    tokens: { input: 22046, output: 290 },
  },
  {
    role: "agent",
    content:
      "All done! Summary:\n\u2022 Fixed token expiry bug (seconds vs milliseconds)\n\u2022 Added rate limiting (5 req/min per IP)\n\u2022 Added /health endpoint (v2.4.1)\n\nAll 17 tests pass.",
    tokens: { input: 22468, output: 224 },
  },
];

// --- Token helpers ---

function agentFormatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function agentFormatCost(inputTokens: number, outputTokens: number): string {
  const cost =
    (inputTokens * AGENT_INPUT_COST_PER_M + outputTokens * AGENT_OUTPUT_COST_PER_M) / 1_000_000;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function agentComputeTokens(exchanges: AgentExchange[]): {
  input: number;
  output: number;
  currentContext: number;
} {
  let input = 0;
  let output = 0;
  let currentContext = 0;
  for (const ex of exchanges) {
    if (ex.tokens) {
      input += ex.tokens.input;
      output += ex.tokens.output;
      if (ex.tokens.input > currentContext) currentContext = ex.tokens.input;
    }
  }
  return { input, output, currentContext };
}

// --- Streaming phases ---

type AgentStreamPhase = "thinking" | "streaming" | "tools" | "done";

// --- Spinner ---

const AGENT_SPINNER_FRAMES = [
  "\u2807",
  "\u2839",
  "\u2838",
  "\u283C",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280F",
];

function AgentSpinner(): JSX.Element {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % AGENT_SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="#cba6f7">{AGENT_SPINNER_FRAMES[frame]}</Text>;
}

// --- Thinking block ---

function AgentThinkingBlock({ text, done }: { text: string; done: boolean }): JSX.Element {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text color="#585b70" dim italic>
        {done ? (
          "\u25B8 "
        ) : (
          <>
            <AgentSpinner />{" "}
          </>
        )}
        thinking...
      </Text>
      {!done && (
        <Text color="#585b70" dim wrap="truncate">
          {"    "}
          {text}
        </Text>
      )}
    </Box>
  );
}

// --- Tool call block ---

function AgentToolCallBlock({
  call,
  phase,
}: {
  call: AgentToolCall;
  phase: "pending" | "running" | "done";
}): JSX.Element {
  const color = AGENT_TOOL_COLORS[call.tool] ?? "#a6adc8";
  const borderColor = AGENT_TOOL_BORDER_COLORS[call.tool] ?? "#45475a";
  const icon = AGENT_TOOL_ICONS[call.tool] ?? "\u25B8";

  return (
    <Box flexDirection="column">
      <Text>
        {phase === "running" ? (
          <>
            <AgentSpinner />{" "}
          </>
        ) : phase === "done" ? (
          <Text color="#a6e3a1">{"\u2713 "}</Text>
        ) : (
          <Text color="#585b70" dim>
            {"\u25CB "}
          </Text>
        )}
        <Text color={color} bold>
          {icon} {call.tool}
        </Text>{" "}
        <Text color="#94e2d5">{call.args}</Text>
      </Text>
      {phase === "done" && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={borderColor}
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          paddingLeft={1}
          marginLeft={1}
        >
          {call.output.map((line, i) => {
            if (line.startsWith("+"))
              return (
                <Text key={i} color="#a6e3a1">
                  {line}
                </Text>
              );
            if (line.startsWith("-"))
              return (
                <Text key={i} color="#f38ba8">
                  {line}
                </Text>
              );
            if (line.startsWith("  \u2713") || line.startsWith("\u2713"))
              return (
                <Text key={i} color="#a6e3a1">
                  {line}
                </Text>
              );
            if (line.includes("passed"))
              return (
                <Text key={i} bold color="#a6e3a1">
                  {line}
                </Text>
              );
            return (
              <Text key={i} color="#a6adc8">
                {line}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

// --- Streaming text (word-by-word) ---

function AgentStreamingText({
  fullText,
  revealFraction,
  showCursor,
}: {
  fullText: string;
  revealFraction: number;
  showCursor: boolean;
}): JSX.Element {
  let text = fullText;
  if (revealFraction < 1) {
    const words = fullText.split(/(\s+)/);
    const totalWords = words.filter((w) => w.trim()).length;
    const revealWords = Math.ceil(totalWords * revealFraction);

    let wordCount = 0;
    text = "";
    for (const word of words) {
      if (word.trim()) {
        wordCount++;
        if (wordCount > revealWords) break;
      }
      text += word;
    }
  }

  // Split on newlines to render as separate lines (Text doesn't handle \n as line breaks)
  const lines = text.split("\n");
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} wrap="wrap">
          {line}
          {showCursor && i === lines.length - 1 && <Text color="#89b4fa">{"\u258C"}</Text>}
        </Text>
      ))}
    </Box>
  );
}

// --- Context bar ---

function AgentContextBar({ currentContext }: { currentContext: number }): JSX.Element {
  const CTX_W = 12;
  const ctxFrac = currentContext / AGENT_CONTEXT_WINDOW;
  const ctxFilled = Math.round(Math.min(ctxFrac, 1) * CTX_W);
  const ctxPct = Math.round(ctxFrac * 100);
  const ctxColor = ctxPct > 80 ? "#f38ba8" : ctxPct > 50 ? "#f9e2af" : "#89b4fa";
  return (
    <Text color="#585b70">
      <Text color={ctxColor}>{"\u2588".repeat(ctxFilled)}</Text>
      <Text color="#313244">{"\u2591".repeat(CTX_W - ctxFilled)}</Text> {ctxPct}%
    </Text>
  );
}

// --- Exchange rendering ---

function AgentExchangeView({
  exchange,
  streamPhase,
  revealFraction,
  isLatest,
  cumTokens,
}: {
  exchange: AgentExchange;
  streamPhase: AgentStreamPhase;
  revealFraction: number;
  isLatest: boolean;
  cumTokens?: { input: number; output: number };
}): JSX.Element {
  const phase = isLatest ? streamPhase : "done";
  const fraction = isLatest ? revealFraction : 1;
  const isUser = exchange.role === "user";

  if (isUser) {
    return (
      <Box paddingX={1}>
        <Text>
          <Text bold color="#cba6f7">
            {"\u276F"}{" "}
          </Text>
          <Text color="#cdd6f4" wrap="wrap">
            {exchange.content}
          </Text>
        </Text>
      </Box>
    );
  }

  // Agent exchange
  const toolCalls = exchange.toolCalls ?? [];
  const toolRevealCount = phase === "tools" || phase === "done" ? toolCalls.length : 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Thinking block */}
      {exchange.thinking && (phase === "thinking" || phase === "streaming") && (
        <AgentThinkingBlock text={exchange.thinking} done={phase !== "thinking"} />
      )}

      {/* Agent content */}
      {(phase === "streaming" || phase === "tools" || phase === "done") && (
        <Box flexDirection="column">
          <AgentStreamingText
            fullText={exchange.content}
            revealFraction={phase === "streaming" ? fraction : 1}
            showCursor={phase === "streaming" && fraction < 1}
          />
        </Box>
      )}

      {/* Tool calls */}
      {toolRevealCount > 0 && (
        <Box flexDirection="column" marginTop={0}>
          {toolCalls.map((call, i) => (
            <AgentToolCallBlock
              key={i}
              call={call}
              phase={phase === "done" ? "done" : i < toolRevealCount - 1 ? "done" : "running"}
            />
          ))}
        </Box>
      )}

      {/* Completion indicator + token stats (only for final summary exchanges) */}
      {phase === "done" && !exchange.toolCalls?.length && cumTokens && (
        <Box marginTop={0}>
          <Text dim color="#585b70">
            {"  "}
            {agentFormatTokens(cumTokens.input)} in {"\u00B7"} {agentFormatTokens(cumTokens.output)}{" "}
            out {"\u00B7"} {agentFormatCost(cumTokens.input, cumTokens.output)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// --- Status bar ---

function AgentStatusBar({
  exchanges,
  isAnimating,
  termFocused,
}: {
  exchanges: AgentExchange[];
  isAnimating: boolean;
  termFocused: boolean;
}): JSX.Element {
  const cumulative = agentComputeTokens(exchanges);
  const cost = agentFormatCost(cumulative.input, cumulative.output);

  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Text color="#585b70" dim>
        <Text color="#cba6f7">{AGENT_MODEL}</Text>
        {"  "}
        {agentFormatTokens(cumulative.input)} in {"\u00B7"} {agentFormatTokens(cumulative.output)}{" "}
        out {"\u00B7"} {cost}
      </Text>
      <Text color="#585b70" dim>
        <AgentContextBar currentContext={cumulative.currentContext} />
        {"  "}
        {isAnimating ? (
          <Text color="#585b70">working...</Text>
        ) : termFocused ? (
          <Text color="#585b70">type a prompt {"\u23CE"}</Text>
        ) : (
          <Text color="#45475a">click to focus</Text>
        )}
      </Text>
    </Box>
  );
}

// --- Script index (module-level to persist across re-renders) ---
let agentScriptIdx = 0;

function CodingAgentShowcase(): JSX.Element {
  const [exchanges, setExchanges] = useState<AgentExchange[]>([]);
  const [inputText, setInputText] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);
  const termFocused = useTermFocused();

  // Streaming state
  const [streamPhase, setStreamPhase] = useState<AgentStreamPhase>("done");
  const [revealFraction, setRevealFraction] = useState(1);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextIdRef = useRef(0);
  const scriptIdxRef = useRef(0);

  // Blink cursor
  useEffect(() => {
    const id = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  /** Cancel all streaming timers. */
  const cancelStreaming = () => {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  };

  /** Start streaming an exchange through its phases. */
  const startStreaming = (entry: AgentScriptEntry, id: number) => {
    cancelStreaming();
    const newExchange: AgentExchange = { ...entry, id };

    // User messages: instant
    if (entry.role === "user") {
      setExchanges((prev) => [...prev, newExchange]);
      setStreamPhase("done");
      setRevealFraction(1);
      return;
    }

    // Agent message: thinking -> streaming -> tools -> done
    setExchanges((prev) => [...prev, newExchange]);

    if (entry.thinking) {
      setStreamPhase("thinking");
      setRevealFraction(0);
      phaseTimerRef.current = setTimeout(() => {
        setStreamPhase("streaming");
        let frac = 0;
        revealTimerRef.current = setInterval(() => {
          frac += 0.08;
          if (frac >= 1) {
            frac = 1;
            if (revealTimerRef.current) clearInterval(revealTimerRef.current);
            if (entry.toolCalls?.length) {
              setStreamPhase("tools");
              phaseTimerRef.current = setTimeout(
                () => setStreamPhase("done"),
                600 * (entry.toolCalls?.length ?? 1),
              );
            } else {
              setStreamPhase("done");
            }
          }
          setRevealFraction(frac);
        }, 50);
      }, 1200);
    } else {
      setStreamPhase("streaming");
      let frac = 0;
      revealTimerRef.current = setInterval(() => {
        frac += 0.12;
        if (frac >= 1) {
          frac = 1;
          if (revealTimerRef.current) clearInterval(revealTimerRef.current);
          if (entry.toolCalls?.length) {
            setStreamPhase("tools");
            phaseTimerRef.current = setTimeout(
              () => setStreamPhase("done"),
              600 * (entry.toolCalls?.length ?? 1),
            );
          } else {
            setStreamPhase("done");
          }
        }
        setRevealFraction(frac);
      }, 50);
    }
  };

  /** Advance to the next script entry. Returns true if there was something to advance. */
  const advance = () => {
    if (streamPhase !== "done") return false;
    if (scriptIdxRef.current >= AGENT_SCRIPT.length) return false;

    const entry = AGENT_SCRIPT[scriptIdxRef.current]!;
    const id = nextIdRef.current++;
    scriptIdxRef.current++;
    startStreaming(entry, id);

    // Auto-chain: user entry -> immediately start following agent entry
    if (entry.role === "user" && scriptIdxRef.current < AGENT_SCRIPT.length) {
      const next = AGENT_SCRIPT[scriptIdxRef.current]!;
      if (next.role === "agent") {
        const nextId = nextIdRef.current++;
        scriptIdxRef.current++;
        startStreaming(next, nextId);
      }
    }
    return true;
  };

  // Auto-start the first exchange after a short delay
  useEffect(() => {
    const timer = setTimeout(() => advance(), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-advance: when streaming finishes and there are more entries, continue
  useEffect(() => {
    if (streamPhase !== "done") return;
    if (scriptIdxRef.current >= AGENT_SCRIPT.length) return;
    const timer = setTimeout(() => advance(), 800);
    return () => clearTimeout(timer);
  }, [streamPhase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelStreaming();
  }, []);

  // User types + Enter -> start next exchange (or skip streaming)
  useInput((input, key) => {
    if (key.return) {
      if (streamPhase !== "done") {
        // Skip current streaming
        cancelStreaming();
        setStreamPhase("done");
        setRevealFraction(1);
        return;
      }
      if (inputText.length > 0) {
        // Submit user text as custom exchange, then advance to next agent response
        const id = nextIdRef.current++;
        const userExchange: AgentExchange = {
          id,
          role: "user",
          content: inputText,
          tokens: { input: inputText.length * 4, output: 0 },
        };
        setExchanges((prev) => [...prev, userExchange]);
        setInputText("");

        // Skip past user entries in script to find next agent entry
        while (
          scriptIdxRef.current < AGENT_SCRIPT.length &&
          AGENT_SCRIPT[scriptIdxRef.current]!.role === "user"
        ) {
          scriptIdxRef.current++;
        }
        // Start the next agent entry
        setTimeout(() => advance(), 150);
      } else {
        advance();
      }
      return;
    }
    if (key.backspace) {
      setInputText((t) => t.slice(0, -1));
      return;
    }
    if (input && input >= " ") {
      setInputText((t) => t + input);
    }
  });

  const isAnimating = streamPhase !== "done";

  // Cumulative token stats for the last agent exchange
  const cumTokens = agentComputeTokens(exchanges);

  return (
    <Box flexDirection="column" padding={1} overflow="hidden">
      {/* Exchange history — anchored to bottom, older content scrolls off top */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" justifyContent="flex-end">
        {/* Welcome text when no exchanges yet */}
        {exchanges.length === 0 && !isAnimating && (
          <Box flexDirection="column" paddingX={1} marginTop={1}>
            <Text color="#6c7086">Ready. Type a prompt and press Enter to see the agent work.</Text>
          </Box>
        )}

        {exchanges.map((ex, i) => {
          const isLatest = i === exchanges.length - 1;

          return (
            <Box key={ex.id} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
              <AgentExchangeView
                exchange={ex}
                streamPhase={streamPhase}
                revealFraction={revealFraction}
                isLatest={isLatest}
                cumTokens={
                  isLatest && streamPhase === "done"
                    ? { input: cumTokens.input, output: cumTokens.output }
                    : undefined
                }
              />
            </Box>
          );
        })}

        {/* Done indicator */}
        {scriptIdxRef.current >= AGENT_SCRIPT.length &&
          streamPhase === "done" &&
          exchanges.length > 0 && (
            <Box paddingX={1} marginTop={0}>
              <Text color="#a6e3a1" bold>
                {"\u2714"} Session complete
              </Text>
            </Box>
          )}
      </Box>

      {/* Input */}
      <Box
        borderStyle="round"
        borderColor={isAnimating ? "#313244" : termFocused ? "#cba6f7" : "#313244"}
        paddingX={1}
        flexDirection="row"
      >
        <Text color="#cba6f7" bold>
          {"\u276F"}{" "}
        </Text>
        <Text color={inputText ? "#cdd6f4" : "#585b70"} wrap="truncate">
          {inputText ||
            (isAnimating ? "" : termFocused ? "type a prompt, then Enter..." : "click to focus")}
        </Text>
        <Text color="#89b4fa">{!isAnimating && termFocused && cursorVisible ? "\u258B" : " "}</Text>
      </Box>

      {/* Status bar */}
      <AgentStatusBar exchanges={exchanges} isAnimating={isAnimating} termFocused={termFocused} />
    </Box>
  );
}

// ============================================================================
// 3. KanbanShowcase — polished kanban board
// ============================================================================

interface KanbanCard {
  title: string;
  tag: { name: string; color: string; bg: string };
}

interface KanbanColumn {
  title: string;
  headerBg: string;
  headerColor: string;
  cards: KanbanCard[];
}

const KANBAN_DATA: KanbanColumn[] = [
  {
    title: "Todo",
    headerBg: "#302030",
    headerColor: "#f38ba8",
    cards: [
      { title: "Design landing page", tag: { name: "design", color: "#f9e2af", bg: "#303020" } },
      { title: "Write API docs", tag: { name: "docs", color: "#89b4fa", bg: "#1e2030" } },
      { title: "Set up monitoring", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
    ],
  },
  {
    title: "In Progress",
    headerBg: "#303020",
    headerColor: "#f9e2af",
    cards: [
      { title: "User authentication", tag: { name: "backend", color: "#cba6f7", bg: "#251e30" } },
      { title: "Dashboard redesign", tag: { name: "frontend", color: "#89dceb", bg: "#1e2530" } },
      { title: "Rate limiting", tag: { name: "backend", color: "#cba6f7", bg: "#251e30" } },
    ],
  },
  {
    title: "Done",
    headerBg: "#203020",
    headerColor: "#a6e3a1",
    cards: [
      { title: "Project setup", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
      { title: "CI/CD pipeline", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
      { title: "Initial wireframes", tag: { name: "design", color: "#f9e2af", bg: "#303020" } },
    ],
  },
];

function KanbanShowcase(): JSX.Element {
  const [col, setCol] = useState(1);
  const [card, setCard] = useState(0);
  const { width } = useContentRect();

  useInput((_input, key) => {
    if (key.leftArrow) {
      setCol((c) => Math.max(0, c - 1));
      setCard(0);
    }
    if (key.rightArrow) {
      setCol((c) => Math.min(2, c + 1));
      setCard(0);
    }
    if (key.upArrow) setCard((c) => Math.max(0, c - 1));
    if (key.downArrow) {
      const maxCards = KANBAN_DATA[col]?.cards.length ?? 3;
      setCard((c) => Math.min(maxCards - 1, c + 1));
    }
  });

  // Mouse click to select column and card
  // Layout: padding=1, 3 columns with gap=1, each with border
  // Column starts: roughly at x = padding + colIdx * (colWidth + gap)
  // Cards start at y ~= 4 (padding + header + border + marginTop), each card ~4 rows tall
  useMouseClick(({ x, y }) => {
    const contentWidth = (width || 80) - 2; // subtract padding
    const colWidth = Math.floor((contentWidth - 2) / 3); // 3 cols with 2 gaps
    const colIdx = Math.min(2, Math.max(0, Math.floor((x - 1) / (colWidth + 1))));

    // Cards start around row 4 (1 padding + 1 border + 1 header + 1 marginTop)
    // Each card is ~4 rows (1 border-top + 1 title + 1 tag + 1 border-bottom)
    const cardStartY = 4;
    const cardHeight = 4;
    if (y >= cardStartY) {
      const cardIdx = Math.floor((y - cardStartY) / cardHeight);
      const maxCards = KANBAN_DATA[colIdx]?.cards.length ?? 3;
      if (cardIdx < maxCards) {
        setCol(colIdx);
        setCard(cardIdx);
      } else {
        setCol(colIdx);
        setCard(Math.max(0, maxCards - 1));
      }
    } else {
      // Clicked on header area — just select the column
      setCol(colIdx);
      setCard(0);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" gap={1} flexGrow={1}>
        {KANBAN_DATA.map((column, colIdx) => {
          const isFocused = colIdx === col;
          return (
            <Box
              key={column.title}
              flexDirection="column"
              flexGrow={1}
              borderStyle="round"
              borderColor={isFocused ? "#89b4fa" : "#313244"}
            >
              {/* Column header */}
              <Box paddingX={1} backgroundColor={column.headerBg}>
                <Text bold color={column.headerColor}>
                  {column.title}
                </Text>
                <Text color="#6c7086"> {column.cards.length}</Text>
              </Box>

              {/* Cards */}
              <Box flexDirection="column" paddingX={1} marginTop={1}>
                {column.cards.map((c, cardIdx) => {
                  const isSelected = colIdx === col && cardIdx === card;
                  return (
                    <Box
                      key={c.title}
                      flexDirection="column"
                      marginBottom={1}
                      borderStyle="round"
                      borderColor={isSelected ? "#89dceb" : isFocused ? "#45475a" : "#313244"}
                      paddingX={1}
                    >
                      <Text
                        color={isSelected ? "#cdd6f4" : isFocused ? "#a6adc8" : "#6c7086"}
                        bold={isSelected}
                      >
                        {isSelected && <Text color="#89dceb">▸ </Text>}
                        {c.title}
                      </Text>
                      <Box>
                        <Box backgroundColor={c.tag.bg} paddingX={0}>
                          <Text color={c.tag.color}> {c.tag.name} </Text>
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Box>

      <KeyHints hints="←→ columns  ↑↓ cards  click to select" />
    </Box>
  );
}

// ============================================================================
// 4. CLIWizardShowcase — Clack-style wizard
// ============================================================================

interface WizardState {
  step: number;
  cursor: number;
  answers: string[];
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
];

// Catppuccin Mocha palette gradient for the wizard pipe (purple → teal → green)
const PIPE_GRADIENT = [
  "#cba6f7", // mauve
  "#b4befe", // lavender
  "#89b4fa", // blue
  "#74c7ec", // sapphire
  "#89dceb", // sky
  "#94e2d5", // teal
  "#a6e3a1", // green
];

// Distinct bullet colors per step (Catppuccin Mocha)
const STEP_COLORS = ["#cba6f7", "#89b4fa", "#89dceb", "#f9e2af"];

function GradientPipe({ index, total }: { index: number; total: number }): JSX.Element {
  const gradientIdx = Math.floor((index / Math.max(1, total - 1)) * (PIPE_GRADIENT.length - 1));
  const color = PIPE_GRADIENT[Math.min(gradientIdx, PIPE_GRADIENT.length - 1)]!;
  return <Text color={color}>│</Text>;
}

function CLIWizardShowcase(): JSX.Element {
  const [state, setState] = useState<WizardState>({
    step: 0,
    cursor: 0,
    answers: [],
  });
  const [done, setDone] = useState(false);
  const [textInput, setTextInput] = useState("");

  useInput((input, key) => {
    if (done) return;
    const currentStep = WIZARD_STEPS[state.step];
    if (!currentStep) return;

    if (currentStep.type === "select") {
      const opts = currentStep.options!;
      if (key.upArrow) setState((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }));
      if (key.downArrow)
        setState((s) => ({ ...s, cursor: Math.min(opts.length - 1, s.cursor + 1) }));
    }

    if (currentStep.type === "text") {
      if (key.backspace) {
        setTextInput((t) => t.slice(0, -1));
        return;
      }
      if (input) {
        setTextInput((t) => t + input);
        return;
      }
    }

    if (key.return) {
      let answer: string;
      if (currentStep.type === "select") {
        answer = currentStep.options![state.cursor]!;
      } else {
        answer = textInput || currentStep.answer;
        setTextInput("");
      }
      const newAnswers = [...state.answers, answer];
      if (state.step + 1 >= WIZARD_STEPS.length) {
        setDone(true);
        setState({ step: state.step + 1, cursor: 0, answers: newAnswers });
      } else {
        const nextStep = WIZARD_STEPS[state.step + 1]!;
        const nextCursor = nextStep.type === "select" ? (nextStep.defaultCursor ?? 0) : 0;
        setState({ step: state.step + 1, cursor: nextCursor, answers: newAnswers });
      }
    }
  });

  // Click to select options in select steps
  useMouseClick(({ y }) => {
    if (done) return;
    const currentStep = WIZARD_STEPS[state.step];
    if (currentStep?.type !== "select") return;

    // Calculate where options start in the terminal output:
    // padding(1) + title(1) + version(1) + marginBottom(1) + progress(1) + marginBottom(1) +
    // header "Configure..."(1) + pipe(1) = 8 rows of header
    // Each completed step: label(1) + pipe(1) = 2 rows
    // Active step label(1) = 1 row, then options start
    const headerRows = 8;
    const completedRows = state.step * 2;
    const activeLabel = 1;
    const optionsStartY = headerRows + completedRows + activeLabel;

    const clickedOption = y - optionsStartY;
    if (clickedOption >= 0 && clickedOption < currentStep.options!.length) {
      setState((s) => ({ ...s, cursor: clickedOption }));
    }
  });

  // Progress bar: completed steps / total
  const progress = Math.min(state.step, WIZARD_STEPS.length);
  const progressWidth = 20;
  const filled = Math.round((progress / WIZARD_STEPS.length) * progressWidth);

  // Total pipe lines for gradient calculation
  const totalPipeLines = WIZARD_STEPS.length * 3 + 4;

  // Track line index for gradient
  let pipeLineIdx = 0;

  return (
    <Box flexDirection="column" padding={1} paddingLeft={2}>
      {/* Title bar */}
      <Box marginBottom={0}>
        <Text color="#cba6f7" bold>
          {"▲ "}
        </Text>
        <Text bold color="#cdd6f4">
          create-app
        </Text>
        <Text color="#6c7086"> v1.0</Text>
      </Box>

      {/* Progress indicator */}
      <Box marginBottom={1}>
        <Text color="#585b70"> </Text>
        <Text>
          <Text color="#a6e3a1">{"━".repeat(filled)}</Text>
          <Text color="#313244">{"━".repeat(progressWidth - filled)}</Text>
        </Text>
        <Text color="#585b70">
          {" "}
          {progress}/{WIZARD_STEPS.length}
        </Text>
      </Box>

      <Text>
        <Text bold color="#cba6f7">
          ┌{" "}
        </Text>
        <Text bold color="#cdd6f4">
          Configure your project
        </Text>
      </Text>
      <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />

      {WIZARD_STEPS.map((ws, i) => {
        const isDone = i < state.step;
        const isActive = i === state.step && !done;
        const isPending = i > state.step;
        const stepColor = STEP_COLORS[i % STEP_COLORS.length]!;

        if (isDone) {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#a6e3a1" bold>
                  ✔
                </Text>
                <Text color="#a6adc8"> {ws.label}</Text>
                <Text dim color="#585b70">
                  {" "}
                  ·{" "}
                </Text>
                <Text bold color={stepColor}>
                  {state.answers[i]}
                </Text>
              </Text>
              <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
            </React.Fragment>
          );
        }

        if (isActive && ws.type === "text") {
          const displayText = textInput || ws.answer;
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color={stepColor} bold>
                  ◆
                </Text>
                <Text bold color="#cdd6f4">
                  {" "}
                  {ws.label}
                </Text>
              </Text>
              <Text>
                <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
                <Text color={stepColor}> {displayText}</Text>
                <Text color={stepColor}>▋</Text>
              </Text>
              <Text>
                <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
                <Text dim color="#585b70">
                  {" "}
                  type a name, then Enter
                </Text>
              </Text>
              <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
            </React.Fragment>
          );
        }

        if (isActive && ws.type === "select") {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color={stepColor} bold>
                  ◆
                </Text>
                <Text bold color="#cdd6f4">
                  {" "}
                  {ws.label}
                </Text>
              </Text>
              {ws.options!.map((opt, oi) => (
                <Text key={opt}>
                  <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
                  {"  "}
                  {oi === state.cursor ? (
                    <Text bold color={stepColor}>
                      ● {opt}
                    </Text>
                  ) : (
                    <Text color="#6c7086">○ {opt}</Text>
                  )}
                </Text>
              ))}
              <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
            </React.Fragment>
          );
        }

        if (isPending) {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#45475a">○</Text>
                <Text color="#585b70"> {ws.label}</Text>
              </Text>
              <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
            </React.Fragment>
          );
        }

        return null;
      })}

      {done ? (
        <>
          <Text>
            <Text color="#a6e3a1" bold>
              ✔
            </Text>
            <Text color="#a6e3a1" bold>
              {" "}
              All done!
            </Text>
          </Text>
          <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
          {/* Summary box with colored labels */}
          <Box
            flexDirection="column"
            marginLeft={1}
            borderStyle="round"
            borderColor="#45475a"
            paddingX={1}
          >
            <Text>
              <Text color="#cba6f7" bold>
                Project{"   "}
              </Text>
              <Text color="#cdd6f4">{state.answers[0] ?? "my-app"}</Text>
            </Text>
            <Text>
              <Text color="#89b4fa" bold>
                Framework{" "}
              </Text>
              <Text color="#cdd6f4">{state.answers[1] ?? "React"}</Text>
            </Text>
            <Text>
              <Text color="#89dceb" bold>
                TypeScript
              </Text>
              <Text color="#cdd6f4"> {state.answers[2] ?? "Yes"}</Text>
            </Text>
            <Text>
              <Text color="#f9e2af" bold>
                Manager{"   "}
              </Text>
              <Text color="#cdd6f4">{state.answers[3] ?? "bun"}</Text>
            </Text>
          </Box>
          <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
          <Text>
            <Text color="#a6e3a1" bold>
              └{" "}
            </Text>
            <Text color="#a6e3a1">cd </Text>
            <Text color="#cdd6f4" bold>
              {state.answers[0] ?? "my-app"}
            </Text>
            <Text color="#6c7086"> && </Text>
            <Text color="#a6e3a1">bun dev</Text>
          </Text>
        </>
      ) : (
        <Text color="#45475a">└</Text>
      )}

      <KeyHints hints="↑↓ select  Enter confirm  Backspace delete" />
    </Box>
  );
}

// ============================================================================
// 5. DataExplorerShowcase — lazygit-inspired table
// ============================================================================

interface ProcessRow {
  id: string;
  name: string;
  status: "running" | "idle" | "stopped";
  cpu: number;
  mem: string;
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
];

function DataExplorerShowcase(): JSX.Element {
  const [tick, setTick] = useState(0);
  const [selectedRow, setSelectedRow] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  useInput((_input, key) => {
    if (key.upArrow) setSelectedRow((r) => Math.max(0, r - 1));
    if (key.downArrow) setSelectedRow((r) => Math.min(PROCESS_DATA.length - 1, r + 1));
  });

  const rows = PROCESS_DATA.map((row) => ({
    ...row,
    cpu:
      row.status === "running"
        ? Math.max(1, Math.min(99, row.cpu + ((tick * 7 + row.cpu) % 13) - 6))
        : row.cpu,
  })).sort((a, b) => b.cpu - a.cpu);

  const statusIcon = (s: string) => (s === "running" ? "●" : s === "idle" ? "◐" : "○");
  const statusColor = (s: string) =>
    s === "running" ? "#a6e3a1" : s === "idle" ? "#f9e2af" : "#f38ba8";
  const cpuColor = (v: number) => (v > 50 ? "#f38ba8" : v > 20 ? "#f9e2af" : "#a6e3a1");

  const colW = { id: 6, name: 14, status: 3, cpu: 14, mem: 8 };

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text>
          <Text bold color="#cdd6f4">
            Process Explorer
          </Text>
          <Text color="#6c7086"> — {rows.length} processes</Text>
        </Text>
        <Text color="#6c7086">
          sorted by{" "}
          <Text bold color="#89dceb">
            CPU ▼
          </Text>
        </Text>
      </Box>

      {/* Header */}
      <Box flexDirection="row" backgroundColor="#313244">
        <Box width={colW.id} paddingX={1}>
          <Text bold color="#a6adc8">
            PID
          </Text>
        </Box>
        <Box width={colW.name} paddingX={1}>
          <Text bold color="#a6adc8">
            Name
          </Text>
        </Box>
        <Box width={colW.status} paddingX={1}>
          <Text bold color="#a6adc8">
            S
          </Text>
        </Box>
        <Box width={colW.cpu} paddingX={1}>
          <Text bold color="#a6adc8">
            CPU%
          </Text>
        </Box>
        <Box width={colW.mem} paddingX={1}>
          <Text bold color="#a6adc8">
            Mem
          </Text>
        </Box>
      </Box>

      {/* Rows */}
      {rows.map((row, i) => {
        const isSelected = i === selectedRow;
        const bgColor = isSelected ? "#2a2a5e" : i % 2 === 0 ? "#1a1a2e" : "#1e1e3e";
        const cpuBars = Math.round((row.cpu / 100) * 8);
        return (
          <Box key={row.id} flexDirection="row" backgroundColor={bgColor}>
            <Box width={colW.id} paddingX={1}>
              <Text color="#585b70">{row.id}</Text>
            </Box>
            <Box width={colW.name} paddingX={1}>
              <Text bold={isSelected} color={isSelected ? "#cdd6f4" : "#a6adc8"}>
                {row.name}
              </Text>
            </Box>
            <Box width={colW.status} paddingX={1}>
              <Text color={statusColor(row.status)}>{statusIcon(row.status)}</Text>
            </Box>
            <Box width={colW.cpu} paddingX={1}>
              <Text>
                <Text color={cpuColor(row.cpu)}>{"█".repeat(cpuBars)}</Text>
                <Text color="#313244">{"░".repeat(8 - cpuBars)}</Text>
                <Text bold color={cpuColor(row.cpu)}>
                  {" "}
                  {String(row.cpu).padStart(2)}
                </Text>
              </Text>
            </Box>
            <Box width={colW.mem} paddingX={1}>
              <Text color={isSelected ? "#cdd6f4" : "#6c7086"}>{row.mem}</Text>
            </Box>
          </Box>
        );
      })}

      <KeyHints hints="↑↓ select row" />
    </Box>
  );
}

// ============================================================================
// 6. DevToolsShowcase — tailspin-inspired log viewer
// ============================================================================

interface LogEntry {
  time: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
}

const ALL_LOGS: LogEntry[] = [
  { time: "14:23:01", level: "INFO", message: "Server started on port 3000" },
  { time: "14:23:02", level: "INFO", message: 'Database connection to "primary" established' },
  { time: "14:23:05", level: "DEBUG", message: "Loading config from /etc/app/config.toml" },
  { time: "14:23:08", level: "WARN", message: "Cache miss ratio above threshold (42%)" },
  {
    time: "14:23:12",
    level: "ERROR",
    message: "Failed to connect to Redis: ECONNREFUSED at /var/run/redis.sock",
  },
  { time: "14:23:15", level: "INFO", message: 'Retry succeeded: Redis "default" connected' },
  { time: "14:23:18", level: "INFO", message: "Worker pool initialized (4 threads)" },
  { time: "14:23:22", level: "WARN", message: 'Deprecated API "v1" endpoint called by client' },
  { time: "14:23:25", level: "DEBUG", message: "GC pause: 12ms (minor collection)" },
  { time: "14:23:30", level: "ERROR", message: "Timeout: /api/analytics took 5200ms" },
  { time: "14:23:33", level: "INFO", message: "Health check: all services green" },
  { time: "14:23:38", level: "INFO", message: 'Request processed: 200 OK (23ms) for "/api/users"' },
];

const levelColors: Record<string, string> = {
  INFO: "#a6e3a1",
  WARN: "#f9e2af",
  ERROR: "#f38ba8",
  DEBUG: "#89b4fa",
};

const levelBg: Record<string, string> = {
  ERROR: "#302020",
  WARN: "#302a1a",
};

/** Render message with colored quoted strings and underlined paths */
function LogMessage({ text, query }: { text: string; query: string }): JSX.Element {
  // Split on quoted strings and paths
  const parts: JSX.Element[] = [];
  const regex = /("(?:[^"\\]|\\.)*")|(\/([\w./-]+))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`t${lastIndex}`} color="#cdd6f4">
          {text.slice(lastIndex, match.index)}
        </Text>,
      );
    }
    if (match[1]) {
      // Quoted string — green
      parts.push(
        <Text key={`q${match.index}`} color="#a6e3a1">
          {match[1]}
        </Text>,
      );
    } else if (match[2]) {
      // Path — underline
      parts.push(
        <Text key={`p${match.index}`} color="#94e2d5" underline>
          {match[2]}
        </Text>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`e${lastIndex}`} color="#cdd6f4">
        {text.slice(lastIndex)}
      </Text>,
    );
  }

  // If there's an active query, we wrap matching segments with inverse
  if (query) {
    // Simple approach: highlight in the plain text segments
    const highlighted: JSX.Element[] = [];
    for (const part of parts) {
      const props = part.props as { color?: string; underline?: boolean; children: string };
      const content = props.children;
      if (typeof content !== "string") {
        highlighted.push(part);
        continue;
      }
      const lc = content.toLowerCase();
      const qi = lc.indexOf(query);
      if (qi === -1) {
        highlighted.push(part);
      } else {
        const key = part.key as string;
        highlighted.push(
          <Text key={key}>
            <Text color={props.color}>{content.slice(0, qi)}</Text>
            <Text inverse color="#f9e2af">
              {content.slice(qi, qi + query.length)}
            </Text>
            <Text color={props.color}>{content.slice(qi + query.length)}</Text>
          </Text>,
        );
      }
    }
    return <Text wrap="truncate">{highlighted}</Text>;
  }

  return <Text wrap="truncate">{parts}</Text>;
}

function DevToolsShowcase(): JSX.Element {
  const [typedQuery, setTypedQuery] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);

  useInput((input, key) => {
    if (input) {
      setTypedQuery((q) => q + input);
      setScrollOffset(0);
    }
    if (key.backspace) {
      setTypedQuery((q) => q.slice(0, -1));
      setScrollOffset(0);
    }
    if (key.escape) {
      setTypedQuery("");
      setScrollOffset(0);
    }
    if (key.upArrow) setScrollOffset((o) => Math.max(0, o - 1));
    if (key.downArrow) setScrollOffset((o) => o + 1);
  });

  const query = typedQuery.toLowerCase();
  const filtered = query
    ? ALL_LOGS.filter(
        (l) => l.message.toLowerCase().includes(query) || l.level.toLowerCase().includes(query),
      )
    : ALL_LOGS;

  const maxVisible = 10;
  const maxOffset = Math.max(0, filtered.length - maxVisible);
  const clampedOffset = Math.min(scrollOffset, maxOffset);
  const visibleLogs = filtered.slice(clampedOffset, clampedOffset + maxVisible);

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text>
          <Text bold color="#cdd6f4">
            Log Viewer
          </Text>
          <Text color="#6c7086"> — {filtered.length} entries</Text>
        </Text>
      </Box>

      {/* Search box */}
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={typedQuery ? "#f9e2af" : "#45475a"}
        paddingX={1}
        marginBottom={1}
      >
        <Text color="#89dceb">/ </Text>
        <Text color="#cdd6f4">{typedQuery}</Text>
        <Text color="#89dceb">▋</Text>
      </Box>

      {/* Log entries */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleLogs.map((log, i) => (
          <Box
            key={clampedOffset + i}
            flexDirection="row"
            gap={1}
            backgroundColor={levelBg[log.level]}
          >
            <Text color="#94e2d5">{log.time}</Text>
            <Box width={7} backgroundColor={levelBg[log.level]}>
              <Text bold color={levelColors[log.level]}>
                {log.level.padEnd(5)}
              </Text>
            </Box>
            <LogMessage text={log.message} query={query} />
          </Box>
        ))}
      </Box>

      <KeyHints hints="type to filter  Esc clear  ↑↓ scroll" />
    </Box>
  );
}

// ============================================================================
// 7. ScrollShowcase
// ============================================================================

function ScrollShowcase(): JSX.Element {
  const [scrollPos, setScrollPos] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const visibleCount = 10;

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIdx((idx) => {
        const newIdx = Math.max(0, idx - 1);
        setScrollPos((p) => (newIdx < p ? newIdx : p));
        return newIdx;
      });
    }
    if (key.downArrow) {
      setSelectedIdx((idx) => {
        const newIdx = Math.min(29, idx + 1);
        setScrollPos((p) => (newIdx >= p + visibleCount ? newIdx - visibleCount + 1 : p));
        return newIdx;
      });
    }
  });

  // Click to select item
  useMouseClick(({ y }) => {
    // Header area: 1 padding + 1 border-top = row 2 is first item
    const itemY = y - 2;
    if (itemY >= 0 && itemY < visibleCount) {
      setSelectedIdx(scrollPos + itemY);
    }
  });

  const items = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`);
  const visible = items.slice(scrollPos, scrollPos + visibleCount);

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" borderStyle="single" borderColor="#444">
        {visible.map((item, i) => {
          const globalIdx = scrollPos + i;
          const isSelected = globalIdx === selectedIdx;
          return (
            <Box key={globalIdx} paddingX={1}>
              <Text bold={isSelected} color={isSelected ? "cyan" : "white"}>
                {isSelected ? "▸ " : "  "}
                {item}
              </Text>
            </Box>
          );
        })}
      </Box>

      <KeyHints hints="↑↓ navigate  click to select" />
    </Box>
  );
}

// ============================================================================
// 8. LayoutFeedbackShowcase
// ============================================================================

function LayoutFeedbackShowcase(): JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <SizedPanel />
      <KeyHints hints="resize browser to see dimensions change" />
    </Box>
  );
}

function SizedPanel(): JSX.Element {
  const { width, height } = useContentRect();

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
    >
      <Text>
        Width: {width} Height: {height}
      </Text>
    </Box>
  );
}

// ============================================================================
// 9. FocusShowcase
// ============================================================================

function FocusShowcase(): JSX.Element {
  const [focusedPanel, setFocusedPanel] = useState(0);
  const { width } = useContentRect();

  useInput((_input, key) => {
    if (key.tab) {
      setFocusedPanel((p) => (p + 1) % 3);
    }
  });

  // Click to focus panel
  useMouseClick(({ x }) => {
    const contentWidth = (width || 80) - 2; // subtract padding
    const panelWidth = Math.floor((contentWidth - 2) / 3); // 3 panels with 2 gaps
    const panelIdx = Math.min(2, Math.max(0, Math.floor((x - 1) / (panelWidth + 1))));
    setFocusedPanel(panelIdx);
  });

  const labels = ["Panel A", "Panel B", "Panel C"];

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" gap={1}>
        {labels.map((label, i) => {
          const isFocused = i === focusedPanel;
          return (
            <Box
              key={label}
              flexDirection="column"
              flexGrow={1}
              borderStyle="single"
              borderColor={isFocused ? "cyan" : "#444"}
              paddingX={1}
              paddingY={1}
            >
              <Text bold color={isFocused ? "cyan" : "white"}>
                {label}
              </Text>
              <Text color={isFocused ? "cyan" : "#666"}>{isFocused ? "● focused" : "○"}</Text>
            </Box>
          );
        })}
      </Box>

      <KeyHints hints="Tab cycle panels  click to focus" />
    </Box>
  );
}

// ============================================================================
// 10. TextInputShowcase
// ============================================================================

function TextInputShowcase(): JSX.Element {
  const [text, setText] = useState("");
  const termFocused = useTermFocused();

  useInput((input, key) => {
    if (input) {
      setText((t) => t + input);
    }
    if (key.backspace) {
      setText((t) => t.slice(0, -1));
    }
    if (key.escape) {
      setText("");
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        flexDirection="row"
        borderStyle={termFocused ? "double" : "round"}
        borderColor={termFocused ? "#89b4fa" : "#313244"}
        paddingX={1}
      >
        <Text color={termFocused ? "#89b4fa" : "#585b70"}>&gt; </Text>
        <Text color="#cdd6f4">{text}</Text>
        <Text color="#89b4fa">{termFocused ? "▋" : " "}</Text>
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text color="#6c7086">Echo: {text || "(empty)"}</Text>
      </Box>

      <KeyHints hints={termFocused ? "type text  Backspace delete  Esc clear" : "click to focus"} />
    </Box>
  );
}

// ============================================================================
// 11. ThemeExplorerShowcase — browse built-in color palettes
// ============================================================================

const PALETTE_NAMES = [
  "catppuccin-mocha",
  "catppuccin-latte",
  "nord",
  "dracula",
  "tokyo-night",
  "gruvbox-dark",
  "gruvbox-light",
  "rose-pine",
  "solarized-dark",
  "solarized-light",
  "kanagawa-wave",
  "everforest-dark",
  "one-dark",
  "monokai",
];

const ANSI_LABELS = ["red", "green", "yellow", "blue", "magenta", "cyan"] as const;
const BRIGHT_LABELS = [
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
] as const;

function ColorSwatch({ color, label }: { color: string; label?: string }): JSX.Element {
  return (
    <Box backgroundColor={color} paddingX={1}>
      <Text color={contrastText(color)}>{label || "  "}</Text>
    </Box>
  );
}

/** Simple contrast: use black text on light backgrounds, white on dark. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

function PaletteCard({
  palette,
  isSelected,
}: {
  palette: ColorPalette;
  isSelected: boolean;
}): JSX.Element {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isSelected ? "#89b4fa" : "#444"}
      width={36}
    >
      {/* Header with palette name */}
      <Box backgroundColor={palette.background} paddingX={1}>
        <Text color={palette.foreground} bold={isSelected}>
          {isSelected ? "▸ " : "  "}
          {palette.name || "unnamed"}
        </Text>
        <Text color={palette.foreground}> {palette.dark ? "dark" : "light"}</Text>
      </Box>

      {/* Normal ANSI colors row */}
      <Box flexDirection="row" backgroundColor={palette.background}>
        <Box paddingX={1}>
          <Text color={palette.foreground}> </Text>
        </Box>
        {ANSI_LABELS.map((name) => (
          <ColorSwatch key={name} color={(palette as Record<string, string>)[name]!} />
        ))}
      </Box>

      {/* Bright ANSI colors row */}
      <Box flexDirection="row" backgroundColor={palette.background}>
        <Box paddingX={1}>
          <Text color={palette.foreground}> </Text>
        </Box>
        {BRIGHT_LABELS.map((name) => (
          <ColorSwatch key={name} color={(palette as Record<string, string>)[name]!} />
        ))}
      </Box>

      {/* Sample text preview */}
      <Box backgroundColor={palette.background} paddingX={1} flexDirection="row" gap={1}>
        <Text color={palette.foreground}>text</Text>
        <Text color={palette.red}>err</Text>
        <Text color={palette.green}>ok</Text>
        <Text color={palette.yellow}>warn</Text>
        <Text color={palette.blue}>info</Text>
      </Box>
    </Box>
  );
}

function ThemeExplorerShowcase(): JSX.Element {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const { width, height } = useContentRect();

  useInput((_input, key) => {
    if (key.downArrow) {
      setSelectedIdx((i) => Math.min(i + 1, PALETTE_NAMES.length - 1));
    }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(i - 1, 0));
    }
  });

  useMouseClick(({ y }) => {
    // Each card is ~6 rows tall. Account for 1-row padding at top.
    const cardHeight = 6;
    const idx = Math.floor((y - 1) / cardHeight);
    if (idx >= 0 && idx < PALETTE_NAMES.length) {
      setSelectedIdx(idx);
    }
  });

  // Determine layout: 2-column if wide enough, 1-column otherwise
  const twoCol = (width || 80) >= 74;
  const contentHeight = (height || 24) - 3; // padding + key hints
  const cardsPerCol = twoCol ? Math.floor(contentHeight / 6) : Math.floor(contentHeight / 6);

  // Scroll to keep selected visible
  const totalVisible = twoCol ? cardsPerCol * 2 : cardsPerCol;
  const scrollOffset = Math.max(0, selectedIdx - totalVisible + 1);
  const visiblePalettes = PALETTE_NAMES.slice(scrollOffset, scrollOffset + totalVisible);

  // Split into columns
  const col1 = twoCol ? visiblePalettes.slice(0, cardsPerCol) : visiblePalettes;
  const col2 = twoCol ? visiblePalettes.slice(cardsPerCol) : [];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="#89b4fa">
          Theme Explorer
        </Text>
        <Text color="#6c7086"> — {PALETTE_NAMES.length} palettes from @silvery/theme</Text>
      </Box>

      <Box flexDirection="row" gap={1} flexGrow={1}>
        <Box flexDirection="column" gap={0}>
          {col1.map((name) => {
            const palette = builtinPalettes[name]!;
            const globalIdx = PALETTE_NAMES.indexOf(name);
            return (
              <PaletteCard key={name} palette={palette} isSelected={globalIdx === selectedIdx} />
            );
          })}
        </Box>
        {twoCol && col2.length > 0 && (
          <Box flexDirection="column" gap={0}>
            {col2.map((name) => {
              const palette = builtinPalettes[name]!;
              const globalIdx = PALETTE_NAMES.indexOf(name);
              return (
                <PaletteCard key={name} palette={palette} isSelected={globalIdx === selectedIdx} />
              );
            })}
          </Box>
        )}
      </Box>

      <KeyHints hints="↑↓ browse palettes  click to select" />
    </Box>
  );
}

// ============================================================================
// Exports
// ============================================================================

export const SHOWCASES: Record<string, () => JSX.Element> = {
  dashboard: DashboardShowcase,
  "coding-agent": CodingAgentShowcase,
  kanban: KanbanShowcase,
  "cli-wizard": CLIWizardShowcase,
  "dev-tools": DevToolsShowcase,
  "data-explorer": DataExplorerShowcase,
  scroll: ScrollShowcase,
  "layout-feedback": LayoutFeedbackShowcase,
  focus: FocusShowcase,
  "text-input": TextInputShowcase,
  "theme-explorer": ThemeExplorerShowcase,
};
