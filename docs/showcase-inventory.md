# Silvery Showcase Inventory

> **TODO (2026-04-16):** many listed demos (`inline/*`, `kitty/*`, `runtime/*`, `web/*`, `playground/*`, `screenshots/*`) have temporarily moved to the private WIP workspace while they're being polished. Update this catalog once they return to public `examples/`. Also add newer public entries missing here: `apps/aichat/*`, `apps/design.tsx`, `apps/panes/*`, `apps/selection.tsx`, `apps/spatial-focus-demo.tsx`, `apps/terminal-caps-demo.tsx`, `apps/text-selection-demo.tsx`, `apps/vterm-demo/*`, `layout/text-layout.tsx`.

Comprehensive catalog of all demos and examples in `./examples/`.

## Summary

- **Total demos**: 48 files (37 public examples + 3 debug tools + 5 web targets + 3 utilities)
- **Web showcase**: 5 demos registered for browser rendering
- **Screenshots**: 5 generated (dashboard, kanban, components, dev-tools, textarea) + 4 in docs/images/
- **Docs pages**: 10 example pages on silvery.dev

## Component Examples (`components/`)

Simple, self-contained demos using `run()` + React hooks. No store, no TEA. Best "getting started" examples.

| Demo         | Path                          | Components                    | Referenced By                                      | Status  | Notes                       |
| ------------ | ----------------------------- | ----------------------------- | -------------------------------------------------- | ------- | --------------------------- |
| Hello        | `components/hello.tsx`        | Box, Text, useInput           | `examples/index.md`                                | Working | Simplest possible app       |
| Counter      | `components/counter.tsx`      | Box, Text, useState, useInput | `examples/index.md`                                | Working | Interactive state demo      |
| Text Input   | `components/text-input.tsx`   | Box, Text, TextInput          | `examples/index.md`, `docs/examples/forms.md`      | Working | Readline keybindings        |
| Select List  | `components/select-list.tsx`  | Box, Text, SelectList         | `examples/index.md`, `docs/examples/forms.md`      | Working | Disabled item support       |
| Spinner      | `components/spinner.tsx`      | Box, Text, Spinner            | `examples/index.md`, `docs/examples/components.md` | Working | 4 animation styles          |
| Progress Bar | `components/progress-bar.tsx` | Box, Text, ProgressBar        | `examples/index.md`, `docs/examples/components.md` | Working | Determinate + indeterminate |
| Virtual List | `components/virtual-list.tsx` | Box, Text, VirtualList        | `examples/index.md`, `docs/examples/tables.md`     | Working | 200 items virtualized       |

## App Examples (`apps/`)

Full interactive applications demonstrating real-world patterns with `render()`/`createApp()`/`pipe()`.

