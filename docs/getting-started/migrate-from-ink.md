---
title: Migrate from Ink
description: Switch an Ink 7.0 app to Silvery — drop-in @silvery/ink compat layer, then opt into Silvery-native features at your own pace.
---

# Migrate from Ink

Silvery is a drop-in for Ink. Change one import line and your app keeps running — same `Box`, `Text`, `useInput`, `useApp`, `useFocus`, `usePaste`, `useAnimation`, `useWindowSize`, `useStdout`, `Static`. **918 of Ink 7.0's 931 tests (~98.6%) pass on the compat layer.** Then opt into Silvery-native features (responsive layout, scroll containers, mouse, find, clipboard, 45+ components) one at a time.

## The 60-second migration

::: code-group

```bash [bun]
bun remove ink && bun add silvery react
```

```bash [npm]
npm uninstall ink && npm install silvery react
```

```bash [pnpm]
pnpm remove ink && pnpm add silvery react
```

```bash [yarn]
yarn remove ink && yarn add silvery react
```

:::

Change every `from "ink"` import to `from "silvery/ink"`:

```diff
- import { Box, Text, render, useInput } from "ink"
+ import { Box, Text, render, useInput } from "silvery/ink"
```

That's it. Your app should compile and run.

If you used Chalk, swap that too:

```diff
- import chalk from "chalk"
+ import chalk from "silvery/chalk"
```

The Chalk compat layer passes **32 of 32 tests (100%)**.

## What changes (and what doesn't)

**Nothing changes about your component code.** `<Box>`, `<Text>`, `useInput`, `useFocus`, `useFocusManager`, `useApp`, `useStdout`, `useStdin`, `useAnimation`, `useWindowSize`, `useCursor`, `usePaste`, `Static`, `Transform`, `render()` — all the same names, same props, same behavior.

**What's different** — 13 intentional design choices in the compat layer:

- **W3C flexbox spec over Yoga quirks** (4 tests) — Silvery's [Flexily](https://beorn.codes/flexily) layout engine follows the W3C spec strictly. Yoga has non-standard behaviors around `flex-wrap` and `aspect-ratio` that some Ink tests expect. If you need exact Yoga parity, [Silvery supports Yoga as a pluggable layout engine](/guide/layout-engine).
- **Build artifact format** (2 tests) — Ink expects a `./build/` directory. Silvery ships TypeScript source (for Bun) plus pre-built `dist/` (for Node).
- **Minor rendering edge cases** (~7 tests) — SGR attribute emission order (dim+bold), `measureElement` timing in synchronous render, `renderToString` effect ordering. Produces identical visual output.

