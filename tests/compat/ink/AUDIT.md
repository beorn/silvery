# Ink Compat Layer Audit

> **Note**: This audit was performed when compat was at an earlier stage. Current status: 98.9% (804/813). See ANALYSIS.md for the up-to-date analysis and RESULTS.md for current numbers.

## Executive Summary

The Ink compat layer (`packages/ink/src/ink.ts` + supporting files) totals ~2,935 lines across 7 files. Roughly **40-50% of this code is genuinely necessary** Ink-specific translation. The rest falls into three categories: (1) logic that could be eliminated by aligning silvery's defaults and API shape closer to Ink's, (2) entire subsystems reimplemented in the compat layer that duplicate silvery functionality with slightly different interfaces, and (3) infrastructure for the test-mode `render()` path that could be simplified if silvery's test renderer exposed a few more hooks. A realistic target is **~800-1000 lines** for a mature compat layer, achievable through a combination of silvery core changes and compat refactoring.

## Phase 2: Alignment Opportunities

### 2.1 Component Wrappers

| Compat Section                                               | Lines | Necessary?                                 | Could Align?                                | Effort | Impact |
| ------------------------------------------------------------ | ----- | ------------------------------------------ | ------------------------------------------- | ------ | ------ |
| **Box wrapper** (flexDirection/flexGrow/flexShrink defaults) | ~20   | Partially                                  | Yes - change silvery Box defaults           | Low    | High   |
| **Box overflowX/overflowY translation**                      | ~5    | Yes (Ink has per-axis overflow)            | Yes - add overflowX/overflowY to silvery    | Low    | Medium |
| **Text wrapper** (ANSI sanitization + chalk level stripping) | ~40   | Yes (Ink-specific behavior)                | No - silvery should NOT sanitize by default | -      | -      |
| **Static component** (scrollback rendering)                  | ~60   | Yes (fundamentally different architecture) | No                                          | -      | -      |
| **Newline/Spacer/Transform re-exports**                      | ~4    | Direct re-export (zero cost)               | Already aligned                             | -      | -      |

**Key finding: Box defaults.** Silvery's Box uses layout engine defaults (flexDirection: row from Yoga/Flexily). Ink explicitly sets `flexDirection: "row"`, `flexGrow: 0`, `flexShrink: 1`, `flexWrap: "nowrap"`. These are identical to CSS/Yoga defaults, so silvery's behavior is already correct. The compat wrapper explicitly re-states them to be safe. This wrapper is only ~6 lines of actual logic and is low-cost, but silvery could document that its defaults match Ink's, making the wrapper a pure passthrough.

**The real Box difference: overflowX/overflowY.** Ink supports per-axis overflow (`overflowX`, `overflowY`); silvery has unified `overflow`. The compat layer does `overflow = overflowX === "hidden" || overflowY === "hidden" ? "hidden" : undefined`. Adding `overflowX`/`overflowY` to silvery's FlexboxProps would eliminate this entirely.

### 2.2 Hooks

| Compat Section                                   | Lines | Necessary?                                | Could Align?                         | Effort | Impact |
| ------------------------------------------------ | ----- | ----------------------------------------- | ------------------------------------ | ------ | ------ |
| **useInput** (eventType numeric->string mapping) | ~30   | Yes (API difference)                      | Yes - use strings in silvery Key     | Low    | High   |
| **useApp** (direct re-export)                    | ~2    | Already aligned                           | -                                    | -      | -      |
| **useStdout** (direct re-export)                 | ~2    | Already aligned                           | -                                    | -      | -      |
| **useFocus** (separate Ink focus system)         | ~50   | Yes (completely different focus model)    | Partially - see below                | High   | High   |
| **useFocusManager** (separate Ink focus system)  | ~20   | Yes (tied to useFocus)                    | Partially                            | High   | High   |
| **useStdin** (raw mode ref counting)             | ~80   | Yes (Ink-specific stdin model)            | No                                   | -      | -      |
| **usePaste** (bracketed paste bridging)          | ~35   | Partially (silvery has paste in useInput) | Yes - expose as standalone hook      | Medium | Medium |
| **useCursor** (imperative cursor positioning)    | ~35   | Yes (different cursor model)              | No - silvery uses declarative cursor | -      | -      |
| **useWindowSize**                                | ~25   | Partially                                 | Yes - silvery could export this      | Low    | Low    |
| **useBoxMetrics**                                | ~70   | Yes (bridges timing gap)                  | Partially                            | Medium | Low    |
| **useStderr**                                    | ~15   | Yes (Ink-specific)                        | No                                   | -      | -      |

