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

  title: "inkx",
  description:
    "React for modern terminals — layout feedback, every terminal protocol, 200x+ faster incremental renders",
  base: "/inkx/",

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/inkx/logo.svg" }]],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "inkx",

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
        ],
      },
      {
        text: "Links",
        items: [
          { text: "GitHub", link: "https://github.com/beorn/inkx" },
          { text: "npm", link: "https://www.npmjs.com/package/inkx" },
        ],
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Why inkx?", link: "/guide/why-inkx" },
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
            { text: "Live Demo", link: "/examples/live-demo" },
            { text: "Dashboard", link: "/examples/dashboard" },
            { text: "Task List", link: "/examples/task-list" },
            { text: "Kanban Board", link: "/examples/kanban" },
          ],
        },
        {
          text: "Use Cases",
          collapsed: false,
          items: [
            { text: "AI Assistants & Chat", link: "/use-cases/ai-assistants" },
            { text: "Dashboards & Monitoring", link: "/use-cases/dashboards" },
            { text: "Kanban & Project Boards", link: "/use-cases/kanban-boards" },
            { text: "CLI Wizards & Setup", link: "/use-cases/cli-wizards" },
            { text: "Developer Tools", link: "/use-cases/developer-tools" },
            { text: "Data Explorers & Tables", link: "/use-cases/data-explorers" },
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
            { text: "Live Demo", link: "/examples/live-demo" },
            { text: "Dashboard", link: "/examples/dashboard" },
            { text: "Task List", link: "/examples/task-list" },
            { text: "Kanban Board", link: "/examples/kanban" },
          ],
        },
        {
          text: "Use Cases",
          collapsed: false,
          items: [
            { text: "AI Assistants & Chat", link: "/use-cases/ai-assistants" },
            { text: "Dashboards & Monitoring", link: "/use-cases/dashboards" },
            { text: "Kanban & Project Boards", link: "/use-cases/kanban-boards" },
            { text: "CLI Wizards & Setup", link: "/use-cases/cli-wizards" },
            { text: "Developer Tools", link: "/use-cases/developer-tools" },
            { text: "Data Explorers & Tables", link: "/use-cases/data-explorers" },
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
          ],
        },
        {
          text: "Use Cases",
          collapsed: false,
          items: [
            { text: "AI Assistants & Chat", link: "/use-cases/ai-assistants" },
            { text: "Dashboards & Monitoring", link: "/use-cases/dashboards" },
            { text: "Kanban & Project Boards", link: "/use-cases/kanban-boards" },
            { text: "CLI Wizards & Setup", link: "/use-cases/cli-wizards" },
            { text: "Developer Tools", link: "/use-cases/developer-tools" },
            { text: "Data Explorers & Tables", link: "/use-cases/data-explorers" },
          ],
        },
      ],
      "/use-cases/": [
        {
          text: "Examples",
          collapsed: false,
          items: [
            { text: "Live Demo", link: "/examples/live-demo" },
            { text: "Dashboard", link: "/examples/dashboard" },
            { text: "Task List", link: "/examples/task-list" },
            { text: "Kanban Board", link: "/examples/kanban" },
          ],
        },
        {
          text: "Use Cases",
          items: [
            { text: "AI Assistants & Chat", link: "/use-cases/ai-assistants" },
            { text: "Dashboards & Monitoring", link: "/use-cases/dashboards" },
            { text: "Kanban & Project Boards", link: "/use-cases/kanban-boards" },
            { text: "CLI Wizards & Setup", link: "/use-cases/cli-wizards" },
            { text: "Developer Tools", link: "/use-cases/developer-tools" },
            { text: "Data Explorers & Tables", link: "/use-cases/data-explorers" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/beorn/inkx" }],

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
