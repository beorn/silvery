#!/usr/bin/env bun
/**
 * Build web examples
 *
 * Bundles the React apps for browser usage.
 * Run: bun run examples/web/build.ts
 */

import { mkdir, cp, readdir } from "node:fs/promises"
import { join, dirname } from "node:path"

const __dirname = dirname(new URL(import.meta.url).pathname)
const distDir = join(__dirname, "dist")
const docsDistDir = join(__dirname, "../../docs/public/examples/dist")

// Ensure dist directories exist
await mkdir(distDir, { recursive: true })
await mkdir(docsDistDir, { recursive: true })

// Browser-safe defines for Node.js globals.
// loggily and @silvery/ansi access process.env at module init,
// which throws ReferenceError in browsers where `process` is undefined.
const browserDefines: Record<string, string> = {
  "process.env.NODE_ENV": '"production"',
  "process.env.LOG_LEVEL": "undefined",
  "process.env.TRACE": "undefined",
  "process.env.TRACE_FORMAT": "undefined",
  "process.env.DEBUG": "undefined",
  "process.env.NO_COLOR": "undefined",
  "process.env.FORCE_COLOR": "undefined",
  "process.env.TERM": "undefined",
  "process.env.TERM_PROGRAM": "undefined",
  "process.env.COLORTERM": "undefined",
  "process.env.CI": "undefined",
  "process.env.GITHUB_ACTIONS": "undefined",
  "process.env.KITTY_WINDOW_ID": "undefined",
  "process.env.WT_SESSION": "undefined",
  "process.env.LANG": "undefined",
  "process.env.LC_ALL": "undefined",
  "process.env.LC_CTYPE": "undefined",
}

// Browser process shim — ansi/logger access process.stdout, process.stdin,
// process.stderr, and dynamic process.env[key] at module init.
// The `define` map above handles static process.env.KEY references, but
// process.stdout/stdin/stderr and process.env[dynamic] need a real object.
const processShim = `
// Polyfill Symbol.dispose for Safari and older browsers that lack
// TC39 Explicit Resource Management. Bun's __using helper uses a
// polyfilled __dispose, but property definitions like [Symbol.dispose]
// need the global symbol to exist.
Symbol.dispose ??= Symbol.for("Symbol.dispose");
Symbol.asyncDispose ??= Symbol.for("Symbol.asyncDispose");
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: { NODE_ENV: "production" },
    stdout: { write() {}, columns: 80, rows: 24, isTTY: false },
    stdin: { isTTY: false, setRawMode() {}, on() {}, resume() {} },
    stderr: { write() {} },
    emit() {},
    on() {},
    platform: "browser",
  };
}
`

// Plugin to stub Node.js built-in modules that can't be resolved in browsers.
// Using `external` leaves bare `import "child_process"` in the output, which
// browsers can't resolve (they require relative paths). This plugin replaces
// the import with an inline empty module instead.
const nodeStubPlugin: import("bun").BunPlugin = {
  name: "node-stub",
  setup(build) {
    const stubs: Record<string, string> = {
      child_process: "export function spawnSync() { return { status: 1, stdout: '', stderr: '' } }",
    }
    for (const mod of Object.keys(stubs)) {
      build.onResolve({ filter: new RegExp(`^${mod}$`) }, (args) => ({
        path: args.path,
        namespace: "node-stub",
      }))
      build.onLoad({ filter: new RegExp(`^${mod}$`), namespace: "node-stub" }, (args) => ({
        contents: stubs[args.path]!,
        loader: "js",
      }))
    }
  },
}

// Shared build options for all browser targets.
// External: packages not needed in browser builds.
// yoga-wasm-web is an optional layout engine (WASM, not needed for demos).
// ws is used by React DevTools connection (not needed in browser).
// Note: flexture IS bundled — all renderers use it for layout via browser-renderer.ts.
const sharedOptions = {
  outdir: distDir,
  target: "browser" as const,
  format: "esm" as const,
  minify: false,
  sourcemap: "external" as const,
  define: browserDefines,
  banner: processShim,
  external: ["yoga-wasm-web", "ws"],
  plugins: [nodeStubPlugin],
}

// =============================================================================
// Registry Generation — scan examples and write viewer-registry.ts
// =============================================================================