**Key finding: useInput eventType.** The ONLY difference between silvery's `Key` and Ink's `Key` is that silvery uses numeric `eventType` (1/2/3) while Ink uses string (`"press"`/`"repeat"`/`"release"`). This is a trivial change in silvery core -- use the same string type as Ink. This eliminates the entire useInput wrapper (30 lines) and makes the Key type identical.

**Key finding: Focus system duplication.** This is the **single biggest source of compat bloat**. The compat layer has its own complete focus system in `with-ink-focus.ts` (248 lines): InkFocusContext, InkFocusProvider with focusable registration, Tab/Shift+Tab navigation, focus/blur tracking. Silvery has a completely separate tree-based focus system (`useFocusable`, `FocusManager`). The two systems share zero code. The compat layer's focus system is a faithful replica of Ink's simple list-based model. Aligning these would be high-effort because the models are fundamentally different (Ink: ordered list of IDs; silvery: tree with spatial navigation).

### 2.3 Error Boundary

| Compat Section                                      | Lines | Necessary? | Could Align?                       | Effort | Impact |
| --------------------------------------------------- | ----- | ---------- | ---------------------------------- | ------ | ------ |
| **InkErrorBoundary** (stack parsing, code excerpts) | ~200  | Partially  | Yes - extract shared error display | Medium | Medium |

Silvery has `SilveryErrorBoundary` in `@silvery/react/error-boundary`. The Ink compat layer has its own `InkErrorBoundary` that formats errors with source excerpts, colored labels, and stack traces to match Ink's `ErrorOverview` output. The stack parsing utilities (`parseStackLine`, `cleanupPath`, `getCodeExcerpt`) are general-purpose and could live in a shared utility. However, the display format is Ink-specific (raw `silvery-box`/`silvery-text` createElement calls matching Ink's output). This is a moderate win -- the utilities are ~60 lines that could be shared.

### 2.4 ANSI Processing