[Full compatibility table →](/guide/silvery-vs-ink#compatibility)

## What you gain (opt-in, when you're ready)

Once the import swap works, you can adopt Silvery-native features incrementally. None of these break your existing Ink-style code.

### Switch one component to native imports

```diff
- import { Box, Text } from "silvery/ink"
+ import { Box, Text } from "silvery"
```

The native `silvery` exports are the same `Box` and `Text` — the compat layer is a thin shim. Imports from `silvery` give you access to the broader API (`useBoxRect`, native focus, scroll containers, etc.) in the same file.

### Responsive layout — `useBoxRect()` returns real dimensions during render

In Ink, `useBoxMetrics()` returns `{ width: 0, height: 0 }` on the first render and updates via `useEffect`. That means N nesting levels = N visible flickers.

Silvery's `useBoxRect()` returns actual dimensions on the first render — no `width: 0` flash:

```tsx
import { Box, Text, useBoxRect } from "silvery"

function Card({ title }: { title: string }) {
  const { width } = useBoxRect()
  return (
    <Box>
      <Text>{width >= 32 ? title : title.slice(0, width - 1) + "…"}</Text>
    </Box>
  )
}
```

[Responsive Layout guide →](/guide/responsive-layout)

### Scroll containers — `overflow="scroll"` with virtualization

Ink core has `visible` / `hidden` only ([#222](https://github.com/vadimdemedes/ink/issues/222), open since 2019). Silvery has true scroll containers with virtualization, sticky positioning, and native arrow-key/wheel scrolling:

```tsx
<Box height={20} overflow="scroll">
  <LongList items={items} />
</Box>
```

[Scrolling guide →](/guide/scrolling) · [Sticky positioning →](/guide/layout-coordinates)

### Mouse, text selection, find, clipboard

Ink has none of these in core. Silvery ships them all:

- **Mouse events** — `onClick`, `onWheel`, drag-and-drop, hit testing. [Event Handling →](/guide/event-handling)
- **Text selection** — mouse drag, word/line selection, `userSelect` boundaries. [Text Selection →](/guide/text-selection)
- **Find** — `Ctrl+F` with match highlighting and `n`/`N` navigation. [Find guide →](/guide/find)
- **Clipboard** — OSC 52 paste/copy, `Esc, v` copy-mode for vim-style yanking. [Clipboard guide →](/guide/clipboard)

### 45+ built-in components

Ink core has 6 components. The [`@inkjs/ui`](https://github.com/vadimdemedes/ink-ui) package adds 13 more. Silvery ships 45+ in core — `SelectList`, `TextInput`, `TextArea`, `Table`, `TreeView`, `Tabs`, `CommandPalette`, `ModalDialog`, `PickerDialog`, `Toast`, `Spinner`, `ProgressBar`, `Form`, `SplitView`, and more. Every component participates in focus, mouse, and keybindings automatically.

[Components overview →](/guides/components)

### Performance — 3–27× faster on mounted rerenders

Cell-level dirty tracking, per-node skip for unchanged subtrees, cell-level buffer diff. Native scrollback preserved in inline mode. Typical interactive update on a 1000-node tree: ~169 microseconds.

[Benchmarks →](/guide/silvery-vs-ink#performance)

## What about Ink plugins?

Some Ink ecosystem packages (`ink-select-input`, `ink-text-input`, `ink-spinner`, etc.) work unchanged against `silvery/ink`. Others rely on Ink's private DOM-tree internals and may need a compat shim or replacement.

When swapping an Ink ecosystem component, check if Silvery has a native equivalent first — it usually does, and the native version is faster and more featureful.

| Ink ecosystem          | Silvery native    | Notes                                                             |
| ---------------------- | ----------------- | ----------------------------------------------------------------- |
| `ink-select-input`     | `SelectList`      | Search, multi-select, virtualization, keyboard + mouse            |
| `ink-text-input`       | `TextInput`       | Readline binding, full Unicode, paste, IME                        |
| `ink-spinner`          | `Spinner`         | Built-in; `Spinner.start("…")` CLI helper too                     |
| `ink-table`            | `Table`           | Responsive columns, search/filter                                 |
| `ink-progress-bar`     | `ProgressBar`     | Full-featured, theme-aware                                        |
| `ink-syntax-highlight` | _(no equivalent)_ | Use a syntax-highlighter library and render via `<Text>` directly |

## Want the full feature comparison?

The [Silvery vs Ink](/guide/silvery-vs-ink) page has the full feature matrix, performance numbers, compatibility breakdown, and migration scenarios:

- [Compatibility coverage](/guide/silvery-vs-ink#compatibility) — exactly which Ink tests pass, which 13 fail and why
- [Performance & size](/guide/silvery-vs-ink#performance-size) — benchmarks for mounted rerender, cold render, bundle
- [Compat Layer Architecture](/reference/compatibility#compat-layer-architecture) — how the adapters bridge Ink APIs to silvery-native systems

## Need help?

- Open an [issue on GitHub](https://github.com/beorn/silvery/issues) — happy to look at your migration
- See [Troubleshooting](/guide/troubleshooting) for common gotchas
- Browse [Imports & Subpaths](/guide/imports) for the full mapping between `silvery`, `silvery/ink`, `silvery/chalk`, and `silvery/runtime`
