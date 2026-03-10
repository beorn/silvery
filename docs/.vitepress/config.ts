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
      { text: "Guides", link: "/guides/terminal-apps" },
      { text: "Reference", link: "/reference/components-hooks" },
      {
        text: "Examples",
        items: [
          { text: "Live Demo", link: "/examples/live-demo" },
          { text: "Dashboard", link: "/examples/dashboard" },
          { text: "Task List", link: "/examples/task-list" },
          { text: "Kanban Board", link: "/examples/kanban" },
          { text: "AI Assistants & Chat", link: "/examples/ai-assistants" },
          { text: "CLI Wizards & Setup", link: "/examples/cli-wizards" },
          { text: "Developer Tools", link: "/examples/developer-tools" },
          { text: "Data Explorers & Tables", link: "/examples/data-explorers" },
        ],
      },
      { text: "Blog", link: "/blog/" },
      {
        text: "Links",
        items: [
          { text: "GitHub", link: "https://github.com/beorn/silvery" },
          { text: "npm", link: "https://www.npmjs.com/package/silvery" },
        ],
      },
    ],

    sidebar: {
      "/getting-started/": [
        {
          text: "Getting Started",
          items: [
            { text: "Quick Start", link: "/getting-started/quick-start" },
            { text: "Migrate from Ink", link: "/getting-started/migrate-from-ink" },
            { text: "Migrate from Chalk", link: "/getting-started/migrate-from-chalk" },
          ],
        },
      ],
      "/guides/": [
        {
          text: "Guides",
          items: [
            { text: "Terminal Apps", link: "/guides/terminal-apps" },
            { text: "Components", link: "/guides/components" },
            { text: "Theming", link: "/guides/theming" },
            { text: "State Management", link: "/guides/state-management" },
            { text: "Future Targets", link: "/guides/future-targets" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Components & Hooks", link: "/reference/components-hooks" },
            { text: "Packages", link: "/reference/packages" },
            { text: "Ink/Chalk Compatibility", link: "/reference/compatibility" },
          ],
        },
        {
          text: "Components (API)",
          items: [
            { text: "Box", link: "/api/box" },
            { text: "Text", link: "/api/text" },
            { text: "Newline", link: "/api/newline" },
            { text: "Spacer", link: "/api/spacer" },
            { text: "Static", link: "/api/static" },
          ],
        },
        {
          text: "Hooks (API)",
          items: [
            { text: "useContentRect", link: "/api/use-content-rect" },
            { text: "useInput", link: "/api/use-input" },
            { text: "useApp", link: "/api/use-app" },
            { text: "useStdout", link: "/api/use-stdout" },
            { text: "Focus Hooks", link: "/api/use-focus" },
          ],
        },
        {
          text: "Functions (API)",
          items: [{ text: "render", link: "/api/render" }],
        },
        {
          text: "Deep Reference",
          collapsed: true,
          items: [
            { text: "Components", link: "/reference/components" },
            { text: "Hooks", link: "/reference/hooks" },
            { text: "Lifecycle", link: "/reference/lifecycle" },
            { text: "Signals", link: "/reference/signals" },
            { text: "Plugins", link: "/reference/plugins" },
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
      ],
      "/api/": [
        {
          text: "Components",
          items: [
            { text: "Box", link: "/api/box" },
            { text: "Text", link: "/api/text" },
            { text: "Newline", link: "/api/newline" },
            { text: "Spacer", link: "/api/spacer" },
            { text: "Static", link: "/api/static" },
          ],
        },
        {
          text: "Hooks",
          items: [
            { text: "useContentRect", link: "/api/use-content-rect" },
            { text: "useInput", link: "/api/use-input" },
            { text: "useApp", link: "/api/use-app" },
            { text: "useStdout", link: "/api/use-stdout" },
            { text: "Focus Hooks", link: "/api/use-focus" },
          ],
        },
        {
          text: "Functions",
          items: [{ text: "render", link: "/api/render" }],
        },
      ],
      "/guide/": [
        {
          text: "Guide (Legacy)",
          collapsed: true,
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },

            { text: "Installation", link: "/guide/installation" },
            { text: "Why Silvery?", link: "/guide/why-silvery" },
            { text: "Silvery vs Ink", link: "/guide/silvery-vs-ink" },
            { text: "Comparison", link: "/guide/comparison" },
          ],
        },
        {
          text: "Core Concepts",
          collapsed: true,
          items: [

            { text: "Hooks", link: "/guide/hooks" },
            { text: "Scrolling", link: "/guide/scrolling" },
            { text: "Cursor API", link: "/guide/cursor-api" },
            { text: "Input Limitations", link: "/guide/input-limitations" },

            { text: "Event Handling", link: "/guide/event-handling" },

            { text: "Testing", link: "/guide/testing" },
          ],
        },
        {
          text: "Advanced",
          collapsed: true,
          items: [
            { text: "Kitty Protocol", link: "/guide/kitty-protocol" },
            { text: "Layout Engine", link: "/guide/layout-engine" },
            { text: "CSS Alignment", link: "/guide/css-alignment" },
            { text: "ANSI Layering", link: "/guide/ansi-layering" },
            { text: "React 19", link: "/guide/react-19" },
            { text: "Layouts", link: "/guide/layouts" },
            { text: "Runtime Layers", link: "/guide/runtime-layers" },
            { text: "Runtime Getting Started", link: "/guide/runtime-getting-started" },
            { text: "Imports", link: "/guide/imports" },
            { text: "Textarea Design", link: "/guide/textarea-design" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" },
          ],
        },
        {
          text: "Migration",
          collapsed: true,
          items: [
            { text: "From Ink", link: "/guide/migration" },
            { text: "Runtime Migration", link: "/guide/runtime-migration" },
          ],
        },
        {
          text: "Project",
          collapsed: true,
          items: [
            { text: "Contributing", link: "/contributing" },
            { text: "Roadmap", link: "/roadmap" },
          ],
        },
      ],
      "/examples/": [
        {
          text: "Examples",
          items: [
            { text: "Overview", link: "/examples/" },
            { text: "Live Demo", link: "/examples/live-demo" },
            { text: "Dashboard", link: "/examples/dashboard" },
            { text: "Task List", link: "/examples/task-list" },
            { text: "Kanban Board", link: "/examples/kanban" },
            { text: "AI Assistants & Chat", link: "/examples/ai-assistants" },
            { text: "CLI Wizards & Setup", link: "/examples/cli-wizards" },
            { text: "Developer Tools", link: "/examples/developer-tools" },
            { text: "Data Explorers & Tables", link: "/examples/data-explorers" },
          ],
        },
      ],
      "/blog/": [
        {
          text: "Blog",
          items: [{ text: "Blog Home", link: "/blog/" }],
        },
      ],
    },

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
