/**
 * Unified Web Viewer for Silvery Examples
 *
 * A DOM app (vanilla TypeScript, no React) that builds chrome around an xterm.js
 * terminal pane. Showcases run via renderToXterm() inside the terminal.
 *
 * Layout:
 *   Sidebar (220px) | Demo pane (flex) | Source pane (380px, collapsible)
 */

import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { renderToXterm } from "../../packages/term/src/xterm/index.js"
import { SHOWCASES } from "./showcases/index.js"
import { REGISTRY, type ExampleEntry } from "./viewer-registry.js"
import React from "react"

// =============================================================================
// Types
// =============================================================================

interface DemoEntry {
  id: string
  name: string
  description: string
  category: string
  features: string[]
  source: string
  component?: () => JSX.Element
}

interface Category {
  name: string
  color: string
  items: DemoEntry[]
}

const CATEGORY_CONFIG: Record<string, { color: string; order: number }> = {
  Showcases: { color: "#f9e2af", order: 0 },
  Layout: { color: "#cba6f7", order: 1 },
  Interactive: { color: "#89dceb", order: 2 },
  Runtime: { color: "#a6e3a1", order: 3 },
  Inline: { color: "#fab387", order: 4 },
}

function buildRegistry(): { categories: Category[]; allDemos: DemoEntry[] } {
  const allDemos: DemoEntry[] = []

  // Build a lookup from the auto-generated registry (keyed by showcase-<id>)
  const registryByKey = new Map<string, ExampleEntry>()
  for (const entry of REGISTRY) {
    registryByKey.set(entry.key, entry)
  }

  // Showcases: SHOWCASES registry provides components, REGISTRY provides metadata
  for (const [id, component] of Object.entries(SHOWCASES)) {
    const entry = registryByKey.get(`showcase-${id}`)
    allDemos.push({
      id,
      name: entry?.name ?? id,
      description: entry?.description ?? "",
      category: "Showcases",
      features: entry?.features ?? [],
      source: entry?.source ?? "",
      component: component as () => JSX.Element,
    })
  }

  // Non-showcase examples from the registry
  for (const entry of REGISTRY) {
    if (entry.type === "showcase") continue
    allDemos.push({
      id: entry.key,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      features: entry.features,
      source: entry.source,
    })
  }

  // Group by category
  const catMap = new Map<string, DemoEntry[]>()
  for (const demo of allDemos) {
    const list = catMap.get(demo.category) ?? []
    list.push(demo)
    catMap.set(demo.category, list)
  }

  const categories: Category[] = []
  for (const [name, items] of catMap) {
    categories.push({
      name,
      color: CATEGORY_CONFIG[name]?.color ?? "#cdd6f4",
      items,
    })
  }
  categories.sort((a, b) => (CATEGORY_CONFIG[a.name]?.order ?? 99) - (CATEGORY_CONFIG[b.name]?.order ?? 99))

  return { categories, allDemos }
}

// =============================================================================
// Syntax Highlighting (CSS class-based)
// =============================================================================

const KW = new Set([
  "import",
  "export",
  "from",
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
  "interface",
  "type",
  "enum",
  "true",
  "false",
  "null",
  "undefined",
  "as",
  "of",
  "in",
  "default",
  "using",
])

function highlightSource(code: string): string {
  return code
    .split("\n")
    .map((line, i) => {
      const num = `<span class="line-num">${String(i + 1).padStart(3)}</span> `
      const trimmed = line.trimStart()

      // Comment lines
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        return num + `<span class="hl-comment">${esc(line)}</span>`
      }

      // Token-by-token highlighting
      let result = ""
      const re =
        /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?[A-Z]\w*)|(\b[a-zA-Z_]\w*\b)|(:\s*)([A-Z]\w*)|([^\s"'`<\w]+|\s+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        const [full, str, jsxTag, word, colonSpace, typeName] = m
        if (str) {
          result += `<span class="hl-string">${esc(str)}</span>`
        } else if (jsxTag) {
          result += `<span class="hl-jsx">${esc(jsxTag)}</span>`
        } else if (word && KW.has(word)) {
          result += `<span class="hl-keyword">${esc(word)}</span>`
        } else if (colonSpace && typeName) {
          result += `<span class="hl-punct">${esc(colonSpace)}</span><span class="hl-type">${esc(typeName)}</span>`
        } else {
          result += esc(full!)
        }
      }

      return num + result
    })
    .join("\n")
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// =============================================================================
// DOM Builder
// =============================================================================

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") e.className = v
      else e.setAttribute(k, v)
    }
  }
  for (const child of children) {
    if (typeof child === "string") e.appendChild(document.createTextNode(child))
    else e.appendChild(child)
  }
  return e
}

