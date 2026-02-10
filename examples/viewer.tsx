/**
 * inkx Examples Viewer
 *
 * Storybook-style TUI for browsing and running inkx examples.
 * Left: nav sidebar. Right: tabbed content (View / Source).
 *
 * Usage: bun examples   (or: bun examples/viewer.tsx)
 *
 * Controls:
 *   j/k or arrows  - Navigate examples
 *   Tab             - Toggle View / Source tab
 *   Enter           - Run selected example standalone
 *   q/Escape        - Quit
 */

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { readFileSync } from "node:fs"
import {
  render,
  renderStatic,
  Box,
  Text,
  useInput,
  useApp,
  useContentRect,
  createTerm,
  type Key,
} from "../src/index.js"

// =============================================================================
// Example Registry
// =============================================================================

interface Example {
  name: string
  file: string
  description: string
  category: string
  /** Export name of the main component (enables live preview) */
  component?: string
}

const examples: Example[] = [
  {
    name: "Dashboard",
    file: "dashboard/index.tsx",
    description: "Multi-pane dashboard with flexGrow columns and keyboard navigation",
    category: "Layout",
    component: "Dashboard",
  },
  {
    name: "Overflow Test",
    file: "test-overflow/index.tsx",
    description: 'overflow="hidden" content clipping test case',
    category: "Layout",
    component: "OverflowApp",
  },
  {
    name: "Kanban Board",
    file: "kanban/index.tsx",
    description: "3-column kanban with card movement and independent scroll",
    category: "Interactive",
    component: "KanbanBoard",
  },
  {
    name: "Task List",
    file: "task-list/index.tsx",
    description: "Scrollable list with priority badges, toggles, and expandable subtasks",
    category: "Interactive",
    component: "TaskList",
  },
  {
    name: "Scroll",
    file: "scroll/index.tsx",
    description: 'Native overflow="scroll" with automatic scroll-to-selected',
    category: "Interactive",
    component: "ScrollExample",
  },
  {
    name: "Search Filter",
    file: "search-filter/index.tsx",
    description: "useTransition + useDeferredValue for responsive concurrent search",
    category: "Interactive",
    component: "SearchApp",
  },
  {
    name: "Async Data",
    file: "async-data/index.tsx",
    description: "React Suspense with independent data sources and error boundaries",
    category: "Interactive",
    // No preview: Suspense + async use() requires full reconciler event loop
  },
  {
    name: "Layout Ref",
    file: "layout-ref/index.tsx",
    description: "useContentRect + useScreenRect for imperative layout measurement",
    category: "Interactive",
    component: "LayoutRefApp",
  },
  {
    name: "Todo App",
    file: "app-todo.tsx",
    description: "Layer 3: createApp() with Zustand store for shared state",
    category: "Interactive",
  },
  {
    name: "Hello Runtime",
    file: "hello-runtime.tsx",
    description: "Simplest Layer 1 API: createRuntime(), layout(), Symbol.dispose",
    category: "Runtime",
  },
  {
    name: "Runtime Counter",
    file: "runtime-counter.tsx",
    description: "Layer 1 event loop: events() AsyncIterable + schedule()",
    category: "Runtime",
  },
  {
    name: "Run Counter",
    file: "run-counter.tsx",
    description: "Layer 2: run() with React hooks and useRuntimeInput",
    category: "Runtime",
  },
  {
    name: "Elm Counter",
    file: "mode3-counter.tsx",
    description: "Pure functional Elm-style: reducer + view, no hooks",
    category: "Runtime",
  },
  {
    name: "Inline Simple",
    file: "inline-simple.tsx",
    description: "Inline rendering from current cursor position",
    category: "Inline",
  },
  {
    name: "Inline Progress",
    file: "inline-progress.tsx",
    description: "Inline progress bar updating in place",
    category: "Inline",
  },
  {
    name: "Scrollback",
    file: "scrollback/index.tsx",
    description: "Scrollback mode with build pipeline progress",
    category: "Inline",
    component: "Pipeline",
  },
  {
    name: "Non-TTY Mode",
    file: "inline-nontty.tsx",
    description: "Graceful degradation for pipes, CI, and TERM=dumb",
    category: "Inline",
  },
]

const CATEGORY_COLOR: Record<string, string> = {
  Layout: "magenta",
  Interactive: "cyan",
  Runtime: "green",
  Inline: "yellow",
}

// =============================================================================
// Syntax Highlighting
// =============================================================================

const KEYWORDS = new Set([
  "import", "from", "export", "default", "function", "const", "let", "var",
  "return", "if", "else", "for", "while", "switch", "case", "break",
  "new", "typeof", "instanceof", "async", "await", "yield", "class",
  "extends", "implements", "interface", "type", "enum", "true", "false",
  "null", "undefined", "this", "super", "of", "in", "as", "using",
])

