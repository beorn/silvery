import { defineConfig } from "vitepress"
import llmstxt from "vitepress-plugin-llms"

export default defineConfig({
  vite: {
    plugins: [
      llmstxt({
        // Auto-generates llms.txt (index) and llms-full.txt (complete docs)
        // at build time following the llmstxt.org standard
      }),
    ],
    build: {
      rollupOptions: {
        // Termless packages are runtime-only (STRICT_TERMINAL verification)
        // and not available in the standalone silvery repo CI
        external: ["@termless/core", "@termless/xtermjs", "@termless/ghostty"],
      },
    },
    ssr: {
      external: ["@termless/core", "@termless/xtermjs", "@termless/ghostty"],
    },
  },

  title: "Silvery",
  description:
    "Silvery — A React renderer for terminal UIs with responsive layouts, scrollable containers, and 100x+ faster interactive updates.",
  base: "/",

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }]],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Silvery",

    nav: [
      { text: "Getting Started", link: "/getting-started/quick-start" },
      { text: "The Silvery Way", link: "/guide/the-silvery-way" },
      { text: "Guides", link: "/guides/components" },
      { text: "Reference", link: "/reference/components-hooks" },
      {
        text: "Examples",
        items: [
          { text: "Live Demo", link: "/examples/live-demo" },
          { text: "Components", link: "/examples/components" },
          { text: "Layout", link: "/examples/layout" },
          { text: "Forms & Input", link: "/examples/forms" },
          { text: "Tables & Data", link: "/examples/tables" },
          { text: "Scrollback", link: "/examples/scrollback" },
          { text: "Terminal Protocols", link: "/examples/terminal" },
          { text: "AI Coding Agent", link: "/examples/ai-chat" },
          { text: "Testing", link: "/examples/testing" },
        ],
      },
      { text: "Themes", link: "/themes" },
      { text: "Blog", link: "/blog/" },
      {
        text: "Links",
        items: [
          { text: "GitHub", link: "https://github.com/beorn/silvery" },
          { text: "npm", link: "https://www.npmjs.com/package/silvery" },
        ],
      },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Quick Start", link: "/getting-started/quick-start" },
          { text: "Migrate from Ink", link: "/getting-started/migrate-from-ink" },
          { text: "Migrate from Chalk", link: "/getting-started/migrate-from-chalk" },
        ],
      },
      {
        text: "The Silvery Way",
        link: "/guide/the-silvery-way",
      },
      {
        text: "Guides",
        collapsed: false,
        items: [
          { text: "Components", link: "/guides/components" },
          { text: "Layouts", link: "/guide/layouts" },
          { text: "Styling", link: "/guide/styling" },
          { text: "Theming", link: "/guides/theming" },
          { text: "Scrolling", link: "/guide/scrolling" },
          { text: "Testing", link: "/guide/testing" },
          { text: "Debugging", link: "/guide/debugging" },
          { text: "Silvery vs Ink", link: "/guide/silvery-vs-ink" },
          { text: "Why Silvery?", link: "/guide/why-silvery" },
        ],
      },
      {
        text: "API Reference",
        collapsed: false,
        items: [
          { text: "Box", link: "/api/box" },
          { text: "Text", link: "/api/text" },
          { text: "SelectList", link: "/api/select-list" },
          { text: "TextInput", link: "/api/text-input" },
          { text: "TextArea", link: "/api/text-area" },
          { text: "ListView", link: "/api/list-view" },
          { text: "VirtualList", link: "/api/virtual-list" },
          { text: "Tabs", link: "/api/tabs" },
          { text: "Table", link: "/api/table" },
          { text: "Spinner", link: "/api/spinner" },
          { text: "ProgressBar", link: "/api/progress-bar" },
          { text: "CommandPalette", link: "/api/command-palette" },
          { text: "Newline", link: "/api/newline" },
          { text: "Spacer", link: "/api/spacer" },
          { text: "Static", link: "/api/static" },
          { text: "render", link: "/api/render" },
          { text: "useContentRect", link: "/api/use-content-rect" },
          { text: "useInput", link: "/api/use-input" },
          { text: "useApp", link: "/api/use-app" },
          { text: "useStdout", link: "/api/use-stdout" },
          { text: "Focus Hooks", link: "/api/use-focus" },
        ],
      },
      {
        text: "Reference",
        collapsed: true,
        items: [
          { text: "Components & Hooks", link: "/reference/components-hooks" },
          { text: "Packages", link: "/reference/packages" },
          { text: "Ink/Chalk Compatibility", link: "/reference/compatibility" },
          { text: "Components", link: "/reference/components" },
          { text: "Hooks", link: "/reference/hooks" },
          { text: "Lifecycle", link: "/reference/lifecycle" },
          { text: "Theming", link: "/reference/theming" },
          { text: "Input Features", link: "/reference/input-features" },
          { text: "Streams", link: "/reference/streams" },
          { text: "Text Cursor", link: "/reference/text-cursor" },
          { text: "Text Sizing", link: "/reference/text-sizing" },
          { text: "Scroll Regions", link: "/reference/scroll-regions" },
          { text: "Robust Ops", link: "/reference/robust-ops" },
          { text: "Terminal Capabilities", link: "/reference/terminal-capabilities" },
          { text: "Terminal Matrix", link: "/reference/terminal-matrix" },
          { text: "Devtools", link: "/reference/devtools" },
          { text: "Recipes", link: "/reference/recipes" },
        ],
      },
      {
        text: "Deep Dives",
        collapsed: true,
        items: [
          { text: "Hooks", link: "/guide/hooks" },
          { text: "Layouts", link: "/guide/layouts" },
          { text: "Event Handling", link: "/guide/event-handling" },
          { text: "Input Limitations", link: "/guide/input-limitations" },
          { text: "Cursor API", link: "/guide/cursor-api" },
          { text: "Kitty Protocol", link: "/guide/kitty-protocol" },
          { text: "Layout Engine", link: "/guide/layout-engine" },
          { text: "CSS Alignment", link: "/guide/css-alignment" },
          { text: "ANSI Layering", link: "/guide/ansi-layering" },
          { text: "Runtime Layers", link: "/guide/runtime-layers" },
          { text: "Imports", link: "/guide/imports" },
          { text: "React 19", link: "/guide/react-19" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" },
        ],
      },
      {
        text: "Examples",
        collapsed: true,
        items: [
          { text: "Overview", link: "/examples/" },
          { text: "Live Demo", link: "/examples/live-demo" },
          { text: "Components", link: "/examples/components" },
          { text: "Layout", link: "/examples/layout" },
          { text: "Forms & Input", link: "/examples/forms" },
          { text: "Tables & Data", link: "/examples/tables" },
          { text: "Scrollback", link: "/examples/scrollback" },
          { text: "Terminal Protocols", link: "/examples/terminal" },
          { text: "AI Coding Agent", link: "/examples/ai-chat" },
          { text: "Testing", link: "/examples/testing" },
        ],
      },
      {
        text: "Project",
        collapsed: true,
        items: [
          { text: "Contributing", link: "/contributing" },
          { text: "Roadmap", link: "/roadmap" },
          { text: "Blog", link: "/blog/" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/beorn/silvery" }],

    outline: { level: [2, 3] },

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2024-present",
    },
  },
})
