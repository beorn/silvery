/**
 * silvery Examples Viewer
 *
 * Storybook-style TUI for browsing and running silvery examples.
 * Left: nav sidebar. Right: tabbed content (View / Source).
 *
 * Examples are auto-discovered from category directories (layout/, interactive/,
 * runtime/, inline/). Each example exports a `meta` object with name and description.
 * Category is inferred from the directory name.
 *
 * Usage: bun examples   (or: bun examples/viewer.tsx)
 *
 * Controls:
 *   j/k or arrows  - Navigate examples
 *   Ctrl+K          - Command palette (switch examples)
 *   s               - Settings (theme picker)
 *   Tab             - Toggle View / Source tab
 *   Enter           - Run selected example standalone
 *   q/Escape        - Quit
 */

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  render,
  renderStatic,
  Box,
  Text,
  Spacer,
  ThemeProvider,
  builtinThemes,
  useInput,
  useApp,
  useContentRect,
  createTerm,
  PickerDialog,
  type Key,
  type Theme,
} from "../src/index.js"

// Ctrl+K is the universal command palette shortcut in terminals
// (Cmd+K requires Kitty protocol which isn't always available)
const MOD_KEY = "Ctrl"

// =============================================================================
// Auto-Discovery
// =============================================================================

interface Example {
  name: string
  file: string
  description: string
  category: string
  /** Export name of the main component (enables live preview) */
  component?: string
  /** API features showcased */
  features?: string[]
}

const CATEGORY_DIRS = ["layout", "interactive", "runtime", "inline", "kitty"] as const

const CATEGORY_ORDER: Record<string, number> = {
  Layout: 0,
  Interactive: 1,
  Runtime: 2,
  Inline: 3,
  "Kitty Protocol": 4,
}

const CATEGORY_COLOR: Record<string, string> = {
  Layout: "magenta",
  Interactive: "cyan",
  Runtime: "green",
  Inline: "yellow",
  "Kitty Protocol": "blue",
}

async function discoverExamples(): Promise<Example[]> {
  const baseDir = new URL(".", import.meta.url).pathname
  const results: Example[] = []

  const CATEGORY_DISPLAY: Record<string, string> = { kitty: "Kitty Protocol" }

  for (const dir of CATEGORY_DIRS) {
    const category = CATEGORY_DISPLAY[dir] ?? dir.charAt(0).toUpperCase() + dir.slice(1)
    const dirPath = resolve(baseDir, dir)
    const files = [
      ...new Bun.Glob("*.tsx").scanSync({ cwd: dirPath }),
      ...new Bun.Glob("*/index.tsx").scanSync({ cwd: dirPath }),
    ]

    for (const file of files) {
      try {
        const mod = await import(resolve(dirPath, file))
        if (!mod.meta?.name || !mod.meta?.demo) continue

        // Find first exported function that isn't meta or default
        let component: string | undefined
        for (const [key, value] of Object.entries(mod)) {
          if (key === "meta" || key === "default") continue
          if (typeof value === "function") {
            component = key
            break
          }
        }

        results.push({
          name: mod.meta.name,
          description: mod.meta.description ?? "",
          file: `${dir}/${file}`,
          category,
          component,
          features: mod.meta.features,
        })
      } catch {
        // Skip files that fail to import
      }
    }
  }

  results.sort((a, b) => {
    const catDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
    if (catDiff !== 0) return catDiff
    return a.name.localeCompare(b.name)
  })

  return results
}

// =============================================================================
// Syntax Highlighting
// =============================================================================

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "function",
  "const",
  "let",
  "var",
  "return",
  "if",
  "else",
  "for",
  "while",
  "switch",
  "case",
  "break",
  "new",
  "typeof",
  "instanceof",
  "async",
  "await",
  "yield",
  "class",
  "extends",
  "implements",
  "interface",
  "type",
  "enum",
  "true",
  "false",
  "null",
  "undefined",
  "this",
  "super",
  "of",
  "in",
  "as",
  "using",
])

const REACT_KEYWORDS = new Set([
  "useState",
  "useEffect",
  "useCallback",
  "useMemo",
  "useRef",
  "useInput",
  "useApp",
  "useTerm",
  "useContentRect",
  "useScrollback",
])

