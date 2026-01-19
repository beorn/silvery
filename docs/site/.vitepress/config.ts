import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  vite: {
    plugins: [
      llmstxt({
        // Auto-generates llms.txt (index) and llms-full.txt (complete docs)
        // at build time following the llmstxt.org standard
      }),
    ],
  },

  title: "InkX",
  description: "Ink, but components know their size",
  base: "/inkx/",

  head: [["link", { rel: "icon", href: "/inkx/favicon.ico" }]],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "InkX",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/box" },
      { text: "Examples", link: "/examples/" },
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
            { text: "Why InkX?", link: "/guide/why-inkx" },
          ],
        },
        {
          text: "Core Concepts",
          items: [
            { text: "Components", link: "/guide/components" },
            { text: "Hooks", link: "/guide/hooks" },
            { text: "Scrolling", link: "/guide/scrolling" },
          ],
        },
        {
          text: "Migration",
          items: [{ text: "From Ink", link: "/guide/migration" }],
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
            { text: "useLayout", link: "/api/use-layout" },
            { text: "useInput", link: "/api/use-input" },
            { text: "useApp", link: "/api/use-app" },
            { text: "useStdout", link: "/api/use-stdout" },
            { text: "useFocus", link: "/api/use-focus" },
          ],
        },
        {
          text: "Functions",
          items: [{ text: "render", link: "/api/render" }],
        },
      ],
      "/examples/": [
        {
          text: "Examples",
          items: [
            { text: "Overview", link: "/examples/" },
            { text: "Dashboard", link: "/examples/dashboard" },
            { text: "Task List", link: "/examples/task-list" },
            { text: "Kanban Board", link: "/examples/kanban" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/beorn/inkx" }],

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2024-present",
    },
  },
});
