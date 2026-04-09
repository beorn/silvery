# Migration Guide Validation: Real Ink Apps

Validates the Silvery migration guide (`docs/guide/migration.md`) against real-world Ink CLI applications. For each app, documents what Ink APIs it uses and whether `silvery/ink` covers them.

---

## Methodology

- Selected 3 popular, production Ink CLI apps with diverse API usage patterns
- Searched each codebase (via `gh search code`) for all `from 'ink'` imports
- Cataloged every Ink API used: components, hooks, types, functions
- Checked each against `silvery/ink` (`packages/ink/src/ink.ts`) and `@silvery/ag-react` exports

---

## App 1: Shopify CLI (`Shopify/cli`)

**What it is:** Official Shopify CLI for building apps, themes, and storefronts. One of the largest Ink consumers in production, with 20+ files importing from Ink.

**Ink version:** `ink@4.4.1` (via `@shopify/cli-kit`)

### Ink APIs Used

| API              | Type      | Files | silvery/ink | Notes                                                                                                               |
| ---------------- | --------- | ----- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `Box`            | Component | 15+   | Yes         | Flexbox layout containers throughout                                                                                |
| `Text`           | Component | 15+   | Yes         | Text rendering with color, bold, etc.                                                                               |
| `Static`         | Component | 1     | Yes         | `ConcurrentOutput.tsx` — preserving log history                                                                     |
| `useInput`       | Hook      | 3     | Yes         | Keyboard input for prompts, selection                                                                               |
| `useApp`         | Hook      | 2     | Yes         | Exit handling (`AutocompletePrompt`, abort signal)                                                                  |
| `useStdin`       | Hook      | 1     | Yes         | Raw mode check in exit-on-ctrl-c hook                                                                               |
| `useStdout`      | Hook      | 2     | Yes         | Terminal dimensions for responsive layout                                                                           |
| `measureElement` | Function  | 1     | Yes         | `PromptLayout.tsx` — measuring prompt height                                                                        |
| `render`         | Function  | 1     | Yes         | Aliased as `inkRender` in `ui.tsx`                                                                                  |
| `Key`            | Type      | 2     | Yes         | Keyboard key type annotation                                                                                        |
| `RenderOptions`  | Type      | 2     | Yes         | Render configuration                                                                                                |
| `TextProps`      | Type      | 1     | Yes         | Extending Text component props                                                                                      |
| `DOMElement`     | Type      | 2     | Partial     | Used for `measureElement` ref typing. Silvery uses different internal node types but `measureElement` accepts refs. |

### Public API Re-export

Shopify wraps Ink in a public API module (`cli-kit/src/public/node/ink.ts`):

```ts
export { Box, Text, Static, useInput, useStdin, useStdout, measureElement } from "ink"
```

This is exactly the subset that `silvery/ink` exports.

### Migration Assessment

**Status: FULLY COMPATIBLE**

All 13 Ink APIs used by Shopify CLI are exported by `silvery/ink`. The only edge case is `DOMElement` type — Silvery uses `BoxHandle` for refs, but `measureElement` accepts the same ref pattern. Shopify's usage (`useRef<DOMElement>(null)`) would need the type changed to `BoxHandle`, but the runtime behavior is identical.

**Migration steps:**

1. `bun remove ink` / `bun add silvery`
2. Replace `from 'ink'` with `from 'silvery/ink'`
3. Change `DOMElement` refs to `BoxHandle` (2 files)
4. `useStdout().stdout.columns/rows` works identically

---

## App 2: Gatsby CLI (`gatsbyjs/gatsby`)

**What it is:** Build tool CLI for the Gatsby static site framework. Uses Ink for its reporter/logger UI showing build progress, errors, and page generation status.

**Ink version:** `ink@^3.2.0` (Ink 3.x)

### Ink APIs Used

| API         | Type      | Files           | silvery/ink | Notes                                                      |
| ----------- | --------- | --------------- | ----------- | ---------------------------------------------------------- |
| `Box`       | Component | 3+              | Yes         | Layout: `flexDirection`, `marginTop`, `height`, `flexGrow` |
| `Text`      | Component | 3+              | Yes         | With `wrap="truncate"` prop                                |
| `Static`    | Component | 1               | Yes         | Preserving completed log messages                          |
| `useStdout` | Hook      | 1               | Yes         | Terminal dimensions + resize events                        |
| `render`    | Function  | 1               | Yes         | Entry point rendering                                      |
| `Spinner`   | Component | via ink-spinner | N/A         | Third-party `ink-spinner@4.0.3`                            |