function highlightLine(line: string): React.ReactNode {
  if (
    line.trimStart().startsWith("//") ||
    line.trimStart().startsWith("*") ||
    line.trimStart().startsWith("/*")
  ) {
    return (
      <Text dim color="gray">
        {line}
      </Text>
    )
  }

  const parts: React.ReactNode[] = []
  const regex =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?[A-Z]\w*)|(\b[a-zA-Z_]\w*\b)|(\s+)|([^\s"'`<\w]+)/g
  let match: RegExpExecArray | null
  let i = 0

  while ((match = regex.exec(line)) !== null) {
    const [full, str, jsxTag, word] = match
    if (str) {
      parts.push(
        <Text key={i++} color="green">
          {str}
        </Text>,
      )
    } else if (jsxTag) {
      parts.push(
        <Text key={i++} color="cyan">
          {jsxTag}
        </Text>,
      )
    } else if (word && KEYWORDS.has(word)) {
      parts.push(
        <Text key={i++} color="magenta" bold>
          {word}
        </Text>,
      )
    } else if (word && REACT_KEYWORDS.has(word)) {
      parts.push(
        <Text key={i++} color="yellow">
          {word}
        </Text>,
      )
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
  examples,
  cursor,
  theme,
}: {
  examples: Example[]
  cursor: number
  theme: Theme
}) {
  const { groups, scrollToChild } = useMemo(() => {
    const result: {
      category: string
      items: { example: Example; globalIdx: number }[]
    }[] = []
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
  }, [examples, cursor])

  return (
    <Box
      flexDirection="column"
      width={28}
      borderStyle="round"
      borderColor="$border"
      overflow="scroll"
      scrollTo={scrollToChild}
    >
      {groups.map((group) => (
        <React.Fragment key={group.category}>
          <Box paddingX={1}>
            <Text bold color={CATEGORY_COLOR[group.category] ?? "$text"} dim>
              {group.category}
            </Text>
          </Box>
          {group.items.map(({ example, globalIdx }) => {
            const selected = globalIdx === cursor
            return (
              <Box
                key={example.name}
                paddingX={1}
                backgroundColor={selected ? "$primary" : undefined}
              >
                <Text color={selected ? "$text" : "$text"} bold={selected} wrap="truncate">
                  {selected ? "\u25B8 " : "  "}
                  {example.name}
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

function Preview({ example, theme }: { example: Example; theme: Theme }) {
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
        // useApp gets a stub exit(), no terminal needed.
        // Wrap in ThemeProvider so previews pick up the active theme.
        const output = await renderStatic(
          React.createElement(ThemeProvider, { theme }, React.createElement(Comp)),
          {
            width,
            height,
          },
        )
        if (!cancelled) setLines(output.split("\n"))
        return undefined
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || String(e))
      })

    return () => {
      cancelled = true
    }
  }, [example.file, example.component, width, height])

  // All paths pad to full height to clear stale pixels from prior previews
  const renderLines = (contentLines: string[]) => (
    <Box flexDirection="column" flexGrow={1}>
      {padLines(contentLines, height).map((line, i) => (
        <Text key={i} wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  )

  if (error === "no-component") {
    return renderLines([
      "",
      " No live preview — uses non-React API.",
      " Press Enter to run standalone.",
    ])
  }

  if (error) {
    return renderLines(["", ` Error: ${error}`])
  }

  if (!lines) {
    return renderLines(["", " Loading preview..."])
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
          <Text dim color="gray">
            {String(i + 1).padStart(3)}{" "}
          </Text>
          {highlightLine(line)}
        </Text>
      ))}
    </Box>
  )
}

const THEME_NAMES = Object.keys(builtinThemes)

type Dialog = "none" | "command-palette" | "settings"

function Viewer({ examples }: { examples: Example[] }) {
  const { exit } = useApp()
  const [cursor, setCursor] = useState(0)
  const [tab, setTab] = useState<"view" | "source">("view")
  const [running, setRunning] = useState<string | null>(null)
  const [themeIdx, setThemeIdx] = useState(THEME_NAMES.indexOf("ansi16-dark"))
  const [dialog, setDialog] = useState<Dialog>("none")
  const [paletteQuery, setPaletteQuery] = useState("")
  const [themeQuery, setThemeQuery] = useState("")

  const theme = builtinThemes[THEME_NAMES[themeIdx]!]!
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
        env: { ...process.env, SILVERY_THEME: theme.name },
      })
      void proc.exited.then(() => process.exit(0))
    },
    [examples, exit, theme.name],
  )

  // --- Command palette items ---
  const paletteItems = useMemo(() => {
    const q = paletteQuery.toLowerCase()
    return examples
      .map((ex, idx) => ({ ...ex, idx }))
      .filter(
        (ex) => !q || ex.name.toLowerCase().includes(q) || ex.category.toLowerCase().includes(q),
      )
  }, [examples, paletteQuery])

  // --- Theme picker items ---
  const themeItems = useMemo(() => {
    const q = themeQuery.toLowerCase()
    return THEME_NAMES.filter((name) => !q || name.toLowerCase().includes(q))
  }, [themeQuery])

  useInput((input: string, key: Key) => {
    if (running || dialog !== "none") return

    if (input === "q" || key.escape) {
      exit()
      return
    }

    // Ctrl+K — command palette
    if (input === "k" && key.ctrl) {
      setPaletteQuery("")
      setDialog("command-palette")
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
    if (input === "s") {
      setThemeQuery("")
      setDialog("settings")
    }
  })

  if (running) {
    return (
      <ThemeProvider theme={theme}>
        <Box padding={1}>
          <Text color="$muted">Launching {running}...</Text>
        </Box>
      </ThemeProvider>
    )
  }

  // Derive URL key from file path (e.g., "interactive/kanban.tsx" → "kanban")
  const exampleKey = selected.file.replace(/^.*\//, "").replace(/\.tsx$/, "")

  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column" flexGrow={1}>
        {/* Header */}
        <Box paddingX={1}>
          <Text bold color="$warning">
            {" silvery"}
          </Text>
          <Text color="$muted"> examples </Text>
          <Text color="$muted">
            ({cursor + 1}/{examples.length})
          </Text>
          <Spacer />
          <Text color="$muted">
            theme:{" "}
            <Text color="$primary" bold>
              {theme.name}
            </Text>
          </Text>
        </Box>

        {/* Main: sidebar + content */}
        <Box flexDirection="row" flexGrow={1} gap={1}>
          <Sidebar examples={examples} cursor={cursor} theme={theme} />

          {/* Content area with tabs */}
          <Box
            flexDirection="column"
            flexGrow={1}
            borderStyle="round"
            borderColor="$border"
            overflow="hidden"
          >
            {/* Info banner */}
            <Box paddingX={1} flexDirection="column">
              <Text wrap="truncate">
                <Text bold color="$text">
                  {selected.name}
                </Text>
                <Text color="$muted"> — {selected.description}</Text>
              </Text>
              {selected.features && selected.features.length > 0 && (
                <Text color="$muted" wrap="truncate">
                  {selected.features.join(" · ")}
                </Text>
              )}
              <Text color="$muted" dim wrap="truncate">
                silvery.dev/examples/{exampleKey}
              </Text>
            </Box>

            {/* Tab bar */}
            <Box paddingX={1}>
              <Text>
                <Text bold={tab === "view"} color={tab === "view" ? "$primary" : "$muted"}>
                  View
                </Text>
                <Text color="$border"> | </Text>
                <Text bold={tab === "source"} color={tab === "source" ? "$primary" : "$muted"}>
                  Source
                </Text>
              </Text>
            </Box>

            {/* Tab content — key forces full teardown on example switch */}
            {tab === "view" ? (
              <Box key={selected.file} flexDirection="column" flexGrow={1} overflow="hidden">
                <Preview example={selected} theme={theme} />
              </Box>
            ) : (
              <SourceCode key={selected.file} example={selected} />
            )}
          </Box>
        </Box>

        {/* Bottom bar */}
        <Box paddingX={1}>
          <Text color="$muted">
            <Text bold>{MOD_KEY}-K</Text> switch <Text bold>s</Text> settings <Text bold>Tab</Text>{" "}
            {tab === "view" ? "source" : "view"} <Text bold>Enter</Text> run <Text bold>q</Text>{" "}
            quit
          </Text>
        </Box>

        {/* Command palette (Cmd-K) */}
        {dialog === "command-palette" && (
          <PickerDialog
            title="Switch Example"
            placeholder="Type to search..."
            items={paletteItems}
            renderItem={(item, sel) => (
              <Text color={sel ? "$primary" : "$text"} bold={sel}>
                <Text color="$muted" dim>
                  {item.category}
                  {" / "}
                </Text>
                {item.name}
              </Text>
            )}
            keyExtractor={(item) => item.file}
            onSelect={(item) => {
              setCursor(item.idx)
              setDialog("none")
            }}
            onCancel={() => setDialog("none")}
            onChange={setPaletteQuery}
          />
        )}

        {/* Settings / theme picker (s key) */}
        {dialog === "settings" && (
          <PickerDialog
            title="Theme"
            placeholder="Type to filter themes..."
            items={themeItems}
            renderItem={(name, sel) => {
              const t = builtinThemes[name]!
              return (
                <Text color={sel ? "$primary" : "$text"} bold={sel}>
                  {name === THEME_NAMES[themeIdx] ? "* " : "  "}
                  {name}
                  <Text color="$muted" dim>
                    {" "}
                    {t.dark ? "dark" : "light"}
                  </Text>
                </Text>
              )
            }}
            keyExtractor={(name) => name}
            onSelect={(name) => {
              setThemeIdx(THEME_NAMES.indexOf(name))
              setDialog("none")
            }}
            onCancel={() => setDialog("none")}
            onChange={setThemeQuery}
          />
        )}
      </Box>
    </ThemeProvider>
  )
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const examples = await discoverExamples()

  using term = createTerm()
  const { waitUntilExit } = await render(<Viewer examples={examples} />, term)
  await waitUntilExit()
}

main().catch(console.error)