| Demo            | Path                     | Components                                                                                                     | Referenced By                                                                                                       | Status  | Notes                                                                        |
| --------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| AI Coding Agent | `apps/aichat/index.tsx`  | ScrollbackList, Spinner, useTea                                                                                | `examples/index.md`, `docs/examples/ai-chat.md`, `docs/examples/index.md`                                           | Working | Multi-file: index, state, script, types, components                          |
| App Todo        | `apps/app-todo.tsx`      | Box, Text, createApp, pipe, withReact, withTerminal                                                            | `examples/index.md`, `docs/guide/runtime-layers.md`                                                                 | Working | Layer 3 pipe() composition                                                   |
| Async Data      | `apps/async-data.tsx`    | Suspense, use(), ErrorBoundary                                                                                 | `examples/index.md`                                                                                                 | Working | React 19 Suspense demo                                                       |
| CLI Wizard      | `apps/cli-wizard.tsx`    | SelectList, TextInput, ProgressBar, Spinner                                                                    | `examples/index.md`, `docs/examples/forms.md`, `docs/examples/index.md`                                             | Working | Multi-step scaffolding flow                                                  |
| Clipboard       | `apps/clipboard.tsx`     | copyToClipboard, requestClipboard, parseClipboardResponse                                                      | `examples/index.md`                                                                                                 | Working | OSC 52 protocol demo                                                         |
| Components      | `apps/components.tsx`    | H1-H3, Strong, Muted, SelectList, TextInput, ProgressBar, Spinner, Badge, Tabs, Toggle, ModalDialog, CodeBlock | `examples/index.md`, web showcase, `docs/examples/components.md`, `docs/examples/forms.md`, `docs/api/use-focus.md` | Working | **Web showcase**: registered. **Screenshot**: `components.png`               |
| Data Explorer   | `apps/data-explorer.tsx` | VirtualList, TextInput, Divider, useBoxRect, useDeferredValue                                                  | `examples/index.md`, `docs/examples/tables.md`                                                                      | Working | 500+ rows, responsive columns                                                |
| Dev Tools       | `apps/dev-tools.tsx`     | VirtualList, Divider, useBoxRect                                                                               | `examples/index.md`, web showcase                                                                                   | Working | **Web showcase**: registered. **Screenshot**: `dev-tools.png`                |
| Explorer        | `apps/explorer.tsx`      | VirtualList, TextInput, Tabs, TabList, Tab, Divider, useBoxRect, useDeferredValue                              | `examples/index.md`                                                                                                 | Working | 2000+ log entries + process table                                            |
| Gallery         | `apps/gallery.tsx`       | Image, Tabs, TabList, Tab, TabPanel, Kbd, useBoxRect                                                           | `examples/index.md`                                                                                                 | Working | Kitty images + paint + truecolor                                             |
| Inline Bench    | `apps/inline-bench.tsx`  | TerminalBuffer, createOutputPhase, outputPhase                                                                 | `examples/index.md`                                                                                                 | Working | Benchmark utility, not interactive                                           |
| Kanban Board    | `apps/kanban.tsx`        | Box, Text, useInput, overflow="scroll"                                                                         | `examples/index.md`, web showcase, `docs/guide/scrolling.md`, `docs/examples/layout.md`                             | Working | **Web showcase**: registered. **Screenshot**: `kanban.png`                   |
| Layout Ref      | `apps/layout-ref.tsx`    | forwardRef, BoxHandle, onLayout, getboxRect                                                                    | `examples/index.md`                                                                                                 | Working | Imperative layout measurement                                                |
| Outline         | `apps/outline.tsx`       | outlineStyle vs borderStyle, useBoxRect                                                                        | `examples/index.md`                                                                                                 | Working | Layout comparison demo                                                       |
| Panes           | `apps/panes/index.tsx`   | ListView, SearchProvider, SearchBar, useSearch                                                                 | `examples/index.md`                                                                                                 | Working | tmux-style split panes                                                       |
| Paste Demo      | `apps/paste-demo.tsx`    | Bracketed paste mode                                                                                           | `examples/index.md`                                                                                                 | Working | Paste as single event                                                        |
| Scroll          | `apps/scroll.tsx`        | overflow="scroll", scrollTo                                                                                    | `examples/index.md`                                                                                                 | Working | Basic scrollable list                                                        |
| Search Filter   | `apps/search-filter.tsx` | useDeferredValue, useTransition                                                                                | `examples/index.md`                                                                                                 | Working | React concurrent features                                                    |
| Task List       | `apps/task-list.tsx`     | VirtualList, variable itemHeight, overflow                                                                     | `examples/index.md`                                                                                                 | Working | Priority badges, subtasks. **Screenshot**: `task-list.png` (in docs/images/) |
| Terminal        | `apps/terminal.tsx`      | Tabs, TabList, Tab, TabPanel, useMouse, useTerminalFocused, OSC 52                                             | `examples/index.md`                                                                                                 | Working | Keyboard/mouse/clipboard/focus kitchensink                                   |
| TextArea        | `apps/textarea.tsx`      | TextArea, Split-pane, Tab focus                                                                                | `examples/index.md`, web showcase, `docs/examples/ai-chat.md`                                                       | Working | **Web showcase**: registered. **Screenshot**: `textarea.png`                 |
| Theme           | `apps/theme.tsx`         | ThemeProvider, Link, Badge, ProgressBar, Spinner, H1-H3, Code, Blockquote                                      | `examples/index.md`                                                                                                 | Working | 38 palette browser                                                           |
| Transform       | `apps/transform.tsx`     | Transform component                                                                                            | `examples/index.md`                                                                                                 | Working | Text post-processing                                                         |
| Virtual 10K     | `apps/virtual-10k.tsx`   | VirtualList, Divider, useBoxRect, variable itemHeight                                                          | `examples/index.md`                                                                                                 | Working | 10,000 item benchmark                                                        |