const skipFiles = new Set([
  "interactive/clipboard.tsx",
  "interactive/_input-debug.tsx",
  "interactive/_textarea-bare.tsx",
  "runtime/hello-runtime.tsx",
  "inline/scrollback.tsx",
  "inline/inline-nontty.tsx",
])

const categories = [
  { dir: "layout", color: "#cba6f7", label: "Layout" },
  { dir: "interactive", color: "#89dceb", label: "Interactive" },
  { dir: "runtime", color: "#a6e3a1", label: "Runtime" },
  { dir: "inline", color: "#fab387", label: "Inline" },
] as const

interface RegistryEntry {
  key: string
  name: string
  description: string
  features: string[]
  category: string
  categoryColor: string
  source: string
  type: "showcase" | "example"
}

async function generateRegistry(): Promise<void> {
  const entries: RegistryEntry[] = []

  // Showcase entries (from showcases.tsx — these share one file, source shown differently)
  const showcaseKeys = [
    "dashboard",
    "coding-agent",
    "kanban",
    "cli-wizard",
    "dev-tools",
    "data-explorer",
    "scroll",
    "layout-feedback",
    "focus",
    "text-input",
    "theme-explorer",
  ]
  const showcaseMeta: Record<string, { name: string; description: string; features: string[] }> = {
    dashboard: {
      name: "System Dashboard",
      description: "Real-time metrics, service status, and event feed with live updating data.",
      features: ["Box", "Text", "borderStyle", "flexDirection", "useInput", "useEffect", "setInterval"],
    },
    "coding-agent": {
      name: "Coding Agent",
      description: "Claude Code-style coding agent with tool calls, code diffs, and streaming output.",
      features: ["Box", "Text", "outlineStyle", "flexDirection", "wrap"],
    },
    kanban: {
      name: "Kanban Board",
      description: "Three-column kanban with selectable cards and tag badges.",
      features: ["Box", "Text", "borderStyle", "flexGrow", "useInput", "useState"],
    },
    "cli-wizard": {
      name: "CLI Wizard",
      description: "Clack-style interactive setup wizard with step-by-step progression.",
      features: ["Box", "Text", "useInput", "useState", "Fragment"],
    },
    "dev-tools": {
      name: "Log Viewer",
      description: "Filterable log viewer with live search, scroll, and level coloring.",
      features: ["Box", "Text", "borderStyle", "useInput", "useState", "wrap"],
    },
    "data-explorer": {
      name: "Process Explorer",
      description: "Sortable data table with live CPU jitter and row selection.",
      features: ["Box", "Text", "backgroundColor", "flexDirection", "useInput", "useEffect"],
    },
    scroll: {
      name: "Scroll List",
      description: "Basic scrollable list with keyboard navigation.",
      features: ["Box", "Text", "borderStyle", "useInput"],
    },
    "layout-feedback": {
      name: "Layout Feedback",
      description: "Live display of content dimensions via useContentRect().",
      features: ["Box", "Text", "useContentRect", "justifyContent", "alignItems"],
    },
    focus: {
      name: "Focus Panels",
      description: "Tab-cycling focus across three panels.",
      features: ["Box", "Text", "borderStyle", "useInput"],
    },
    "text-input": {
      name: "Text Input",
      description: "Live text echo with cursor, backspace, and clear.",
      features: ["Box", "Text", "borderStyle", "useInput"],
    },
    "theme-explorer": {
      name: "Theme Explorer",
      description: "Browse 14 built-in color palettes with ANSI swatches and sample text.",
      features: ["Box", "Text", "backgroundColor", "useInput", "useContentRect", "@silvery/theme"],
    },
  }

  for (const key of showcaseKeys) {
    const meta = showcaseMeta[key]!
    entries.push({
      key: `showcase-${key}`,
      name: meta.name,
      description: meta.description,
      features: meta.features,
      category: "Showcases",
      categoryColor: "#f9e2af",
      source: "",
      type: "showcase",
    })
  }

  // Scan example directories
  for (const cat of categories) {
    const dir = join(__dirname, "..", cat.dir)
    const files = (await readdir(dir)).filter((f) => f.endsWith(".tsx") && !skipFiles.has(`${cat.dir}/${f}`))

    for (const file of files.sort()) {
      const source = await Bun.file(join(dir, file)).text()
      const key = file.replace(".tsx", "")

      // Extract meta from ExampleMeta export
      const metaMatch = source.match(/export const meta:\s*ExampleMeta\s*=\s*\{([^}]+)\}/)
      let name = key,
        description = "",
        features: string[] = []
      if (metaMatch) {
        const metaStr = metaMatch[1]!
        const nameMatch = metaStr.match(/name:\s*"([^"]+)"/)
        const descMatch = metaStr.match(/description:\s*"([^"]+)"/)
        const featMatch = metaStr.match(/features:\s*\[([^\]]*)\]/)
        if (nameMatch) name = nameMatch[1]!
        if (descMatch) description = descMatch[1]!
        if (featMatch) features = featMatch[1]!.match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) ?? []
      }

      entries.push({
        key,
        name,
        description,
        features,
        category: cat.label,
        categoryColor: cat.color,
        source,
        type: "example",
      })
    }
  }

  // Write registry file
  const registryContent = `// AUTO-GENERATED by build.ts — do not edit manually

export interface ExampleEntry {
  key: string
  name: string
  description: string
  features: string[]
  category: string
  categoryColor: string
  source: string
  type: "showcase" | "example"
}

export const REGISTRY: ExampleEntry[] = ${JSON.stringify(entries, null, 2)}
`
  await Bun.write(join(__dirname, "viewer-registry.ts"), registryContent)
}

