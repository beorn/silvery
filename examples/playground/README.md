# inkx Canvas Playground

Interactive browser demo of inkx's Canvas 2D adapter. Renders React components to an HTML5 `<canvas>` element using the same layout engine and rendering pipeline as the terminal adapter.

## Quick Start

```bash
# Build the playground bundle
cd vendor/beorn-inkx
bun run examples/playground/build.ts

# Open in browser
open examples/playground/index.html
```

No dev server required -- just open `index.html` directly in any modern browser.

## What It Shows

The playground includes seven preset examples accessible via buttons or number keys (1-7):

| # | Preset     | Demonstrates                                               |
|---|------------|------------------------------------------------------------|
| 1 | Hello      | Basic Box + Text, `useContentRect()` size display          |
| 2 | Text       | Bold, italic, underline styles (single/double/curly/etc.)  |
| 3 | Colors     | Named ANSI colors, hex, RGB, background fills              |
| 4 | Flexbox    | Row/column layouts, `flexGrow`, `gap`, nested panels       |
| 5 | Borders    | single, double, round, bold border styles                  |
| 6 | Dashboard  | Multi-panel system monitor layout                          |
| 7 | Responsive | Layout adapts between horizontal/vertical based on width   |

Resize the browser window to see layouts recompute. The canvas size is shown in the bottom-right corner.

## Architecture

The playground uses the same rendering pipeline as inkx's terminal mode:

```
React JSX
  |  React reconciler builds InkxNode tree
  v
Flexx layout engine (pure JS flexbox)
  |  Computes { x, y, width, height } for every node
  v
Canvas adapter (CanvasRenderBuffer)
  |  drawText(), fillRect(), drawChar() to OffscreenCanvas
  v
Visible <canvas> element
  |  ctx.drawImage(offscreenCanvas, 0, 0)
  v
Browser display
```

Key files:
- `src/adapters/canvas-adapter.ts` -- Canvas `RenderAdapter` implementation
- `src/canvas/index.ts` -- `renderToCanvas()` entry point and React integration
- `src/render-adapter.ts` -- The `RenderAdapter` interface shared by all targets

## Building a Full Playground (Live JSX Editing)

A static HTML page cannot bundle a JSX transpiler. For a full live-editing experience with Monaco editor, see `docs/playground-design.md`. The architecture uses:

- **Vite** for dev server and HMR
- **Monaco Editor** for JSX editing with TypeScript intellisense
- **Sucrase** (in-browser) for JSX transpilation
- **inkx/canvas** for rendering the user's components

Deployment targets: GitHub Pages (static export), StackBlitz (zero-install), or self-hosted.