## Layout Examples (`layout/`)

| Demo        | Path                     | Components                                                                | Referenced By                                                                                                                                                                               | Status  | Notes                                                                               |
| ----------- | ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Dashboard   | `layout/dashboard.tsx`   | Tabs, TabList, Tab, TabPanel, ProgressBar, Table, useBoxRect, useInterval | `examples/index.md`, web showcase, `docs/examples/layout.md`, `docs/examples/live-demo.md`, `docs/examples/tables.md`, `docs/examples/scrollback.md`, `docs/getting-started/quick-start.md` | Working | **Web showcase**: registered. **Screenshot**: `dashboard.png`. Most-referenced demo |
| Live Resize | `layout/live-resize.tsx` | useBoxRect, responsive breakpoints                                        | `examples/index.md`                                                                                                                                                                         | Working | **Screenshot**: `layout-feedback.png` (in docs/images/)                             |
| Overflow    | `layout/overflow.tsx`    | overflow="hidden", Box height                                             | `examples/index.md`                                                                                                                                                                         | Working | Content clipping demo                                                               |

## Runtime Examples (`runtime/`)

| Demo             | Path                           | Components                               | Referenced By                                       | Status  | Notes                     |
| ---------------- | ------------------------------ | ---------------------------------------- | --------------------------------------------------- | ------- | ------------------------- |
| Elm Counter      | `runtime/elm-counter.tsx`      | createRuntime, layout, diff, merge, map  | `examples/index.md`                                 | Working | Layer 1 Elm architecture  |
| Hello Runtime    | `runtime/hello-runtime.tsx`    | createRuntime, layout                    | `examples/index.md`                                 | Working | Simplest Layer 1 render   |
| Run Counter      | `runtime/run-counter.tsx`      | run(), useState, useInput                | `examples/index.md`, `docs/guide/runtime-layers.md` | Working | Layer 2 sugar pattern     |
| Runtime Counter  | `runtime/runtime-counter.tsx`  | createRuntime, events()                  | `examples/index.md`                                 | Working | Layer 1 custom event loop |
| Pipe Composition | `runtime/pipe-composition.tsx` | createApp, pipe, withReact, withTerminal | `examples/index.md`                                 | Working | Layer 3 plugin system     |

## Inline Examples (`inline/`)

| Demo            | Path                         | Components                             | Referenced By                                      | Status  | Notes                       |
| --------------- | ---------------------------- | -------------------------------------- | -------------------------------------------------- | ------- | --------------------------- |
| Inline Simple   | `inline/inline-simple.tsx`   | render() inline mode                   | `examples/index.md`                                | Working | Basic inline rendering      |
| Inline Progress | `inline/inline-progress.tsx` | render() inline mode, setInterval      | `examples/index.md`                                | Working | Inline progress bar         |
| Inline Non-TTY  | `inline/inline-nontty.tsx`   | Non-TTY mode (pipes, CI, TERM=dumb)    | `examples/index.md`                                | Working | Auto-detects piped output   |
| Scrollback      | `inline/scrollback.tsx`      | useScrollback, VirtualList virtualized | `examples/index.md`, `docs/examples/scrollback.md` | Working | REPL with freeze-and-scroll |

## Kitty Protocol Examples (`kitty/`)