// =============================================================================
// Main App
// =============================================================================

function createViewerApp(root: HTMLElement): void {
  const { categories, allDemos } = buildRegistry()
  if (allDemos.length === 0) {
    root.textContent = "No demos found."
    return
  }

  let selectedIdx = 0
  let sourceVisible = window.innerWidth >= 900
  let sidebarFocused = false
  let currentInstance: ReturnType<typeof renderToXterm> | null = null

  // ─── Inject styles ─────────────────────────────────────────────────
  const style = document.createElement("style")
  style.textContent = `
    /* Layout */
    #viewer-root { display: flex; flex-direction: column; width: 100%; height: 100%; }
    .vw-header { display: flex; align-items: center; padding: 8px 16px; background: #13132a; border-bottom: 1px solid #313244; min-height: 44px; gap: 12px; }
    .vw-header-brand { font-size: 18px; font-weight: 700; background: linear-gradient(135deg, #cba6f7, #89dceb); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.5px; }
    .vw-header-title { font-size: 14px; color: #a6adc8; flex-grow: 1; }
    .vw-header-badge { font-size: 12px; color: #89dceb; background: rgba(137, 220, 235, 0.1); padding: 2px 10px; border-radius: 10px; }
    .vw-body { display: flex; flex: 1; overflow: hidden; }

    /* Sidebar */
    .vw-sidebar { width: 220px; min-width: 220px; background: #13132a; border-right: 1px solid #313244; overflow-y: auto; padding: 8px 0; }
    .vw-sidebar::-webkit-scrollbar { width: 4px; }
    .vw-sidebar::-webkit-scrollbar-thumb { background: #45475a; border-radius: 2px; }
    .vw-cat-header { padding: 10px 16px 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; display: flex; align-items: center; gap: 8px; }
    .vw-cat-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
    .vw-item { padding: 6px 16px 6px 28px; cursor: pointer; font-size: 13px; color: #a6adc8; transition: background 0.1s, color 0.1s; border-left: 2px solid transparent; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .vw-item:hover { background: rgba(137, 220, 235, 0.05); color: #cdd6f4; }
    .vw-item.selected { background: rgba(137, 220, 235, 0.1); color: #89dceb; border-left-color: #89dceb; font-weight: 500; }

    /* Main pane */
    .vw-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .vw-term-wrap { flex: 1; position: relative; overflow: hidden; padding: 4px; }
    .vw-term-wrap .xterm { height: 100% !important; }
    .vw-info { padding: 8px 16px 6px; border-top: 1px solid #313244; }
    .vw-info-name { font-size: 14px; font-weight: 600; color: #cdd6f4; margin-bottom: 2px; display: inline; }
    .vw-info-desc { font-size: 12px; color: #6c7086; margin-bottom: 4px; display: inline; margin-left: 8px; }
    .vw-badges { display: flex; flex-wrap: wrap; gap: 4px; }
    .vw-badge { font-size: 11px; padding: 1px 8px; border-radius: 8px; background: rgba(137, 180, 250, 0.12); color: #89b4fa; }
    .vw-keyhints { font-size: 11px; color: #6c7086; margin-top: 6px; }
    .vw-keyhints kbd { background: #313244; padding: 1px 5px; border-radius: 3px; font-family: inherit; font-size: 10px; margin: 0 2px; }

    /* Source pane */
    .vw-source { width: 380px; min-width: 380px; background: #11111b; border-left: 1px solid #313244; display: flex; flex-direction: column; overflow: hidden; transition: width 0.2s, min-width 0.2s; }
    .vw-source.hidden { width: 0; min-width: 0; border-left: none; }
    .vw-source-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #313244; }
    .vw-source-title { font-size: 12px; font-weight: 600; color: #a6adc8; text-transform: uppercase; letter-spacing: 0.5px; }
    .vw-source-btn { background: #313244; border: none; color: #a6adc8; font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer; transition: background 0.15s; }
    .vw-source-btn:hover { background: #45475a; color: #cdd6f4; }
    .vw-source-code { flex: 1; overflow: auto; padding: 8px 0; }
    .vw-source-code::-webkit-scrollbar { width: 4px; }
    .vw-source-code::-webkit-scrollbar-thumb { background: #45475a; border-radius: 2px; }
    .vw-source-code pre { margin: 0; padding: 0 12px; font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, monospace; font-size: 12px; line-height: 1.6; color: #cdd6f4; white-space: pre; }
    .line-num { color: #45475a; user-select: none; }
    .hl-comment { color: #6c7086; font-style: italic; }
    .hl-string { color: #a6e3a1; }
    .hl-keyword { color: #cba6f7; }
    .hl-jsx { color: #f9e2af; }
    .hl-type { color: #89dceb; }
    .hl-punct { color: #6c7086; }

    /* Source toggle (small screens) */
    .vw-source-toggle { position: absolute; top: 8px; right: 8px; background: #313244; border: none; color: #a6adc8; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer; z-index: 10; display: none; }
    @media (max-width: 900px) {
      .vw-source-toggle { display: block; }
      .vw-source { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; box-shadow: -4px 0 20px rgba(0,0,0,0.5); }
    }
  `
  document.head.appendChild(style)

  // ─── Build DOM ─────────────────────────────────────────────────────

  // Header
  const header = el(
    "div",
    { className: "vw-header" },
    el("span", { className: "vw-header-brand" }, "silvery"),
    el("span", { className: "vw-header-title" }, "Interactive Examples"),
    el("span", { className: "vw-header-badge" }, `${allDemos.length} demos`),
  )

  // Sidebar
  const sidebar = el("div", { className: "vw-sidebar" })
  const sidebarItems: HTMLElement[] = []

  for (const cat of categories) {
    const catHeader = el("div", { className: "vw-cat-header" })
    const dot = el("span", { className: "vw-cat-dot" })
    dot.style.backgroundColor = cat.color
    catHeader.appendChild(dot)
    catHeader.appendChild(document.createTextNode(cat.name))
    sidebar.appendChild(catHeader)

    for (const demo of cat.items) {
      const idx = allDemos.indexOf(demo)
      const item = el("div", { className: "vw-item" }, demo.name)
      item.dataset.idx = String(idx)
      item.addEventListener("click", () => {
        selectDemo(idx)
        sidebarFocused = true
      })
      sidebar.appendChild(item)
      sidebarItems[idx] = item
    }
  }

  // Terminal pane
  const termWrap = el("div", { className: "vw-term-wrap" })
  const sourceToggle = el("button", { className: "vw-source-toggle" }, "Source")
  termWrap.appendChild(sourceToggle)

  // Info bar
  const infoDiv = el("div", { className: "vw-info" })
  const infoName = el("div", { className: "vw-info-name" })
  const infoDesc = el("div", { className: "vw-info-desc" })
  const badgesDiv = el("div", { className: "vw-badges" })
  const keyHints = el("div", { className: "vw-keyhints" })
  infoDiv.append(infoName, infoDesc, badgesDiv, keyHints)

  // Main pane
  const mainPane = el("div", { className: "vw-main" })
  mainPane.append(termWrap, infoDiv)

  // Source pane
  const sourcePane = el("div", { className: `vw-source${sourceVisible ? "" : " hidden"}` })
  const sourceHeader = el("div", { className: "vw-source-header" })
  const sourceTitle = el("span", { className: "vw-source-title" }, "Source")
  const copyBtn = el("button", { className: "vw-source-btn" }, "Copy")
  sourceHeader.append(sourceTitle, copyBtn)
  const sourceCodeWrap = el("div", { className: "vw-source-code" })
  const sourcePre = el("pre")
  sourceCodeWrap.appendChild(sourcePre)
  sourcePane.append(sourceHeader, sourceCodeWrap)

  // Body
  const body = el("div", { className: "vw-body" })
  body.append(sidebar, mainPane, sourcePane)

  // Root
  root.append(header, body)

  // ─── Terminal setup ────────────────────────────────────────────────
  const term = new Terminal({
    cursorBlink: false,
    convertEol: true,
    cols: 80,
    rows: 24,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
    fontSize: 14,
    theme: {
      background: "#0f0f1a",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      selectionBackground: "rgba(137, 220, 235, 0.25)",
    },
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(termWrap)
  fitAddon.fit()

  // Track sidebar vs terminal focus for keyboard routing
  term.textarea?.addEventListener("focus", () => {
    sidebarFocused = false
  })

  // Click terminal to focus it (unfocus sidebar)
  termWrap.addEventListener("click", () => {
    sidebarFocused = false
  })

  // ─── Selection logic ───────────────────────────────────────────────
  function selectDemo(idx: number): void {
    if (idx < 0 || idx >= allDemos.length) return
    const prev = selectedIdx
    selectedIdx = idx

    // Update sidebar highlight
    if (sidebarItems[prev]) sidebarItems[prev]!.classList.remove("selected")
    if (sidebarItems[idx]) {
      sidebarItems[idx]!.classList.add("selected")
      sidebarItems[idx]!.scrollIntoView({ block: "nearest" })
    }

    const demo = allDemos[idx]!

    // Update URL hash for deep linking (without triggering hashchange)
    history.replaceState(null, "", `#${demo.id}`)

    // Update info
    infoName.textContent = demo.name
    infoDesc.textContent = demo.description
    badgesDiv.innerHTML = ""
    for (const feat of demo.features) {
      badgesDiv.appendChild(el("span", { className: "vw-badge" }, feat))
    }

    // Key hints based on whether demo has component
    if (demo.component) {
      keyHints.innerHTML =
        "<kbd>j</kbd><kbd>k</kbd> navigate &nbsp; <kbd>Enter</kbd> select &nbsp; <kbd>s</kbd> toggle source &nbsp; Click terminal for keyboard input"
    } else {
      keyHints.innerHTML =
        "<kbd>j</kbd><kbd>k</kbd> navigate &nbsp; <kbd>s</kbd> toggle source &nbsp; Run in terminal: <code>bun run examples/...</code>"
    }

    // Update source pane
    sourcePre.innerHTML = highlightSource(demo.source)

    // Render demo in terminal
    renderDemo(demo)

    // Auto-focus terminal so keyboard input works immediately
    term.focus()
  }

  let pendingRenderFrame: number | null = null

  function renderDemo(demo: DemoEntry): void {
    // Cancel any pending deferred render from a previous switch
    if (pendingRenderFrame !== null) {
      cancelAnimationFrame(pendingRenderFrame)
      pendingRenderFrame = null
    }

    // Cleanup previous — unmount React tree, then fully reset xterm
    if (currentInstance) {
      currentInstance.unmount()
      currentInstance = null
    }
    // Full reset: clear scrollback + visible buffer, reset terminal state
    term.reset()

    // Defer new render by one frame — ensures any pending requestAnimationFrame
    // callbacks from the old demo's render scheduler have fired (and bailed via
    // their unmounted flag), and any queued xterm.write() calls have been processed.
    pendingRenderFrame = requestAnimationFrame(() => {
      pendingRenderFrame = null
      term.reset() // Clean slate after old async work drained

      if (!demo.component) {
        term.writeln("\r\n  This example requires a full terminal runtime.")
        term.writeln(`\r\n  Run: bun run examples/${demo.id}`)
        return
      }

      fitAddon.fit()
      currentInstance = renderToXterm(React.createElement(demo.component), term, {
        input: true, // enables useInput, useMouse, useTerminalFocused
        handleFocusCycling: false, // showcases handle Tab/Escape themselves
      })
    })
  }

  // ─── Copy button ───────────────────────────────────────────────────
  copyBtn.addEventListener("click", () => {
    const demo = allDemos[selectedIdx]
    if (!demo) return
    void navigator.clipboard.writeText(demo.source).then(() => {
      copyBtn.textContent = "Copied!"
      setTimeout(() => {
        copyBtn.textContent = "Copy"
      }, 1500)
      return undefined
    })
  })

  // ─── Source toggle ─────────────────────────────────────────────────
  function toggleSource(): void {
    sourceVisible = !sourceVisible
    sourcePane.classList.toggle("hidden", !sourceVisible)
    // Refit terminal after layout change
    requestAnimationFrame(() => {
      fitAddon.fit()
      if (currentInstance) currentInstance.refresh()
    })
  }

  sourceToggle.addEventListener("click", toggleSource)

  // ─── Keyboard navigation ──────────────────────────────────────────
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    // Only handle sidebar navigation when sidebar is focused or no terminal focus
    if (sidebarFocused || document.activeElement === document.body) {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        selectDemo(Math.min(allDemos.length - 1, selectedIdx + 1))
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        selectDemo(Math.max(0, selectedIdx - 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        sidebarFocused = false
        term.focus()
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault()
        toggleSource()
      }
    }
  })

  // Click sidebar to focus it
  sidebar.addEventListener("click", () => {
    sidebarFocused = true
  })

  // ─── Resize handling ───────────────────────────────────────────────
  window.addEventListener("resize", () => {
    fitAddon.fit()
    if (currentInstance) currentInstance.refresh()
  })

  // ─── Initial selection (from URL hash or default) ──────────────────
  const hashId = window.location.hash.slice(1)
  const hashIdx = hashId ? allDemos.findIndex((d) => d.id === hashId) : -1
  selectDemo(hashIdx >= 0 ? hashIdx : 0)

  // Handle browser back/forward navigation
  window.addEventListener("hashchange", () => {
    const id = window.location.hash.slice(1)
    const idx = allDemos.findIndex((d) => d.id === id)
    if (idx >= 0 && idx !== selectedIdx) selectDemo(idx)
  })

  // Signal ready to parent
  window.parent.postMessage({ type: "silvery-ready" }, "*")

  // Expose for debugging
  ;(window as any).silveryViewer = { term, allDemos, selectDemo }
}

// =============================================================================
// Boot
// =============================================================================

const root = document.getElementById("viewer-root")
if (root) {
  createViewerApp(root)
}