### Community Packages

- `ink-spinner@4.0.3` — Loading spinner. Renders `<Text>` with animated characters. Would need silvery-compatible version or replacement with `@silvery/ag-react/ui` `<Spinner>` component.

### Key Patterns

1. **`<Static items={messages}>`** — Gatsby uses `Static` to freeze completed build messages in scrollback while progress updates render below. This is a core Ink pattern that Silvery supports.

2. **`useStdout()` for responsive UI** — Reads `stdout.columns` and `stdout.rows`, listens for `resize` events. Silvery's `useStdout()` provides identical API.

3. **`<Text wrap="truncate">`** — Gatsby uses Ink's text truncation. Silvery supports `wrap="truncate"`, `"truncate-start"`, and `"truncate-middle"` (more options than Ink).

### Migration Assessment

**Status: FULLY COMPATIBLE (core APIs)**

All core Ink APIs used by Gatsby CLI are covered. The only dependency needing attention is `ink-spinner`, which has a trivial Silvery equivalent (`@silvery/ag-react/ui` exports `<Spinner>`).

**Migration steps:**

1. `bun remove ink ink-spinner` / `bun add silvery`
2. Replace `from 'ink'` with `from 'silvery/ink'`
3. Replace `ink-spinner` with `import { Spinner } from '@silvery/ag-react/ui'` (same `<Spinner>` API)

**Behavioral difference:** Text that overflowed in Ink 3 will now wrap by default in Silvery. Gatsby already uses `wrap="truncate"` where truncation is desired, so this should have no visible impact.

---

## App 3: Terraform CDK CLI (`hashicorp/terraform-cdk`)

**What it is:** CLI for defining infrastructure resources using programming constructs with Terraform. Uses Ink for deployment summaries, diff output, and interactive prompts.

**Ink version:** `ink@3.2.0`

### Ink APIs Used

| API        | Type      | Files                | silvery/ink | Notes                     |
| ---------- | --------- | -------------------- | ----------- | ------------------------- |
| `Box`      | Component | 5+                   | Yes         | Layout containers         |
| `Text`     | Component | 5+                   | Yes         | Status output, summaries  |
| `render`   | Function  | 1+                   | Yes         | Entry point               |
| `useInput` | Hook      | via ink-select-input | N/A         | Through community package |

### Community Packages

| Package                     | Version | Purpose            | Silvery Equivalent                    |
| --------------------------- | ------- | ------------------ | ------------------------------------- |
| `ink-select-input`          | 4.2.2   | Selection lists    | `@silvery/ag-react/ui` `<SelectList>` |
| `ink-table`                 | 3.1.0   | Tabular output     | `@silvery/ag-react/ui` `<Table>`      |
| `ink-spinner`               | 4.0.3   | Loading indicators | `@silvery/ag-react/ui` `<Spinner>`    |
| `ink-testing-library`       | 2.1.0   | Test utilities     | `@silvery/test` `createRenderer`      |
| `ink-use-stdout-dimensions` | 1.0.5   | Terminal size      | `useStdout()` or `useBoxRect()`   |

### Key Patterns

1. **Simple component usage** — CDKTF uses `Box` and `Text` for straightforward deployment summaries. No complex layout patterns.

2. **Heavy community package reliance** — 5 community packages. This is the main migration challenge — not the core Ink API, but the ecosystem.

3. **`ink-testing-library`** — Used for testing UI components. Silvery's `@silvery/test` provides `createRenderer()` with richer capabilities (locators, auto-refresh).

### Migration Assessment

**Status: CORE COMPATIBLE, ECOSYSTEM MIGRATION NEEDED**

Core Ink APIs (`Box`, `Text`, `render`) are fully covered. The challenge is 5 community packages that need Silvery equivalents:

- `ink-select-input` -> `@silvery/ag-react/ui` `<SelectList>` (different API, similar functionality)
- `ink-table` -> `@silvery/ag-react/ui` `<Table>` (different API, richer features)
- `ink-spinner` -> `@silvery/ag-react/ui` `<Spinner>` (compatible)
- `ink-testing-library` -> `@silvery/test` `createRenderer` (more capable)
- `ink-use-stdout-dimensions` -> `useStdout()` built-in (no extra package needed)

**Migration steps:**