const REACT_KEYWORDS = new Set([
  "useState", "useEffect", "useCallback", "useMemo", "useRef",
  "useInput", "useApp", "useTerm", "useContentRect", "useScrollback",
])

function highlightLine(line: string): React.ReactNode {
  if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*") || line.trimStart().startsWith("/*")) {
    return <Text dim color="gray">{line}</Text>
  }

  const parts: React.ReactNode[] = []
  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?[A-Z]\w*)|(\b[a-zA-Z_]\w*\b)|(\s+)|([^\s"'`<\w]+)/g
  let match: RegExpExecArray | null
  let i = 0

  while ((match = regex.exec(line)) !== null) {
    const [full, str, jsxTag, word] = match
    if (str) {
      parts.push(<Text key={i++} color="green">{str}</Text>)
    } else if (jsxTag) {
      parts.push(<Text key={i++} color="cyan">{jsxTag}</Text>)
    } else if (word && KEYWORDS.has(word)) {
      parts.push(<Text key={i++} color="magenta" bold>{word}</Text>)
    } else if (word && REACT_KEYWORDS.has(word)) {
      parts.push(<Text key={i++} color="yellow">{word}</Text>)
    } else {
      parts.push(<Text key={i++}>{full}</Text>)
    }
  }

  return parts.length > 0 ? <>{parts}</> : <Text>{line}</Text>
}

// =============================================================================
// Components
// =============================================================================

function Sidebar({
  cursor,
}: {
  cursor: number
}) {
  const { groups, scrollToChild } = useMemo(() => {
    const result: { category: string; items: { example: Example; globalIdx: number }[] }[] = []
    let currentCat = ""
    let childIdx = 0
    let targetChild = 0

    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i]!
      if (ex.category !== currentCat) {
        currentCat = ex.category
        result.push({ category: currentCat, items: [] })
        childIdx++
      }
      if (i === cursor) targetChild = childIdx
      result[result.length - 1]!.items.push({ example: ex, globalIdx: i })
      childIdx++
    }
    return { groups: result, scrollToChild: targetChild }
  }, [cursor])

  return (
    <Box
      flexDirection="column"
      width={28}
      borderStyle="round"
      borderColor="gray"
      overflow="scroll"
      scrollTo={scrollToChild}
    >
      {groups.map((group) => (
        <React.Fragment key={group.category}>
          <Box paddingX={1}>
            <Text bold color={CATEGORY_COLOR[group.category] ?? "white"} dim>
              {group.category}
            </Text>
          </Box>
          {group.items.map(({ example, globalIdx }) => {
            const selected = globalIdx === cursor
            return (
              <Box
                key={example.name}
                paddingX={1}
                backgroundColor={selected ? "cyan" : undefined}
              >
                <Text
                  color={selected ? "white" : "white"}
                  bold={selected}
                  wrap="truncate"
                >
                  {selected ? "\u25B8 " : "  "}{example.name}
                </Text>
              </Box>
            )
          })}
        </React.Fragment>
      ))}
    </Box>
  )
}

/** Pad content lines to fill the full height — prevents stale pixel artifacts
 *  from the incremental renderer when switching between previews of different heights. */
function padLines(contentLines: string[], totalHeight: number): string[] {
  if (contentLines.length >= totalHeight) return contentLines.slice(0, totalHeight)
  return [...contentLines, ...Array<string>(totalHeight - contentLines.length).fill("")]
}

function Preview({ example }: { example: Example }) {
  const { width, height } = useContentRect()
  const [lines, setLines] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLines(null)
    setError(null)

    if (!example.component) {
      setError("no-component")
      return
    }

    // Wait for layout dimensions
    if (width === 0 || height === 0) return

    let cancelled = false
    const path = new URL(example.file, import.meta.url).pathname

    import(path)
      .then(async (mod: Record<string, unknown>) => {
        if (cancelled) return
        const Comp = mod[example.component!] as React.ComponentType | undefined
        if (!Comp) {
          setError(`Export "${example.component}" not found`)
          return
        }

        // Render in sandboxed static mode — useInput becomes a no-op,
        // useApp gets a stub exit(), no terminal needed
        const output = await renderStatic(React.createElement(Comp), {
          width,
          height,
          plain: true,
        })
        if (!cancelled) setLines(output.split("\n"))
        return undefined
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || String(e))
      })

    return () => { cancelled = true }
  }, [example.file, example.component, width, height])

  // All paths pad to full height to clear stale pixels from prior previews
  const renderLines = (contentLines: string[]) => (
    <Box flexDirection="column" flexGrow={1}>
      {padLines(contentLines, height).map((line, i) => (
        <Text key={i} wrap="truncate">{line}</Text>
      ))}
    </Box>
  )

  if (error === "no-component") {
    return renderLines([
      "",
      ` ${example.name}`,
      ` ${example.description}`,
      "",
      " No live preview — uses non-React API.",
      " Press Enter to run standalone.",
    ])
  }

  if (error) {
    return renderLines([
      "",
      ` ${example.name}`,
      "",
      ` Error: ${error}`,
    ])
  }

  if (!lines) {
    return renderLines([
      "",
      ` ${example.name}`,
      "",
      " Loading preview...",
    ])
  }

  return renderLines(lines)
}

