import { defineConfig } from "vitepress"
import { withMermaid } from "vitepress-plugin-mermaid"
import llmstxt from "vitepress-plugin-llms"
import {
  glossaryPlugin,
  seoHead,
  seoTransformPageData,
  validateGlossary,
  loadTerminalGlossary,
  loadEcosystemGlossary,
} from "vitepress-enrich"
import siteGlossary from "../content/glossary.json"

// Site-specific terms + shared terminal vocabulary + ecosystem cross-links
const glossary = [...siteGlossary, ...loadTerminalGlossary(), ...loadEcosystemGlossary({ exclude: ["silvery.dev"] })]

const seoOptions = {
  hostname: "https://silvery.dev",
  siteName: "Silvery",
  description: "React TUI framework for modern terminal apps",
  ogImage: "https://silvery.dev/og-image.png",
  author: {
    name: "Bjørn Stabell",
    url: "https://beorn.codes",
    sameAs: ["https://github.com/beorn"],
  },
  codeRepository: "https://github.com/beorn/silvery",
}

export default withMermaid(
  defineConfig({
    sitemap: { hostname: "https://silvery.dev" },
    lastUpdated: true,
    // Blog excluded by default (not ready for public). Use INCLUDE_BLOG=1 for local preview.
    srcExclude: process.env.INCLUDE_BLOG ? [] : ["blog/**"],
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
        noExternal: ["vitepress-enrich"],
        external: ["@termless/core", "@termless/xtermjs", "@termless/ghostty"],
      },
    },

    title: "Silvery",
    description:
      "Silvery — React for modern terminal apps. Responsive layouts, incremental rendering, 45+ components. Ink-compatible. Pure TypeScript, no WASM.",
    base: "/",

    markdown: {
      config(md) {
        md.use(glossaryPlugin, { entities: glossary })
      },
    },

    head: [
      ["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
      [
        "script",
        {
          defer: "",
          src: "https://static.cloudflareinsights.com/beacon.min.js",
          "data-cf-beacon": '{"token": "22f9c4cb26ce4f21bd36ed1b772c226e"}',
        },
      ],
      ...seoHead(seoOptions),
    ],

    transformPageData: seoTransformPageData(seoOptions),

    buildEnd(siteConfig) {
      validateGlossary(glossary, siteConfig)
    },

    themeConfig: {
      logo: "/logo.svg",
      siteTitle: "Silvery",

      nav: [
        {
          text: "Getting Started",
          items: [
            { text: "Quick Start", link: "/getting-started/quick-start" },
            { text: "Migrate from Ink", link: "/getting-started/migrate-from-ink" },
            { text: "Migrate from Chalk", link: "/getting-started/migrate-from-chalk" },
          ],
        },
        { text: "The Silvery Way", link: "/guide/the-silvery-way" },
        {
          text: "Guides",
          items: [
            { text: "Why Silvery?", link: "/guide/why-silvery" },
            { text: "Silvery vs Ink", link: "/guide/silvery-vs-ink" },
            { text: "FAQ", link: "/guide/faq" },
            { text: "Components", link: "/guides/components" },
            { text: "Building an App", link: "/guides/terminal-apps" },
            { text: "State Management", link: "/guides/state-management" },
            { text: "Layouts", link: "/guide/layouts" },
            { text: "Styling", link: "/guide/styling" },
            { text: "Theming", link: "/guide/theming" },
            { text: "Scrolling", link: "/guide/scrolling" },
            { text: "Text Selection", link: "/guide/text-selection" },
            { text: "Clipboard", link: "/guide/clipboard" },
            { text: "Find", link: "/guide/find" },
            { text: "Testing", link: "/guide/testing" },
            { text: "Debugging", link: "/guide/debugging" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Components & Hooks", link: "/reference/components-hooks" },
            { text: "Packages", link: "/reference/packages" },
            { text: "Compatibility", link: "/reference/compatibility" },
            { text: "Lifecycle", link: "/reference/lifecycle" },
            { text: "Theming", link: "/reference/theming" },
            { text: "Style", link: "/reference/style" },
            { text: "Plugins", link: "/reference/plugins" },
            { text: "Recipes", link: "/reference/recipes" },
          ],
        },
        {
          text: "Examples",
          items: [
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
        // Blog hidden until we have 5+ articles — see km-market.blog-content
        // { text: "Blog", link: "/blog/" },
        { text: "About", link: "/about" },
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
            { text: "Building an App", link: "/guides/terminal-apps" },
            { text: "State Management", link: "/guides/state-management" },
            { text: "Layouts", link: "/guide/layouts" },
            { text: "Styling", link: "/guide/styling" },
            { text: "Theming", link: "/guide/theming" },
            { text: "Scrolling", link: "/guide/scrolling" },
            { text: "Text Selection", link: "/guide/text-selection" },
            { text: "Clipboard", link: "/guide/clipboard" },
            { text: "Find", link: "/guide/find" },
            { text: "Testing", link: "/guide/testing" },
            { text: "Debugging", link: "/guide/debugging" },
            { text: "Why Silvery?", link: "/guide/why-silvery" },
            { text: "FAQ", link: "/guide/faq" },
            {
              text: "Comparisons",
              collapsed: true,
              items: [
                { text: "Silvery vs Ink", link: "/guide/silvery-vs-ink" },
                { text: "Silvery vs BubbleTea", link: "/guide/silvery-vs-bubbletea" },
                { text: "Silvery vs Textual", link: "/guide/silvery-vs-textual" },
                { text: "Silvery vs Blessed", link: "/guide/silvery-vs-blessed" },
              ],
            },
          ],
        },
        {
          text: "API Reference",
          link: "/api/",
          collapsed: false,
          items: [
            {
              text: "Components",
              collapsed: false,
              items: [
                { text: "Box", link: "/api/box" },
                { text: "Text", link: "/api/text" },
                { text: "SelectList", link: "/api/select-list" },
                { text: "TextInput", link: "/api/text-input" },
                { text: "TextArea", link: "/api/text-area" },
                { text: "ListView", link: "/api/list-view" },
                { text: "Tabs", link: "/api/tabs" },
                { text: "Table", link: "/api/table" },
                { text: "Spinner", link: "/api/spinner" },
                { text: "ProgressBar", link: "/api/progress-bar" },
                { text: "CommandPalette", link: "/api/command-palette" },
                { text: "Newline", link: "/api/newline" },
                { text: "Spacer", link: "/api/spacer" },
                { text: "Static", link: "/api/static" },
              ],
            },
            {
              text: "Hooks",
              collapsed: false,
              items: [
                { text: "useBoxRect", link: "/api/use-box-rect" },
                { text: "useInput", link: "/api/use-input" },
                { text: "useApp", link: "/api/use-app" },
                { text: "useStdout", link: "/api/use-stdout" },
                { text: "Focus Hooks", link: "/api/use-focus" },
              ],
            },
            { text: "render", link: "/api/render" },
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
            { text: "Style", link: "/reference/style" },
            { text: "Plugins", link: "/reference/plugins" },
            { text: "Signals", link: "/reference/signals" },
            { text: "Scroll Regions", link: "/reference/scroll-regions" },
            { text: "Robust Ops", link: "/reference/robust-ops" },
            { text: "Terminal Capabilities", link: "/reference/terminal-capabilities" },
            { text: "Terminal Matrix", link: "/reference/terminal-matrix" },
            { text: "Devtools", link: "/reference/devtools" },
            { text: "Recipes", link: "/reference/recipes" },
            { text: "@silvery/commander", link: "/reference/commander" },
            { text: "@silvery/ansi", link: "/reference/ansi" },
            { text: "@silvery/theme", link: "/reference/theme" },
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
            { text: "TextArea Design", link: "/guide/textarea-design" },
            { text: "Kitty Protocol", link: "/guide/kitty-protocol" },
            { text: "Layout Engine", link: "/guide/layout-engine" },
            { text: "Layout Coordinates", link: "/guide/layout-coordinates" },
            { text: "CSS Alignment", link: "/guide/css-alignment" },
            { text: "ANSI Layering", link: "/guide/ansi-layering" },
            { text: "Runtime Layers", link: "/guide/runtime-layers" },
            { text: "Providers and Plugins", link: "/guide/providers" },
            { text: "Headless Machines", link: "/guide/headless-machines" },
            { text: "Runtime Getting Started", link: "/guide/runtime-getting-started" },
            { text: "Runtime Migration", link: "/guide/runtime-migration" },
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
        // Blog hidden until we have 5+ polished articles — see km-market.blog-content
        // {
        //   text: "Blog",
        //   collapsed: true,
        //   items: [
        //     { text: "All Posts", link: "/blog/" },
        //     { text: "Why Claude Code Flickers", link: "/blog/claude-code-rendering-dilemma" },
        //     { text: "Build a CLI Dashboard in 50 Lines", link: "/blog/build-cli-dashboard" },
        //     { text: "Silvery vs Ink: Benchmarks", link: "/blog/silvery-vs-ink-benchmarks" },
        //     { text: "Migrating from Ink", link: "/blog/migrating-from-ink" },
        //     { text: "Layout-First Rendering", link: "/blog/layout-first-rendering" },
        //     { text: "Building an AI Agent TUI", link: "/blog/building-ai-agent-tui" },
        //   ],
        // },
        {
          text: "Components Library",
          collapsed: true,
          items: [
            { text: "Overview", link: "/components/README" },
            { text: "Badge", link: "/components/Badge" },
            { text: "Breadcrumb", link: "/components/Breadcrumb" },
            { text: "Button", link: "/components/Button" },
            { text: "Console", link: "/components/Console" },
            { text: "Divider", link: "/components/Divider" },
            { text: "ErrorBoundary", link: "/components/ErrorBoundary" },
            { text: "Form", link: "/components/Form" },
            { text: "Image", link: "/components/Image" },
            { text: "Link", link: "/components/Link" },
            { text: "ModalDialog", link: "/components/ModalDialog" },
            { text: "PickerDialog", link: "/components/PickerDialog" },
            { text: "Screen", link: "/components/Screen" },
            { text: "ScrollbackView", link: "/components/ScrollbackView" },
            { text: "ScrollbackList", link: "/components/ScrollbackList" },
            { text: "SearchBar", link: "/components/SearchBar" },
            { text: "Skeleton", link: "/components/Skeleton" },
            { text: "SplitView", link: "/components/SplitView" },
            { text: "Toast", link: "/components/Toast" },
            { text: "Toggle", link: "/components/Toggle" },
            { text: "Tooltip", link: "/components/Tooltip" },
            { text: "TreeView", link: "/components/TreeView" },
            { text: "Typography", link: "/components/typography" },
          ],
        },
        {
          text: "Design",
          collapsed: true,
          items: [
            { text: "App Composition", link: "/design/app-composition" },
            { text: "Plugin Architecture", link: "/design/plugin-architecture" },
            { text: "Dynamic Scrollback", link: "/design/dynamic-scrollback" },
            { text: "Terminal Support Strategy", link: "/design/terminal-support-strategy" },
          ],
        },
        {
          text: "Project",
          collapsed: true,
          items: [{ text: "Contributing", link: "/contributing" }],
        },
      ],

      socialLinks: [
        { icon: "github", link: "https://github.com/beorn/silvery" },
        {
          icon: {
            svg: '<svg viewBox="0 0 780 250"><path fill="currentColor" d="M240 250h100v-50h100V0H240v250zm-30-250H70C31.4 0 0 31.4 0 70v110c0 38.6 31.4 70 70 70h140v-50H70c-11 0-20-9-20-20V70c0-11 9-20 20-20h140V0zm390 0H390v250h100V150h110c38.6 0 70-31.4 70-70V70c0-38.6-31.4-70-70-70zm-30 100H490V50h110c11 0 20 9 20 20s-9 20-20 20z"/></svg>',
          },
          link: "https://www.npmjs.com/package/silvery",
        },
      ],

      outline: { level: [2, 3] },

      search: {
        provider: "local",
      },

      footer: {
        message:
          'Layout by <a href="https://beorn.codes/flexily">Flexily</a> · Tested with <a href="https://termless.dev">Termless</a> · Compatibility at <a href="https://terminfo.dev">terminfo.dev</a>',
        copyright: 'Built by <a href="https://beorn.codes">Bjørn Stabell</a>',
      },
    },
  }),
)