| Demo            | Path                        | Components                                  | Referenced By                                    | Status  | Notes                               |
| --------------- | --------------------------- | ------------------------------------------- | ------------------------------------------------ | ------- | ----------------------------------- |
| Image Viewer    | `kitty/images.tsx`          | Kitty graphics protocol (raw)               | `examples/index.md`, `docs/examples/terminal.md` | Working | File/directory/test pattern gallery |
| Image Component | `kitty/image-component.tsx` | Image component, protocol auto-detect       | `examples/index.md`, `docs/examples/terminal.md` | Working | Declarative API with fallback       |
| Key Explorer    | `kitty/keys.tsx`            | Kitty keyboard protocol, modifier parsing   | `examples/index.md`, `docs/examples/terminal.md` | Working | Interactive chord tester            |
| Rich Input      | `kitty/input.tsx`           | parseHotkey, mouse tracking, Kitty protocol | `examples/index.md`, `docs/examples/terminal.md` | Working | Combined keyboard + mouse           |
| Canvas          | `kitty/canvas.tsx`          | Half-block pixel art, mouse drawing         | `examples/index.md`                              | Working | Low-level terminal canvas           |
| Paint           | `kitty/paint.tsx`           | Kitty graphics + half-block overlay         | `examples/index.md`, `docs/examples/terminal.md` | Working | Flagship visual demo                |

## Debug Tools (`interactive/`)

Internal debug tools, underscore-prefixed. Not discoverable by the viewer.

| Demo            | Path                             | Components           | Referenced By | Status  | Notes                        |
| --------------- | -------------------------------- | -------------------- | ------------- | ------- | ---------------------------- |
| \_stdin-test    | `interactive/_stdin-test.ts`     | Raw stdin (no React) | None          | Working | Keypress delivery diagnostic |
| \_input-debug   | `interactive/_input-debug.tsx`   | useInput, TextArea   | None          | Working | Keypress loss diagnostic     |
| \_textarea-bare | `interactive/_textarea-bare.tsx` | TextArea (bare)      | None          | Working | useInput conflict diagnostic |

## Utilities & Infrastructure

| File                 | Path                       | Purpose                                      | Referenced By                        | Notes                               |
| -------------------- | -------------------------- | -------------------------------------------- | ------------------------------------ | ----------------------------------- |
| Viewer               | `viewer.tsx`               | Storybook-style TUI browser for all examples | `examples/index.md`, `docs/index.md` | Auto-discovers via meta exports     |
| CLI                  | `cli.ts`                   | `bun demo` command-line runner               | `examples/index.md`                  | Fuzzy-match demo launcher           |
| Banner               | `_banner.tsx`              | Shared ExampleBanner component               | All demos                            | Not an example itself               |
| Scrollback Perf      | `scrollback-perf.tsx`      | Benchmark: ScrollbackList keystroke cost     | None                                 | Headless benchmark, not interactive |
| Screenshot Generator | `screenshots/generate.tsx` | Generates PNG screenshots via Playwright     | None                                 | Outputs to `docs/images/`           |

## Web Targets (`web/`)

| File                  | Path                            | Purpose                                    | Referenced By                               | Notes                                              |
| --------------------- | ------------------------------- | ------------------------------------------ | ------------------------------------------- | -------------------------------------------------- |
| Showcase App (xterm)  | `web/showcase-app.tsx`          | Renders demos in xterm.js (legacy)         | `docs/public/examples/showcase.html`        | Superseded by canvas showcase                      |
| Showcase App (canvas) | `web/showcase-canvas-app.tsx`   | Renders demos on canvas for VitePress docs | `docs/public/examples/showcase-canvas.html` | Primary showcase — used by ShowcaseGallery         |
| Showcase Registry     | `web/showcases/index.tsx`       | Registry of 5 web-ready demos              | `web/showcase-app.tsx`                      | dashboard, kanban, components, dev-tools, textarea |
| Viewer App            | `web/viewer-app.tsx`            | Web version of the example viewer          | `docs/public/examples/viewer.html`          | Embedded in docs index page                        |
| Xterm App             | `web/xterm-app.tsx`             | Standalone xterm.js renderer               | `docs/public/examples/xterm.html`           | General-purpose web renderer                       |
| DOM App               | `web/dom-app.tsx`               | Experimental DOM renderer                  | `docs/public/examples/dom.html`             | Experimental                                       |
| Canvas App            | `web/canvas-app.tsx`            | Experimental Canvas2D renderer             | `docs/public/examples/canvas.html`          | Experimental                                       |
| Playground            | `playground/playground-app.tsx` | Quick prototyping playground               | `playground/index.html`                     | Web-based                                          |