| Compat Section                                                                | Lines | Necessary?                          | Could Align?                             | Effort | Impact |
| ----------------------------------------------------------------------------- | ----- | ----------------------------------- | ---------------------------------------- | ------ | ------ |
| **ANSI sanitization** (sanitizeAnsi, tokenizer delegation)                    | ~70   | Yes (Ink sanitizes text by default) | No - silvery should NOT sanitize         | -      | -      |
| **Colon-format SGR tracking** (registerColonFormatSGR, restoreColonFormatSGR) | ~60   | Yes (round-trip SGR fidelity)       | Partially - could move to silvery term   | Medium | Low    |
| **Color conversion** (convertColor, ansi256 palette)                          | ~50   | Vestigial (now a no-op passthrough) | Yes - DELETE                             | None   | Low    |
| **VS16 stripping** (stripSilveryVS16)                                         | ~30   | Yes (Ink doesn't add VS16)          | Partially - silvery could expose opt-out | Low    | Low    |
| **toChalkCompat** (ANSI output conversion)                                    | ~5    | Vestigial (now a no-op)             | Yes - DELETE                             | None   | Low    |
| **Buffer output conversion** (convertBufferOutputToInkFormat)                 | ~30   | Yes (buffer vs content rendering)   | No                                       | -      | -      |

**Key finding: Dead code.** `convertColor()` is literally `return color` -- a passthrough. `toChalkCompat()` is also `return input`. These are relics from when silvery's ANSI output differed from chalk's. Combined with their documentation comments, they're ~55 lines of dead weight. Delete them.

### 2.5 Render Function

| Compat Section                                              | Lines | Necessary?                  | Could Align?                         | Effort | Impact |
| ----------------------------------------------------------- | ----- | --------------------------- | ------------------------------------ | ------ | ------ |
| **render() test-mode path** (silveryTestRender delegation)  | ~300  | Mostly yes                  | Partially                            | Medium | Medium |
| **render() interactive path** (renderSync delegation)       | ~100  | Mostly yes                  | Partially                            | Medium | Medium |
| **Provider wrapping** (wrapWithInkProviders)                | ~40   | Yes (Ink-specific contexts) | No                                   | -      | -      |
| **Screen reader mode** (renderScreenReaderOutput, walkNode) | ~120  | Yes (Ink-specific feature)  | Potentially - silvery could adopt    | Medium | Low    |
| **renderToString**                                          | ~70   | Yes                         | Partially                            | Low    | Low    |
| **measureElement** (on-demand layout)                       | ~50   | Yes (timing bridge)         | Yes - silvery could do this natively | Medium | Medium |
| **Kitty keyboard protocol**                                 | ~170  | Yes (feature)               | Yes - silvery already has this       | High   | Medium |
| **Alternate screen management**                             | ~25   | Yes                         | Partially - silvery handles this     | Low    | Low    |
| **Debug mode / writeFrame / cursor**                        | ~80   | Yes (Ink debug semantics)   | No                                   | -      | -      |

**Key finding: Kitty keyboard duplication.** The compat layer implements its own Kitty keyboard auto-detection (~170 lines: `kittyFlags`, `resolveFlags`, `kittyModifiers`, `KittyKeyboardOptions`, `initKittyAutoDetection`, and all the query/response matching). Silvery already has Kitty keyboard support in `@silvery/term` (`enableKittyKeyboard`, `disableKittyKeyboard`, `queryKittyKeyboard`, `KittyFlags`). The compat layer reimplements this because Ink's render() needs to manage the protocol lifecycle itself. This is a genuine DRY violation that should be consolidated.

**Key finding: measureElement timing bridge.** The compat layer's `measureElement()` includes on-demand layout calculation (`calculateLayout(root, termWidth, termHeight)`) because Ink tests expect layout to be available in effects. Silvery's layout runs in a separate pipeline pass. This is a real architectural gap. Moving on-demand layout into silvery's `measureElement()` would benefit all users, not just Ink compat.

### 2.6 Types and Re-exports

| Compat Section                 | Lines | Necessary?                   | Could Align? | Effort | Impact |
| ------------------------------ | ----- | ---------------------------- | ------------ | ------ | ------ |
| **DOMElement type stub**       | ~1    | Yes (Ink tests reference it) | No           | -      | -      |
| **createTerm/term re-exports** | ~2    | Already aligned              | -            | -      | -      |
| **initInkCompat**              | ~5    | Yes (async engine init)      | No           | -      | -      |

## Phase 3: Self-Audit Challenges

### Challenging "Could Align" conclusions:

**Box defaults alignment (rated: low effort, high impact).**
Challenge: Is this actually worth it? Silvery's Box doesn't set explicit defaults because the layout engine handles them. The compat wrapper is 6 lines. The real question is whether changing silvery's Box to explicitly set `flexDirection="row"` would cause regressions in silvery-native code. **Verdict: Not worth changing silvery core.** The wrapper is cheap. Silvery's default of column-first for the root node is an intentional design choice. The Box wrapper in compat is fine as-is.

**useInput eventType alignment (rated: low effort, high impact).**
Challenge: Would changing silvery's Key.eventType from `1 | 2 | 3` to `"press" | "repeat" | "release"` break anything? silvery-native code uses the numeric type. **Verdict: Worth it, but needs migration.** The numeric type is used in km's input handling. However, strings are more readable and self-documenting. A breaking change with a codemod is appropriate. Impact on compat: eliminates the entire useInput wrapper and the Key type override.

**Kitty keyboard consolidation (rated: high effort, medium impact).**
Challenge: The compat layer's Kitty code manages protocol lifecycle tied to Ink's render/unmount cycle. silvery's Kitty support is at the Term level. **Verdict: The auto-detection logic (query/response matching, buffer stripping) should absolutely be shared.** The lifecycle management (enable on render, disable on unmount) can stay in compat. ~100 lines could move to silvery core.

**Focus system alignment (rated: high effort, high impact).**
Challenge: Ink's focus is a flat ordered list with Tab navigation. silvery's is a tree with spatial navigation, focus scopes, and explicit IDs. These are fundamentally different models. **Verdict: Do NOT try to unify.** The Ink focus model is deliberately simple. The compat layer's implementation is correct and self-contained. Keep it.

### Things I missed initially:

1. **`position: "static"` support.** Ink supports `position: "static"` (Yoga POSITION_TYPE_STATIC). silvery only has `"relative" | "absolute" | "sticky"`. The compat layer doesn't translate this, which may cause silent failures. silvery should add `"static"` to its position type.

2. **`borderDimColor` and per-side dim props.** Ink has `borderDimColor`, `borderTopDimColor`, etc. silvery has `dimColor` as a boolean on StyleProps. The compat layer doesn't translate these, meaning Ink apps using per-side border dim colors will not render correctly. silvery could add `borderDimColor` as an alias.

3. **`borderTopColor`/`borderBottomColor`/`borderLeftColor`/`borderRightColor`.** Ink has per-side border colors. silvery has only `borderColor` (all sides). The compat layer doesn't translate these -- Ink apps using per-side border colors will lose that granularity. This is a real feature gap.

4. **`columnGap`/`rowGap` vs `gap`.** Ink has `columnGap`, `rowGap`, and `gap`. silvery only has `gap`. The compat layer doesn't translate `columnGap`/`rowGap`, which will cause layout differences. silvery should add these.

5. **`textWrap` vs `wrap`.** Ink uses `textWrap` on Box styles (which maps to the Text `wrap` prop). silvery uses `wrap` directly on Text. The compat layer doesn't handle this translation.

## DRY Violations

1. **Kitty keyboard auto-detection** (~170 lines in compat vs existing Kitty support in `@silvery/term`). The query/response matching (`matchKittyQueryResponse`, `hasCompleteKittyQueryResponse`, `stripKittyQueryResponsesAndTrailingPartial`) should be in `@silvery/term/kitty-detect`.

2. **Error boundary stack parsing** (~60 lines). `parseStackLine`, `cleanupPath`, `getCodeExcerpt` are general utilities duplicated between InkErrorBoundary and potentially useful for silvery's own error display.

3. **Terminal dimension helpers** (`getTerminalRows`, `getTerminalColumns` ~20 lines). silvery's Term already handles dimension resolution. These exist because the compat render path creates its own dimension tracking.

4. **Focus system** (~250 lines). Completely separate from silvery's focus. Not eliminable (different models), but represents pure overhead in the compat package.

5. **Dead code** (~55 lines). `convertColor()` and `toChalkCompat()` are no-op passthroughs with doc comments that should be deleted. The `ansi256ToRgb` function and `ansi256BasicColors` table are unreachable since `convertColor` no longer uses them.

## Ink Patterns Worth Adopting

1. **String eventType on Key.** Ink's `"press" | "repeat" | "release"` is more readable than silvery's `1 | 2 | 3`. Strings are self-documenting and match web platform conventions (`KeyboardEvent.type`). **Recommendation: Adopt in silvery core.**

2. **`overflowX`/`overflowY` per-axis overflow.** Ink supports this; silvery doesn't. Independent axis overflow is useful (e.g., horizontal scroll in a fixed-height container). **Recommendation: Add to silvery's FlexboxProps.**

3. **`columnGap`/`rowGap` separate from `gap`.** CSS has these for good reason -- directional gap control in wrapping layouts. **Recommendation: Add to silvery's FlexboxProps.**

4. **`position: "static"`.** Useful for opting out of relative positioning. **Recommendation: Add to silvery's position type.**

5. **`useWindowSize` hook.** Ink exposes terminal dimensions reactively. silvery has `useTerm()` which provides dimensions, but a simple `useWindowSize()` returning `{ columns, rows }` is a cleaner API for common cases. **Recommendation: Add as a convenience hook in `@silvery/react`.**

6. **On-demand layout in `measureElement`.** Ink's Yoga runs during commit, so effects always see computed layout. silvery's pipeline runs asynchronously. The compat layer's `measureElement` bridges this by calling `calculateLayout` on demand. This is genuinely useful -- silvery-native code could also benefit from on-demand layout recalculation when reading measurements in effects. **Recommendation: Add to silvery's `measureElement`.**

## Genuinely Ink-Specific (Must Stay in Compat)

These sections CANNOT move to silvery core because they implement Ink-specific semantics:

1. **ANSI sanitization in Text** (~40 lines). Ink sanitizes all text content (stripping cursor movement, non-hyperlink OSC, etc.). silvery deliberately does not. This is a behavioral difference, not a bug.

2. **chalk.level-aware style stripping** (~15 lines). When chalk has no color support, Ink strips style props. silvery has its own color level detection via Term.

3. **Static component** (~60 lines). Ink's Static writes to scrollback above the dynamic area. silvery's Static renders in-tree. The architectures are fundamentally different.

4. **Ink focus system** (~250 lines across `with-ink-focus.ts` + hooks in `ink.ts`). List-based vs tree-based focus is an irreconcilable design difference.

5. **Ink stdin management** (~80 lines). Raw mode reference counting, bracketed paste mode tracking. silvery's Term handles this differently.

6. **Ink cursor model** (~35 lines + `with-ink-cursor.ts`). Imperative `setCursorPosition({ x, y })` vs silvery's declarative cursor. Different by design.

7. **Screen reader mode** (~120 lines). Ink-specific ARIA text rendering. silvery could adopt this eventually, but it's Ink-defined behavior.

8. **Debug mode frame management** (~80 lines). Ink's debug mode writes each frame as separate output. silvery's debug tooling works differently.

9. **VS16 stripping** (~30 lines). silvery adds VS16 to text-presentation emoji; Ink doesn't. This is a silvery feature that compat must undo.

10. **Buffer-to-Ink output conversion** (~30 lines). silvery renders into fixed buffers; Ink outputs content-sized text. This translation is inherent to the architecture difference.

## Recommended Strategy (Prioritized)

### Quick Wins (< 1 day each, no breaking changes)

1. **Delete dead code.** Remove `convertColor` body (make it just `return color` -- wait, it already is. Delete the function entirely and inline. Same for `toChalkCompat`). Remove `ansi256ToRgb` and `ansi256BasicColors`. **Saves ~55 lines.**

2. **Add `overflowX`/`overflowY` to silvery FlexboxProps.** Map them in the reconciler to the unified overflow. Eliminates the Box wrapper's overflow translation. **Saves ~5 lines in compat, adds feature to silvery.**

3. **Add `columnGap`/`rowGap` to silvery FlexboxProps.** Map them in the layout engine. Closes a feature gap.

4. **Add `position: "static"` to silvery FlexboxProps.** Trivial enum addition + layout engine mapping.

5. **Export `useWindowSize` from `@silvery/react`.** Wrap `useTerm()` to return `{ columns, rows }`. **Saves ~25 lines in compat.**

### Medium Effort (1-3 days, may require migration)

6. **Change `Key.eventType` to string type.** `"press" | "repeat" | "release"` instead of `1 | 2 | 3`. Requires updating silvery core Key interface + all consumers (km, silvery tests). **Eliminates the entire useInput wrapper in compat (~30 lines) and the Key type override.**

7. **Extract Kitty auto-detection to `@silvery/term`.** Move `matchKittyQueryResponse`, `hasCompleteKittyQueryResponse`, `stripKittyQueryResponsesAndTrailingPartial`, `initKittyAutoDetection` to `@silvery/term/kitty-detect`. Compat and silvery's own Kitty support both use the shared implementation. **Saves ~100 lines in compat.**

8. **Enhance silvery's `measureElement` with on-demand layout.** Port the compat layer's `needsLayoutRecalculation` + `calculateLayout` logic into silvery's base `measureElement`. Benefits all silvery users. **Saves ~50 lines in compat.**

9. **Extract error display utilities.** Move `parseStackLine`, `cleanupPath`, `getCodeExcerpt` to a shared utility in `@silvery/term` or `@silvery/react`. Both silvery and compat error boundaries use them. **Saves ~60 lines of duplication.**

### Strategic (> 3 days, architectural)

10. **Add per-side border colors and dimColor to silvery.** `borderTopColor`, `borderBottomColor`, `borderLeftColor`, `borderRightColor`, `borderDimColor`. Closes a feature gap with Ink. Requires content-phase rendering changes.

11. **Consider a unified compat render path.** Currently the compat `render()` has two massive branches: test-mode (silveryTestRender) and interactive (renderSync). If silvery's test renderer and runtime exposed a few more lifecycle hooks (onFrame, wrapRoot, stdin bridging), the compat render could be significantly thinner.

### Do NOT Do

- **Do NOT unify the focus systems.** They serve different design goals. Keep Ink's list-based focus in compat.
- **Do NOT add ANSI sanitization to silvery core.** silvery's Text should preserve all ANSI. Sanitization is an Ink convention.
- **Do NOT change silvery's Box default flexDirection.** The root is column by design. Box without explicit flexDirection uses layout engine defaults (row), which matches Ink. No change needed.
- **Do NOT try to eliminate the Static component compat.** The architectures are fundamentally different (scrollback vs in-tree).

## Line Count Projection

| Category           | Current   | After Quick Wins | After All  |
| ------------------ | --------- | ---------------- | ---------- |
| ink.ts             | 2,256     | ~2,170           | ~1,700     |
| with-ink-focus.ts  | 248       | 248              | 248        |
| with-ink-cursor.ts | 57        | 57               | 57         |
| with-ink.ts        | 100       | 100              | 100        |
| ink-focus.ts       | 111       | 111              | 111        |
| chalk.ts           | 145       | 145              | 145        |
| index.ts           | 18        | 18               | 18         |
| **Total**          | **2,935** | **~2,849**       | **~2,379** |

The honest answer: this compat layer cannot realistically be 500 lines. Ink's API surface is large (13 hooks, 6 components, complex render lifecycle, focus system, stdin management, screen reader mode, debug mode, Kitty protocol). The compat layer is doing real work. The 2,935 lines contain ~55 lines of dead code and ~200 lines of duplicated logic that should be shared, but the bulk is genuinely necessary translation between two frameworks with different architectures.

The more impactful strategy is not shrinking the compat layer, but **growing silvery's core to close feature gaps** (overflowX/Y, columnGap/rowGap, position:static, string eventType, per-side border colors, useWindowSize, on-demand measureElement). Each of these makes silvery better AND thins the compat layer. The remaining Ink-specific semantics (sanitization, Static, focus, stdin, cursor, screen reader, debug mode) are irreducibly different and belong in compat.
