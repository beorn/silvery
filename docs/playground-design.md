# Canvas Playground Design

Design document for a full interactive playground where users can write JSX and see it rendered to canvas in real time. The basic static playground lives at `examples/playground/`; this document describes the architecture for a live-editing version.

## Goals

1. Users paste or write JSX in a code editor
2. Output renders to a canvas in real time (sub-second feedback)
3. No local install required (runs entirely in the browser)
4. Demonstrates inkx's multi-target architecture (same components, different renderers)

## Architecture

```
+---------------------------+     +---------------------------+
|     Monaco Editor         |     |     Canvas Output         |
|                           |     |                           |
|  function App() {         |     |  +-------------------+   |
|    return (               |     |  | inkx Canvas       |   |
|      <Box border="single">| --> |  | Rendering         |   |
|        <Text>Hello</Text> |     |  |                   |   |
|      </Box>               |     |  +-------------------+   |
|    );                     |     |                           |
|  }                        |     |                           |
+---------------------------+     +---------------------------+
         |                                    ^
         | (1) Edit                           | (4) drawImage
         v                                    |
  +------------------+                +-----------------+
  | Sucrase          |                | OffscreenCanvas |
  | JSX -> JS        | ----(2)-----> | Buffer          |
  +------------------+    eval()     +-----------------+
                           |                  ^
                           v                  | (3) render
                    +--------------+          |
                    | React        |----------+
                    | Reconciler   |
                    | + Flexx      |
                    +--------------+
```

### Pipeline

1. **Edit**: User modifies JSX in Monaco Editor
2. **Transpile**: Sucrase converts JSX to plain JS (fast, no Babel overhead)
3. **Evaluate**: `new Function()` creates the component from transpiled code
4. **Render**: inkx's React reconciler + Flexx layout + Canvas adapter render to OffscreenCanvas
5. **Display**: OffscreenCanvas drawn to visible `<canvas>` element

### Why Sucrase (Not Babel)

| Feature        | Sucrase    | Babel      |
|----------------|------------|------------|
| Bundle size    | ~120 KB    | ~800 KB    |
| Transform time | <5 ms      | ~50 ms     |
| JSX support    | Yes        | Yes        |
| TypeScript     | Yes (strip)| Yes        |
| Browser usage  | Direct ESM | Needs shim |

Sucrase is purpose-built for development transforms. It strips types and converts JSX without a full AST transform pipeline, making it ideal for a live editor.

## Tech Stack

| Component        | Choice              | Rationale                                       |
|------------------|---------------------|-------------------------------------------------|
| Build tool       | Vite                | Fast HMR, ESM-native, simple config             |
| Code editor      | Monaco Editor       | VSCode engine, TypeScript intellisense, JSX      |
| JSX transpiler   | Sucrase             | Fast, small, browser-compatible                  |
| UI framework     | React               | Already a dependency of inkx                     |
| Layout engine    | Flexx               | Pure JS, synchronous init, no WASM               |
| Canvas rendering | inkx/canvas         | The whole point                                  |

## Project Structure

```
playground/
  index.html          -- Entry point
  src/
    main.tsx          -- App entry, layout, state management
    Editor.tsx        -- Monaco editor wrapper with JSX defaults
    Preview.tsx       -- Canvas output with error boundary
    presets.ts        -- Built-in example components
    transpile.ts      -- Sucrase wrapper with error handling
    evaluate.ts       -- Safe eval with React + inkx in scope
  vite.config.ts      -- Build configuration
  package.json        -- Dependencies
```

## Editor Component

Monaco provides:
- JSX syntax highlighting
- TypeScript type checking (with inkx `.d.ts` loaded)
- Auto-completion for `<Box>`, `<Text>`, `useContentRect()`, etc.
- Error markers from transpilation failures

```tsx
// Editor.tsx (sketch)
import * as monaco from 'monaco-editor';

function Editor({ value, onChange }) {
  const editorRef = useRef(null);

  useEffect(() => {
    // Load inkx type definitions for intellisense
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      inkxTypeDefs,
      'inkx.d.ts'
    );
  }, []);

  return <div ref={editorRef} style={{ height: '100%' }} />;
}
```

## Safe Evaluation

User code runs in a sandboxed scope with only React and inkx exports available:

```tsx
// evaluate.ts (sketch)
import React from 'react';
import { Box, Text, useContentRect, useScreenRect } from 'inkx/canvas';

const scope = { React, Box, Text, useContentRect, useScreenRect };

function evaluateComponent(code: string): React.FC | null {
  try {
    const fn = new Function(
      ...Object.keys(scope),
      `${code}\nreturn typeof App !== 'undefined' ? App : null;`
    );
    return fn(...Object.values(scope));
  } catch (err) {
    return null; // Show error in UI
  }
}
```

### Error Handling

Three error categories, each shown differently:

| Error Type       | Source                | Display                        |
|------------------|-----------------------|--------------------------------|
| Syntax error     | Sucrase transpilation | Red underline in editor        |
| Runtime error    | `new Function()`      | Error banner above canvas      |
| Render error     | React reconciler      | Error boundary with stack      |

All errors are caught and displayed; the playground never crashes.

## Debounced Rendering

To avoid excessive re-renders while typing:

```tsx
// Debounce pipeline: edit -> 150ms pause -> transpile -> eval -> render
const debouncedRender = useMemo(
  () => debounce((code: string) => {
    const js = transpile(code);     // Sucrase JSX -> JS
    const Comp = evaluate(js);       // new Function -> React.FC
    if (Comp) {
      instance.rerender(<Comp />);   // inkx canvas render
    }
  }, 150),
  [instance]
);
```

150ms debounce balances responsiveness with render cost. Transpilation alone is <5ms, so the bottleneck is React reconciliation + layout + canvas paint.

## Preset Examples

Ship with built-in examples users can load:

| Preset          | Shows                                           |
|-----------------|--------------------------------------------------|
| Hello World     | Minimal Box + Text                               |
| Text Styles     | Bold, italic, underline, strikethrough, colors   |
| Flexbox Layout  | Row/column, flexGrow, gap, nested panels         |
| Dashboard       | Multi-panel layout with borders and status        |
| Responsive      | `useContentRect()` adapting layout to size       |
| Color Palette   | Named colors, hex, RGB backgrounds                |
| Border Gallery  | All border styles: single, double, round, bold   |

## Deployment Options

### GitHub Pages (Recommended)

```bash
# Build static site
cd playground
bun run build   # Vite produces dist/

# Deploy
# - Push dist/ to gh-pages branch, or
# - Configure GitHub Actions to build on push
```

Pros: Free hosting, custom domain, automatic deploys via CI.

### StackBlitz / CodeSandbox

Create a template repository that opens directly in the browser IDE:

```
https://stackblitz.com/github/user/inkx-playground
```

Pros: Zero-install, users can fork and modify, full IDE experience.
Cons: Requires published npm packages (or vendored dependencies).

### Self-Hosted

Any static file server works since the build output is plain HTML/JS/CSS:

```bash
bun run build
# Serve dist/ from any HTTP server
bunx serve dist/
```

## Implementation Phases

### Phase 1: Static Playground (Done)

The current `examples/playground/index.html` with pre-built presets and button switching. No code editing, but demonstrates the Canvas adapter working in a browser.

### Phase 2: Live Editor

Add Monaco Editor with Sucrase transpilation. Users can edit JSX and see results. Requires Vite for bundling Monaco (it is large).

Estimated scope: ~500 lines of new code, plus build configuration.

### Phase 3: Shareable Links

Encode the editor content in the URL hash (base64 or LZ-compressed) so users can share playground links:

```
https://inkx-playground.example.com/#code=ZnVuY3Rpb24gQXBwKCkg...
```

### Phase 4: Dual Output

Show both Canvas and DOM adapter output side by side, demonstrating that the same JSX produces identical layouts on different render targets.

## Size Budget

| Component         | Size (gzip) |
|-------------------|-------------|
| inkx + React      | ~90 KB      |
| Monaco Editor     | ~800 KB     |
| Sucrase           | ~40 KB      |
| Playground UI     | ~5 KB       |
| **Total**         | **~935 KB** |

Monaco dominates. For a lighter alternative, consider CodeMirror 6 (~150 KB) with a JSX mode, reducing total to ~285 KB. The tradeoff is less TypeScript intellisense.

## See Also

- `examples/playground/` -- Static playground (Phase 1)
- `examples/web/canvas.html` -- Minimal Canvas adapter demo
- `docs/architecture.md` -- RenderAdapter interface
- `docs/roadmap.md` -- Multi-target rendering vision