## Screenshots

### docs/public/screenshots/ (used by DemoScreenshot component on silvery.dev)

| Screenshot       | Source Demo            | Used By                                                                                                       |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `dashboard.png`  | `layout/dashboard.tsx` | `docs/examples/layout.md`, `docs/examples/tables.md`, `docs/examples/scrollback.md`                           |
| `kanban.png`     | `apps/kanban.tsx`      | `docs/guide/scrolling.md`                                                                                     |
| `components.png` | `apps/components.tsx`  | `docs/examples/components.md`, `docs/examples/forms.md`, `docs/guides/components.md`, `docs/api/use-focus.md` |
| `dev-tools.png`  | `apps/dev-tools.tsx`   | None (only via ShowcaseGallery)                                                                               |
| `textarea.png`   | `apps/textarea.tsx`    | `docs/examples/ai-chat.md`                                                                                    |

### docs/images/ (generated by screenshots/generate.tsx)

| Screenshot            | Source Demo                    | Used By                   |
| --------------------- | ------------------------------ | ------------------------- |
| `dashboard.png`       | Static version in generate.tsx | README, general marketing |
| `kanban.png`          | Static version in generate.tsx | README, general marketing |
| `task-list.png`       | Static version in generate.tsx | README, general marketing |
| `layout-feedback.png` | Static version in generate.tsx | README, general marketing |

## Web Showcase Coverage

The web showcase (ShowcaseGallery on silvery.dev) registers only 5 of 37 public demos:

| Registered | Demo            | Notes                                                               |
| ---------- | --------------- | ------------------------------------------------------------------- |
| Yes        | Dashboard       | Primary showcase demo                                               |
| Yes        | Kanban Board    | Multi-column layout                                                 |
| Yes        | Components      | 30+ component gallery                                               |
| Yes        | Dev Tools       | Log viewer                                                          |
| Yes        | TextArea        | Note editor                                                         |
| **No**     | AI Coding Agent | Comment in registry: "disabled until they render well in web xterm" |
| **No**     | CLI Wizard      | Not registered                                                      |
| **No**     | Explorer        | Not registered                                                      |
| **No**     | Gallery         | Requires Kitty graphics                                             |
| **No**     | Theme           | Not registered                                                      |
| **No**     | Virtual 10K     | Not registered                                                      |
| **No**     | all others      | Not registered                                                      |

## Issues Found

### Orphaned Demos (exist but not linked from any doc page)

These demos exist and work but are not referenced by any documentation page (only listed in `examples/index.md` catalog):

| Demo              | Path                           | Why It Matters                                                     |
| ----------------- | ------------------------------ | ------------------------------------------------------------------ |
| Async Data        | `apps/async-data.tsx`          | Only React Suspense demo; should be in a "React Features" doc page |
| Clipboard         | `apps/clipboard.tsx`           | Should be referenced from Terminal Protocols page                  |
| Gallery           | `apps/gallery.tsx`             | Should be referenced from Terminal Protocols page                  |
| Inline Bench      | `apps/inline-bench.tsx`        | Benchmark utility -- reasonable to not document                    |
| Layout Ref        | `apps/layout-ref.tsx`          | Should be referenced from Layout page                              |
| Outline           | `apps/outline.tsx`             | Should be referenced from Layout page                              |
| Paste Demo        | `apps/paste-demo.tsx`          | Should be referenced from Terminal Protocols page                  |
| Scroll            | `apps/scroll.tsx`              | Should be referenced from Scrollback or Layout page                |
| Search Filter     | `apps/search-filter.tsx`       | Should be referenced from Tables & Data page                       |
| Terminal          | `apps/terminal.tsx`            | Should be referenced from Terminal Protocols page                  |
| Theme             | `apps/theme.tsx`               | Should have its own doc page or be in Components                   |
| Transform         | `apps/transform.tsx`           | Niche; reasonable to not document                                  |
| Virtual 10K       | `apps/virtual-10k.tsx`         | Should be referenced from Tables & Data page                       |
| Live Resize       | `layout/live-resize.tsx`       | Should be referenced from Layout page                              |
| Overflow          | `layout/overflow.tsx`          | Should be referenced from Layout page                              |
| Elm Counter       | `runtime/elm-counter.tsx`      | Referenced from runtime-layers.md but not examples/ pages          |
| Pipe Composition  | `runtime/pipe-composition.tsx` | Should be referenced from runtime-layers.md                        |
| All inline/ demos | `inline/*.tsx`                 | Only Scrollback is referenced from docs                            |
| All kitty/ demos  | `kitty/*.tsx`                  | Referenced from terminal.md but only as `bun examples/` commands   |

