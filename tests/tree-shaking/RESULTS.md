# Tree-Shaking Verification Results

Generated 2026-03-09 by `bun vendor/silvery/tests/tree-shaking/verify.ts`.

## Method

For each entry point, a minimal file importing exports is bundled with `bun build --bundle --target=node`. The output is checked for:

1. **Bundle size** (total bytes after bundling)
2. **Whether React appears in bundles that shouldn't need it**
3. **Whether react-reconciler leaks across entry points**

Ink comparison uses the same bundler and methodology. Versions: silvery 0.0.1, ink 6.8.0, chalk 5.6.2, react 19.2.4.

## Silvery vs Ink Comparison

Gzip sizes are the primary metric (what matters for `npm install` and cold starts).

### Head-to-Head: Equivalent Imports

| What                        | Silvery (raw) | Silvery (gzip) | Ink (raw) | Ink (gzip) | Ratio (gzip)     |
| --------------------------- | ------------- | -------------- | --------- | ---------- | ---------------- |
| Core (Box, Text, render)    | 994.3 KB      | 181.1 KB       | 1852.1 KB | 347.9 KB   | **1.9x smaller** |
| With hooks (useInput, etc.) | 994.3 KB      | 181.1 KB       | 1864.1 KB | 351.0 KB   | **1.9x smaller** |
| Full barrel import          | 2375.1 KB     | 432.3 KB       | 1869.4 KB | 352.2 KB   | 1.2x larger      |
| Chalk / chalk compat        | 17.2 KB       | 4.9 KB         | 14.1 KB   | 4.1 KB     | 1.2x larger      |

### Tree-Shaking Effectiveness

| Import style                    | Silvery  | Ink      | Notes                              |
| ------------------------------- | -------- | -------- | ---------------------------------- |
| Single component (`Text` only)  | --       | 335.6 KB | Ink can't tree-shake at all        |
| Selective named imports         | 181.1 KB | 347.9 KB | Silvery: same as core              |
| Full barrel (`* as`)            | 432.3 KB | 352.2 KB | Silvery barrel pulls UI components |
| **Spread** (barrel - selective) | 251.2 KB | 4.3 KB   | Silvery has more to shake          |

Ink does not tree-shake: importing `{ Text }` alone bundles 335.6 KB gzip (96% of the full barrel). Silvery's selective imports are 58% smaller than its barrel.

### Silvery-Only Packages (No Ink Equivalent)

| Entry Point                 | Raw      | Gzip     | React? | Notes                                |
| --------------------------- | -------- | -------- | ------ | ------------------------------------ |
| `@silvery/term` (barrel)    | 378.5 KB | 83.1 KB  | No     | Full terminal runtime, React-free    |
| `@silvery/term` (selective) | 79.4 KB  | 18.7 KB  | No     | createTerm + detectColor + stripAnsi |
| `@silvery/term/ansi`        | 24.7 KB  | 6.6 KB   | No     | ANSI primitives only                 |
| `@silvery/term/runtime`     | 854.4 KB | 158.9 KB | Yes    | Layout + diff + React runtime        |
| `@silvery/tea/core`         | 0.2 KB   | 0.2 KB   | No     | Pure TEA functions                   |
| `@silvery/tea/store`        | 2.0 KB   | --       | No     | Zustand-based store                  |
| `@silvery/tea/streams`      | 1.0 KB   | --       | No     | Stream combinators                   |
| `@silvery/theme`            | 77.3 KB  | 17.7 KB  | Yes    | Theme engine + 38 palettes           |
| `@silvery/ui/cli`           | 22.9 KB  | 6.4 KB   | No     | Spinner, ProgressBar (React-free)    |
| `@silvery/ui/wrappers`      | 18.6 KB  | --       | No     | withSpinner, withProgress            |

## Tree-Shaking Verification

All 14 silvery entry points pass tree-shaking verification:

| Entry Point                  | Bundle Size | React?         | Reconciler?    | Status |
| ---------------------------- | ----------- | -------------- | -------------- | ------ |
| `@silvery/term` (barrel)     | 378.5 KB    | No             | No             | PASS   |
| `@silvery/term` (selective)  | 79.4 KB     | No             | No             | PASS   |
| `@silvery/term/ansi`         | 24.7 KB     | No             | No             | PASS   |
| `@silvery/term/hit-registry` | 42.6 KB     | Yes (expected) | No             | PASS   |
| `@silvery/tea/core`          | 0.2 KB      | No             | No             | PASS   |
| `@silvery/tea/store`         | 2.0 KB      | No             | No             | PASS   |
| `@silvery/tea/tea`           | 0.7 KB      | No             | No             | PASS   |
| `@silvery/tea/streams`       | 1.0 KB      | No             | No             | PASS   |
| `@silvery/theme` (theme.ts)  | 77.3 KB     | Yes (expected) | No             | PASS   |
| `@silvery/react`             | 994.3 KB    | Yes (expected) | Yes (expected) | PASS   |
| `@silvery/term/runtime`      | 854.4 KB    | Yes (expected) | Yes (expected) | PASS   |
| `@silvery/ui/cli`            | 22.9 KB     | No             | No             | PASS   |
| `@silvery/ui/wrappers`       | 18.6 KB     | No             | No             | PASS   |
| `silvery/chalk`              | 17.2 KB     | No             | No             | PASS   |

## Key Takeaways

1. **Silvery core is 1.9x smaller than Ink** for equivalent imports (181 KB vs 348 KB gzip). Both include React and a reconciler, but silvery's are leaner.

2. **Silvery tree-shakes; Ink does not.** Ink bundles 336-352 KB gzip regardless of what you import. Silvery ranges from 0.2 KB (tea/core) to 432 KB (full barrel) depending on imports.

3. **Silvery offers React-free packages.** Terminal primitives (`@silvery/term/ansi` at 6.6 KB gzip), state management (`@silvery/tea/core` at 0.2 KB), and CLI utilities (`@silvery/ui/cli` at 6.4 KB) all work without React. Ink has no equivalent -- it always bundles React.

4. **Silvery's barrel is larger than Ink's barrel** (432 KB vs 352 KB gzip) because silvery ships more: a full layout engine (flexily), theme system (38 palettes), incremental renderer, and 30+ UI components. This is the only metric where Ink wins.

5. **Chalk compat is comparable.** `silvery/chalk` (4.9 KB gzip) vs `chalk` (4.1 KB gzip) -- a 0.8 KB difference for a drop-in replacement that integrates with silvery's theme system.