function SourceCode({ example }: { example: Example }) {
  const lines = useMemo(() => {
    try {
      const path = new URL(example.file, import.meta.url).pathname
      return readFileSync(path, "utf-8").split("\n")
    } catch {
      return ["// Could not load file"]
    }
  }, [example.file])

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {lines.map((line, i) => (
        <Text key={i} wrap="truncate">
          <Text dim color="gray">{String(i + 1).padStart(3)} </Text>
          {highlightLine(line)}
        </Text>
      ))}
    </Box>
  )
}

function Viewer() {
  const { exit } = useApp()
  const [cursor, setCursor] = useState(0)
  const [tab, setTab] = useState<"view" | "source">("view")
  const [running, setRunning] = useState<string | null>(null)

  const maxCursor = examples.length - 1
  const selected = examples[cursor]!

  const runExample = useCallback(
    (idx: number) => {
      const example = examples[idx]
      if (!example) return
      setRunning(example.name)
      exit()

      const file = new URL(example.file, import.meta.url).pathname
      const proc = Bun.spawn(["bun", "run", file], {
        stdio: ["inherit", "inherit", "inherit"],
      })
      void proc.exited.then(() => process.exit(0))
    },
    [exit],
  )

  useInput((input: string, key: Key) => {
    if (running) return

    if (input === "q" || key.escape) {
      exit()
      return
    }

    if (key.tab) {
      setTab((t) => (t === "view" ? "source" : "view"))
      return
    }

    if (key.downArrow || input === "j") {
      setCursor((prev) => Math.min(maxCursor, prev + 1))
    }
    if (key.upArrow || input === "k") {
      setCursor((prev) => Math.max(0, prev - 1))
    }
    if (key.home || input === "g") {
      setCursor(0)
    }
    if (key.end || input === "G") {
      setCursor(maxCursor)
    }
    if (key.return) {
      runExample(cursor)
    }
  })

  if (running) {
    return (
      <Box padding={1}>
        <Text dim>Launching {running}...</Text>
      </Box>
    )
  }

  const runLabel = selected.category === "Inline" || selected.category === "Runtime"
    ? "run"
    : "run interactive"

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Text>
        <Text bold color="yellow">{" inkx"}</Text>
        <Text dim> examples </Text>
        <Text dim>({cursor + 1}/{examples.length})</Text>
      </Text>

      {/* Main: sidebar + content */}
      <Box flexDirection="row" flexGrow={1} gap={1}>
        <Sidebar cursor={cursor} />

        {/* Content area with tabs */}
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" overflow="hidden">
          {/* Tab bar */}
          <Box paddingX={1}>
            <Text>
              <Text bold={tab === "view"} color={tab === "view" ? "cyan" : undefined} dim={tab !== "view"}>
                View
              </Text>
              <Text>  </Text>
              <Text bold={tab === "source"} color={tab === "source" ? "cyan" : undefined} dim={tab !== "source"}>
                Source
              </Text>
              <Text dim>  {selected.name}</Text>
            </Text>
          </Box>

          {/* Tab content — key forces full teardown on example switch */}
          {tab === "view" ? (
            <Box key={selected.file} flexDirection="column" flexGrow={1} overflow="hidden">
              <Preview example={selected} />
            </Box>
          ) : (
            <SourceCode key={selected.file} example={selected} />
          )}
        </Box>
      </Box>

      {/* Bottom bar */}
      <Text>
        <Text dim>{" "}</Text>
        <Text bold dim>j</Text><Text dim>/</Text><Text bold dim>k</Text>
        <Text dim> navigate  </Text>
        <Text bold dim>Tab</Text>
        <Text dim> {tab === "view" ? "source" : "view"}  </Text>
        <Text bold dim>Enter</Text>
        <Text dim> {runLabel}  </Text>
        <Text bold dim>q</Text>
        <Text dim> quit</Text>
      </Text>
    </Box>
  )
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(<Viewer />, term)
  await waitUntilExit()
}

main().catch(console.error)