### Broken/Missing Screenshot References

| Doc Page                      | Screenshot Referenced         | Exists? | Notes                                                                 |
| ----------------------------- | ----------------------------- | ------- | --------------------------------------------------------------------- |
| `docs/examples/scrollback.md` | `dashboard.png`               | Yes     | Wrong screenshot -- should show scrollback/inline mode, not dashboard |
| `docs/examples/tables.md`     | `dashboard.png`               | Yes     | Reuses dashboard screenshot -- should show data-explorer or explorer  |
| `docs/examples/ai-chat.md`    | `textarea.png` (via LiveDemo) | Yes     | Shows textarea instead of AI chat -- aichat screenshot doesn't exist  |

### Missing Screenshots

| Demo                     | Has Screenshot? | Notes                                    |
| ------------------------ | --------------- | ---------------------------------------- |
| AI Coding Agent (aichat) | No              | Would be the best showcase screenshot    |
| CLI Wizard               | No              | Visually impressive multi-step flow      |
| Explorer                 | No              | 2000+ rows log viewer                    |
| Gallery                  | No              | Kitty-dependent; may not screenshot well |
| Theme                    | No              | 38-palette browser would showcase well   |
| Virtual 10K              | No              | Impressive scale demo                    |
| Panes                    | No              | tmux-style split would showcase well     |

### Duplicate/Overlapping Demos

| Demo A                                   | Demo B                                       | Overlap                                                                                                   |
| ---------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Data Explorer (`apps/data-explorer.tsx`) | Explorer (`apps/explorer.tsx`)               | Both show process tables with search + VirtualList. Explorer is a superset (adds logs tab, live jitter)   |
| Scroll (`apps/scroll.tsx`)               | Virtual List (`components/virtual-list.tsx`) | Both demonstrate scrollable lists. Scroll uses overflow="scroll", Virtual List uses VirtualList component |
| Gallery paint tab (`apps/gallery.tsx`)   | Paint (`kitty/paint.tsx`)                    | Both have half-block pixel drawing. Gallery is simpler version, Paint is flagship with Kitty overlay      |
| Canvas (`kitty/canvas.tsx`)              | Gallery paint tab (`apps/gallery.tsx`)       | Both do half-block pixel drawing, but Canvas is raw mouse-driven, Gallery is keyboard-driven              |

### Doc Pages That Reference Non-Existent Demos

No broken links found. All `bun examples/` paths in doc pages correspond to existing files.

## Recommendations

1. **Add screenshots** for AI Coding Agent, CLI Wizard, Theme, and Panes -- these are visually impressive demos that would strengthen the docs
2. **Fix mismatched screenshots** on scrollback.md and tables.md doc pages
3. **Register more web showcases** -- CLI Wizard, Explorer, and Theme would work well in xterm.js
4. **Link orphaned demos** from relevant doc pages (Layout Ref from Layout, Search Filter from Tables, etc.)
5. **Consider consolidating** Data Explorer into Explorer (Explorer is a strict superset)
6. **Add a "React Features" doc page** covering Async Data (Suspense), Search Filter (useDeferredValue/useTransition)
