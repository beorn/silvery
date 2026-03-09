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
    "Silvery — React for modern terminals. Layout feedback, every terminal protocol, 100x+ faster incremental renders.",
  base: "/",

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }]],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Silvery",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/box" },
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
      {
        text: "Links",
        items: [
          { text: "GitHub", link: "https://github.com/beorn/silvery" },
          { text: "npm", link: "https://www.npmjs.com/package/@silvery/term" },
        ],
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Building an App", link: "/guide/building-an-app" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Why Silvery?", link: "/guide/why-silvery" },
          ],
        },
        {
          text: "Core Concepts",
          items: [
            { text: "Components", link: "/guide/components" },
            { text: "Hooks", link: "/guide/hooks" },
            { text: "Scrolling", link: "/guide/scrolling" },
            { text: "Cursor API", link: "/guide/cursor-api" },
            { text: "Input Limitations", link: "/guide/input-limitations" },
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "Layout Engine", link: "/guide/layout-engine" },
            { text: "React 19", link: "/guide/react-19" },
            { text: "Layouts", link: "/guide/layouts" },
          ],
        },
        {
          text: "Migration",
          items: [{ text: "From Ink", link: "/guide/migration" }],
        },
        {
          text: "Examples",
          collapsed: false,
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
        {
          text: "Examples",
          collapsed: false,
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