// Generate registry before building (viewer-app imports it)
await generateRegistry()

// Build canvas app
const canvasResult = await Bun.build({
  entrypoints: [join(__dirname, "canvas-app.tsx")],
  ...sharedOptions,
})

if (!canvasResult.success) {
  console.error("Canvas build failed:")
  for (const log of canvasResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Build DOM app
const domResult = await Bun.build({
  entrypoints: [join(__dirname, "dom-app.tsx")],
  ...sharedOptions,
})

if (!domResult.success) {
  console.error("DOM build failed:")
  for (const log of domResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Build xterm app
const xtermResult = await Bun.build({
  entrypoints: [join(__dirname, "xterm-app.tsx")],
  ...sharedOptions,
})

if (!xtermResult.success) {
  console.error("xterm build failed:")
  for (const log of xtermResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Build showcase app (use-case demos for docs site)
const showcaseResult = await Bun.build({
  entrypoints: [join(__dirname, "showcase-app.tsx")],
  ...sharedOptions,
})

if (!showcaseResult.success) {
  console.error("Showcase build failed:")
  for (const log of showcaseResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Build viewer app (unified example browser)
const viewerResult = await Bun.build({
  entrypoints: [join(__dirname, "viewer-app.tsx")],
  ...sharedOptions,
})

if (!viewerResult.success) {
  console.error("Viewer build failed:")
  for (const log of viewerResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Copy built files to VitePress public dir for docs site
await cp(distDir, docsDistDir, { recursive: true })

// Copy showcase.html to docs public dir
await cp(join(__dirname, "showcase.html"), join(__dirname, "../../docs/public/examples/showcase.html"))

// Copy viewer.html to docs public dir (if it exists)
try {
  await cp(join(__dirname, "viewer.html"), join(__dirname, "../../docs/public/examples/viewer.html"))
} catch {
  // viewer.html may not exist yet — skip silently
}

// Copy xterm.css to docs public dir (needed by showcase.html in production)
await mkdir(join(__dirname, "../../docs/public/examples/xterm"), { recursive: true })
await cp(
  join(__dirname, "../../node_modules/@xterm/xterm/css/xterm.css"),
  join(__dirname, "../../docs/public/examples/xterm/xterm.css"),
)

console.log("✓ Generated examples/web/viewer-registry.ts")
console.log("✓ Built examples/web/dist/canvas-app.js")
console.log("✓ Built examples/web/dist/dom-app.js")
console.log("✓ Built examples/web/dist/xterm-app.js")
console.log("✓ Built examples/web/dist/showcase-app.js")
console.log("✓ Built examples/web/dist/viewer-app.js")
console.log("✓ Copied to docs/public/examples/dist/")
console.log("✓ Copied showcase.html to docs/public/examples/")
console.log("\nOpen in browser:")
console.log("  examples/web/canvas.html")
console.log("  examples/web/dom.html")
console.log("  examples/web/xterm.html")
console.log("  examples/web/showcase.html?demo=dashboard")
console.log("  examples/web/viewer.html")