1. `bun remove ink ink-select-input ink-table ink-spinner ink-testing-library ink-use-stdout-dimensions`
2. `bun add silvery`
3. Replace `from 'ink'` with `from 'silvery/ink'`
4. Replace community packages with Silvery built-in equivalents (API changes required for select-input and table)
5. Replace `ink-testing-library` with `@silvery/test` (API change: `render()` -> `createRenderer()`)

---

## Cross-App API Coverage Summary

### Core Ink APIs Across All 3 Apps

| API                    | Shopify | Gatsby | CDKTF      | silvery/ink                   |
| ---------------------- | ------- | ------ | ---------- | ----------------------------- |
| `Box`                  | Yes     | Yes    | Yes        | **Covered**                   |
| `Text`                 | Yes     | Yes    | Yes        | **Covered**                   |
| `Static`               | Yes     | Yes    | -          | **Covered**                   |
| `render`               | Yes     | Yes    | Yes        | **Covered**                   |
| `useInput`             | Yes     | -      | (indirect) | **Covered**                   |
| `useApp`               | Yes     | -      | -          | **Covered**                   |
| `useStdin`             | Yes     | -      | -          | **Covered**                   |
| `useStdout`            | Yes     | Yes    | (indirect) | **Covered**                   |
| `measureElement`       | Yes     | -      | -          | **Covered**                   |
| `Key` (type)           | Yes     | -      | -          | **Covered**                   |
| `RenderOptions` (type) | Yes     | -      | -          | **Covered**                   |
| `TextProps` (type)     | Yes     | -      | -          | **Covered**                   |
| `DOMElement` (type)    | Yes     | -      | -          | **Partial** (use `BoxHandle`) |

### Ink APIs NOT Used by Any of These Apps

These Ink 6 APIs exist but none of the 3 apps use them:

- `useFocus` / `useFocusManager` — Silvery has tree-based focus (richer)
- `useStderr` — Silvery supports via `useStdout` pattern
- `usePaste` — Silvery has `usePaste` hook
- `useCursor` — Silvery has `useCursor` hook
- `useBoxMetrics` / `useWindowSize` — Ink 6 additions, Silvery has `useBoxRect`
- `useIsScreenReaderEnabled` — Ink 6 accessibility
- `Newline`, `Spacer`, `Transform` — simple components, all covered by silvery/ink
- `renderToString` — Silvery has `renderStringSync`

### Community Package Ecosystem

The biggest migration challenge is the Ink community ecosystem (~50 packages). Of the community packages used by these apps:

| ink-\* Package              | Silvery Built-in Equivalent           |
| --------------------------- | ------------------------------------- |
| `ink-spinner`               | `@silvery/ag-react/ui` `<Spinner>`    |
| `ink-select-input`          | `@silvery/ag-react/ui` `<SelectList>` |
| `ink-table`                 | `@silvery/ag-react/ui` `<Table>`      |
| `ink-testing-library`       | `@silvery/test` `createRenderer`      |
| `ink-use-stdout-dimensions` | `useStdout()` (built-in)              |

Silvery's `@silvery/ag-react/ui` package includes 23+ components that cover most of the popular `ink-*` community packages, plus additional components not available in the Ink ecosystem (TextArea, ModalDialog, CommandPalette, Image, etc.).

---

## Migration Guide Accuracy

### Confirmed Accurate

1. **"Change your imports, and your app works"** — Confirmed for core API usage. All 3 apps' core Ink imports are covered by `silvery/ink`.

2. **`render()` just needs `await`** — Shopify already uses async patterns; Gatsby and CDKTF would need minor async adjustment.

3. **`measureElement()` works** — Shopify uses it; Silvery exports it from `silvery/ink`.

4. **`useBoxRect()` as upgrade path** — Shopify's `measureElement` + manual re-render pattern could be simplified to `useBoxRect()`.

5. **Text wraps by default** — Gatsby already uses `wrap="truncate"`, so the default change has no impact. Shopify and CDKTF would need testing for unintended wrapping.

### Suggested Additions to Migration Guide

1. **Community package mapping table** — Add a section listing popular `ink-*` packages and their Silvery equivalents. This is the #1 migration friction point.

2. **`DOMElement` type migration** — Document that `DOMElement` refs should change to `BoxHandle`. This affects `measureElement` users.

3. **`ink-testing-library` migration** — Document the `render()` -> `createRenderer()` API change for test files.

4. **Ink 3 vs Ink 4/6** — Gatsby uses Ink 3 (older API). The migration guide targets Ink 4.x. Consider noting which Ink 3 patterns need extra attention (e.g., `Color` component removed in Ink 4).
