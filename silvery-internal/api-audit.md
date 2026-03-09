# Silvery API Audit

Catalog of every export from every entry point. Last updated 2026-03-09.

## Root Package (`silvery`)

### Entry Points

| Specifier       | Resolves To                    | Purpose                                 |
| --------------- | ------------------------------ | --------------------------------------- |
| `silvery` (`.`) | `src/index.ts`                 | Re-exports `@silvery/react` + `VERSION` |
| `silvery/ink`   | `packages/compat/src/ink.ts`   | Drop-in Ink replacement                 |
| `silvery/chalk` | `packages/compat/src/chalk.ts` | Drop-in chalk replacement               |

### `silvery` (root)

Re-exports everything from `@silvery/react` (see below) plus:

| Export    | Kind  | Notes              |
| --------- | ----- | ------------------ |
| `VERSION` | value | `"0.0.1"` constant |

### `silvery/ink`

Curated Ink-compatible surface. No wildcard re-exports.

**Components**: `Box`, `Text`, `Newline`, `Spacer`, `Static`, `Transform`
**Hooks**: `useInput`, `useApp`, `useStdout`, `useFocus`, `useFocusManager`
**Render**: `render`, `measureElement`
**Term**: `createTerm`, `term`
**Types**: `BoxProps`, `BoxHandle`, `TextProps`, `TextHandle`, `TransformProps`, `Key`, `InputHandler`, `UseInputOptions`, `UseAppResult`, `UseStdoutResult`, `UseFocusOptions`, `UseFocusResult`, `InkUseFocusManagerResult`, `RenderOptions`, `Instance`, `MeasureElementOutput`, `Term`

### `silvery/chalk`

**Default export**: `chalk` (Chalk instance with auto-detected color level)
**Named exports**: `Chalk`, `supportsColor`, `supportsColorStderr`, `modifierNames`, `foregroundColorNames`, `backgroundColorNames`, `colorNames`, `detectColor`, `toChalkLevel`, `fromChalkLevel`
**Types**: `ChalkInstance`, `ColorLevel`, `ChalkLevel`

---

## `@silvery/ansi`

### Entry Points

| Specifier             | Resolves To        |
| --------------------- | ------------------ |
| `@silvery/ansi` (`.`) | `src/index.ts`     |
| `@silvery/ansi/*`     | `src/*` (wildcard) |

### `.` (main)

**Term API**: `createTerm`, `term` (lazy proxy), `patchConsole`
**Detection**: `detectCursor`, `detectInput`, `detectColor`, `detectUnicode`, `detectExtendedUnderline`, `detectTerminalCaps`, `defaultCaps`
**Utilities**: `ANSI_REGEX`, `stripAnsi`, `displayLength`
**Underline**: `underline`, `curlyUnderline`, `dottedUnderline`, `dashedUnderline`, `doubleUnderline`, `underlineColor`, `styledUnderline`
**Hyperlink**: `hyperlink`
**Terminal Control**: `enterAltScreen`, `leaveAltScreen`, `clearScreen`, `clearLine`, `cursorTo`, `cursorHome`, `cursorHide`, `cursorShow`, `cursorStyle`, `setTitle`, `enableMouse`, `disableMouse`, `enableBracketedPaste`, `disableBracketedPaste`, `enableSyncUpdate`, `disableSyncUpdate`, `setScrollRegion`, `resetScrollRegion`, `scrollUp`, `scrollDown`, `enableKittyKeyboard`, `disableKittyKeyboard`
**Background Override**: `BG_OVERRIDE_CODE`, `bgOverride`
**Types**: `Term`, `StyleChain`, `PatchedConsole`, `PatchConsoleOptions`, `ConsoleStats`, `UnderlineStyle`, `RGB`, `ColorLevel`, `Color`, `AnsiColorName`, `StyleOptions`, `ConsoleMethod`, `ConsoleEntry`, `CreateTermOptions`, `TerminalCaps`

### Wildcard (`@silvery/ansi/*`)

Exposes all files in `src/` directly. Includes:

| File               | Public?  | Notes                                                                |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `ansi.ts`          | Yes      | Terminal control sequences                                           |
| `constants.ts`     | Yes      | ANSI escape code constants                                           |
| `detection.ts`     | Yes      | Terminal capability detection                                        |
| `hyperlink.ts`     | Yes      | OSC 8 hyperlinks                                                     |
| `patch-console.ts` | Yes      | Console interception                                                 |
| `term.ts`          | Yes      | Term factory                                                         |
| `types.ts`         | Yes      | Shared types                                                         |
| `underline.ts`     | Yes      | Extended underline styles                                            |
| `utils.ts`         | Yes      | Strip ANSI, display length                                           |
| `storybook.ts`     | **FLAG** | Executable demo script, not a library API. Should not be importable. |

---

## `@silvery/react`

### Entry Points

| Specifier                   | Resolves To                        |
| --------------------------- | ---------------------------------- |
| `@silvery/react` (`.`)      | `src/index.ts` -> `src/exports.ts` |
| `@silvery/react/hooks`      | `src/hooks/index.ts`               |
| `@silvery/react/reconciler` | `src/reconciler/index.ts`          |
| `@silvery/react/*`          | `src/*` (wildcard)                 |

### `.` (main) - via `exports.ts`

This is the largest entry point (~1057 lines). Re-exports from `@silvery/ui`, `@silvery/tea`, `@silvery/term`, `@silvery/ansi`, `@silvery/theme`.

**Components** (40+):

- Layout: `Box`, `Fill`, `Newline`, `Spacer`, `Static`, `Screen`
- Text: `Text`, `Link`, `Transform`, `CursorLine`
- Lists: `VirtualList`, `HorizontalVirtualList`, `ScrollbackList`, `ScrollbackView`, `VirtualView`, `SelectList`
- Input: `TextInput`, `TextArea`, `EditContextDisplay`, `Toggle`, `Button`
- Dialog: `ModalDialog`, `PickerDialog`, `PickerList`, `CommandPalette`
- Display: `Table`, `Badge`, `Divider`, `Breadcrumb`, `Tabs`/`TabList`/`Tab`/`TabPanel`, `Tooltip`, `Skeleton`, `TreeView`
- Progress: `Spinner`, `ProgressBar`
- Layout: `SplitView`, `GridCell`
- Containers: `ErrorBoundary`, `Console`
- Toast: `ToastContainer`, `ToastItem`
- Image: `Image`
- Form: `Form`, `FormField`

**Hooks** (30+):

- Layout: `useContentRect`, `useContentRectCallback`, `useScreenRect`, `useScreenRectCallback`
- Input: `useInput`, `useInputLayer`, `useInputLayerContext`, `useReadline`
- App: `useApp`, `useStdout`, `useRuntime`, `useTerm`, `useConsole`
- Focus: `useFocusable`, `useFocusWithin`, `useFocusManager`, `useFocus`, `useInkFocusManager`
- Cursor: `useCursor`, `resetCursorState`, `getCursorState`, `subscribeCursor`, `createCursorStore`, `CursorProvider`
- Scroll: `useScrollback`, `useScrollbackItem`, `useVirtualizer`
- Grid: `usePositionRegistry`, `useGridPosition`, `createPositionRegistry`, `PositionRegistryProvider`
- Edit: `useEditContext`, `activeEditContextRef`, `activeEditTargetRef`
- Animation: `useAnimation`, `useInterval`, `useAnimatedTransition`
- Toast: `useToast`
- React: `useTransition`, `useDeferredValue`, `useId` (re-exports from React)

**Render**: `render`, `renderSync`, `renderStatic`, `renderString`, `renderStringSync`, `measureElement`, `setLayoutEngine`, `isLayoutEngineInitialized`, `createYogaEngine`, `initYogaEngine`, `YogaLayoutEngine`, `createFlexilyEngine`, `FlexilyLayoutEngine`

**Terminal**: Full re-export of terminal control sequences, clipboard, device attrs, focus reporting, mode queries, pixel size, mouse events, hit registry, scroll regions, pane manager, etc. (see `@silvery/term` below)

**TEA/State**: `createFocusManager`, focus events/queries, `withCommands`, `withKeybindings`, `withDiagnostics`, `withRender`, key parsing, text cursor/ops, `calcEdgeBasedScrollOffset`

**Theming**: `ThemeProvider`, `useTheme`, built-in themes, `resolveThemeColor`, `generateTheme`, `detectTheme`, `deriveTheme`

**Contexts**: `TermContext`, `FocusManagerContext`, `RuntimeContext`, `InputLayerProvider`, `InputLayerContext`, `InputBoundary`

**Image**: `encodeKittyImage`, `deleteKittyImage`, `isKittyGraphicsSupported`, `encodeSixel`, `isSixelSupported`

### `@silvery/react/hooks`

Subset focused on hooks only:

- `useContentRect`, `useContentRectCallback`, `useScreenRect`
- `useInput`, `useRuntime`, `useApp`, `useStdout`
- `useFocusable`, `useFocusWithin`, `useFocusManager`
- `useInputLayer`, `useInputLayerContext`
- `useScrollRegion`
- `useFocus`, `useInkFocusManager` (Ink compat)
- Types: `Rect`, `Key`, `InputHandler`, `UseInputOptions`, `UseAppResult`, `UseStdoutResult`, `UseFocusableResult`, `UseFocusManagerResult`, `InputLayerHandler`, `UseScrollRegionOptions`, `UseScrollRegionResult`, `UseFocusOptions`, `UseFocusResult`, `InkUseFocusManagerResult`

### `@silvery/react/reconciler`

Low-level reconciler API:

- `reconciler` (React reconciler instance)
- `createContainer`, `createFiberRoot`, `getContainerRoot`
- `runWithDiscreteEvent`
- Types: `Container`

### Wildcard (`@silvery/react/*`)

Exposes all `src/` files including:

| File                    | Public?  | Notes                                                                |
| ----------------------- | -------- | -------------------------------------------------------------------- |
| `context.ts`            | Yes      | React contexts                                                       |
| `edit-context.ts`       | Yes      | Terminal edit context                                                |
| `exports.ts`            | **FLAG** | Implementation barrel file. Importing directly bypasses entry point. |
| `focus.ts`              | Unclear  | Likely internal focus helpers                                        |
| `jsx.d.ts`              | **FLAG** | Type declaration, not an importable module                           |
| `react-reconciler.d.ts` | **FLAG** | Type shim for untyped `react-reconciler` package                     |
| `render-string.tsx`     | Yes      | renderString API                                                     |
| `render.tsx`            | Yes      | Main render API                                                      |

---

## `@silvery/tea`

### Entry Points

| Specifier              | Resolves To            |
| ---------------------- | ---------------------- |
| `@silvery/tea` (`.`)   | `src/index.ts`         |
| `@silvery/tea/core`    | `src/core/index.ts`    |
| `@silvery/tea/store`   | `src/store/index.ts`   |
| `@silvery/tea/tea`     | `src/tea/index.ts`     |
| `@silvery/tea/streams` | `src/streams/index.ts` |
| `@silvery/tea/*`       | `src/*` (wildcard)     |

### `.` (main)

**TEA Core**: `none`, `batch`, `dispatch`, `compose`, `createFocusManager`, `createSlice`
**Focus Events**: `createKeyEvent`, `createFocusEvent`, `dispatchKeyEvent`, `dispatchFocusEvent`
**Focus Queries**: `findFocusableAncestor`, `getTabOrder`, `findByTestID`, `findSpatialTarget`, `getExplicitFocusLink`
**Store**: `createStore`, `silveryUpdate`, `defaultInit`, `withFocusManagement`
**Zustand TEA**: `tea`, `collect`
**Keys**: `keyToName`, `keyToModifiers`, `parseHotkey`, `matchHotkey`, `parseKeypress`, `parseKey`, `emptyKey`
**Text Cursor**: `cursorToRowCol`, `getWrappedLines`, `rowColToCursor`, `cursorMoveUp`, `cursorMoveDown`, `countVisualLines`
**Text Ops**: `applyTextOp`, `invertTextOp`, `mergeTextOps`
**Tree Utils**: `getAncestorPath`, `pointInRect`, `rectEqual`
**Streams**: `merge`, `map`, `filter`, `filterMap`, `takeUntil`, `take`, `throttle`, `debounce`, `batchStream`, `concat`, `zip`, `fromArray`, `fromArrayWithDelay`
**Plugins**: `withCommands`, `withKeybindings`, `withDiagnostics`, `checkLayoutInvariants`, `VirtualTerminal`, `withRender`, `IncrementalRenderMismatchError`

**Types**: `SilveryModel`, `SilveryMsg`, `Effect`, `Sub`, `Direction`, `Plugin`, `FocusManager`, `FocusManagerOptions`, `FocusChangeCallback`, `FocusOrigin`, `FocusSnapshot`, `SilveryKeyEvent`, `SilveryFocusEvent`, `FocusEventProps`, `Slice`, `SliceWithInit`, `InferOp`, `TeaNode`, `Rect`, `StoreConfig`, `StoreApi`, `TeaResult`, `TeaReducer`, `EffectRunners`, `TeaSlice`, `EffectLike`, `TeaOptions`, `ParsedKeypress`, `ParsedHotkey`, `Key`, `WrappedLine`, `TextOp`, `WithCommandsOptions`, `CommandDef`, `CommandRegistryLike`, `CommandInfo`, `Command`, `Cmd`, `AppWithCommands`, `AppState`, `KeybindingDef`, `WithKeybindingsOptions`, `KeybindingContext`, `ExtendedKeybindingDef`, `DiagnosticOptions`, `RenderTerm`

### `@silvery/tea/core`

Pure TypeScript, no React. TEA types, effect constructors, plugin composition, focus manager, focus events/queries, slices.

### `@silvery/tea/store`

TEA store: `createStore`, `silveryUpdate`, `defaultInit`, `withFocusManagement`. Types: `StoreConfig`, `StoreApi`.

### `@silvery/tea/tea`

Zustand TEA middleware: `tea`, `collect`. Types: `TeaResult`, `TeaReducer`, `EffectRunners`, `TeaSlice`, `EffectLike`, `TeaOptions`.

### `@silvery/tea/streams`

AsyncIterable helpers: `merge`, `map`, `filter`, `filterMap`, `takeUntil`, `take`, `throttle`, `debounce`, `batch`, `concat`, `zip`, `fromArray`, `fromArrayWithDelay`.

### Wildcard (`@silvery/tea/*`)

Exposes all `src/` files. Notable internal files:

| File         | Public?  | Notes                                                                                       |
| ------------ | -------- | ------------------------------------------------------------------------------------------- |
| `plugins.ts` | **FLAG** | Only exports `IncrementalRenderMismatchError` (already in main index). Thin re-export file. |

---

## `@silvery/term`

### Entry Points

| Specifier                | Resolves To             |
| ------------------------ | ----------------------- |
| `@silvery/term` (`.`)    | `src/index.ts`          |
| `@silvery/term/runtime`  | `src/runtime/index.ts`  |
| `@silvery/term/toolbelt` | `src/toolbelt/index.ts` |
| `@silvery/term/pipeline` | `src/pipeline/index.ts` |
| `@silvery/term/ansi`     | `src/ansi/index.ts`     |
| `@silvery/term/*`        | `src/*` (wildcard)      |

### `.` (main)

The largest leaf package. Exports terminal buffer, pipeline, layout engine, render adapters (canvas, DOM), ANSI sequences, input protocols (bracketed paste, clipboard, mouse, keyboard), terminal capability detection, hit registry, scroll utilities, pane manager, Unicode text utilities, devtools, inspector, and more.

~330 exports total (values + types). See the full `packages/term/src/index.ts` for the complete list.

**Notable re-export from another package**: `withRender` and `RenderTerm` from `@silvery/tea/with-render` — cross-package re-export.

### `@silvery/term/runtime`

New runtime architecture (Layers 0-3):

**Layer 0**: `layout`, `layoutSync`, `diff`, `render`
**Layer 1**: `createRuntime`, `createTermProvider`, `createBuffer`
**Layer 2**: `run`, `useInput`, `useExit`, `usePaste`, `parseKey`, `emptyKey`
**Layer 3**: `createApp`, `useApp`, `useAppShallow`, `StoreContext`
**Re-exports**: TEA store from `@silvery/tea/store`, streams from `@silvery/tea/streams`
**Tick sources**: `createTick`, `createFrameTick`, `createSecondTick`, `createAdaptiveTick`
**Terminal lifecycle**: `captureTerminalState`, `restoreTerminalState`, `resumeTerminalState`, `performSuspend`, `CTRL_C`, `CTRL_Z`

### `@silvery/term/toolbelt`

Diagnostic utilities: `withDiagnostics`, `checkLayoutInvariants`, `VirtualTerminal`, `IncrementalRenderMismatchError`, `compareBuffers`, `formatMismatch`, `outputPhase`, `findNodeAtPosition`, `findAllContainingNodes`, `getNodeDebugInfo`, `buildMismatchContext`, `formatMismatchContext`

### `@silvery/term/pipeline`

Render pipeline internals: `executeRender`, `executeRenderAdapter`, phase functions (`measurePhase`, `layoutPhase`, `contentPhase`, `outputPhase`, `scrollPhase`, `stickyPhase`, `screenRectPhase`, `contentPhaseAdapter`).

### `@silvery/term/ansi`

ANSI primitives merged from the former `@silvery/ansi` package. Term factory, styling, detection, underlines, hyperlinks, terminal control.

**Term API**: `createTerm`, `term` (lazy proxy), `patchConsole`
**Detection**: `detectCursor`, `detectInput`, `detectColor`, `detectUnicode`, `detectExtendedUnderline`, `detectTerminalCaps`, `defaultCaps`
**Utilities**: `ANSI_REGEX`, `stripAnsi`, `displayLength`
**Underline**: `underline`, `curlyUnderline`, `dottedUnderline`, `dashedUnderline`, `doubleUnderline`, `underlineColor`, `styledUnderline`
**Hyperlink**: `hyperlink`
**Terminal Control**: `enterAltScreen`, `leaveAltScreen`, `clearScreen`, `clearLine`, `cursorTo`, `cursorHome`, `cursorHide`, `cursorShow`, `cursorStyle`, `setTitle`, `enableMouse`, `disableMouse`, `enableBracketedPaste`, `disableBracketedPaste`, `enableSyncUpdate`, `disableSyncUpdate`, `setScrollRegion`, `resetScrollRegion`, `scrollUp`, `scrollDown`, `enableKittyKeyboard`, `disableKittyKeyboard`
**Background Override**: `BG_OVERRIDE_CODE`, `bgOverride`
**Types**: `Term`, `StyleChain`, `PatchedConsole`, `PatchConsoleOptions`, `ConsoleStats`, `UnderlineStyle`, `RGB`, `ColorLevel`, `Color`, `AnsiColorName`, `StyleOptions`, `ConsoleMethod`, `ConsoleEntry`, `CreateTermOptions`, `TerminalCaps`

### Wildcard (`@silvery/term/*`)

Exposes all `src/` files. Notable internal files:

| File                  | Public?  | Notes                                                                                        |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `scheduler.ts`        | Internal | Full scheduler implementation, only `IncrementalRenderMismatchError` is intentionally public |
| `browser-renderer.ts` | Unclear  | Browser-specific renderer                                                                    |
| `input.ts`            | Internal | Low-level input parsing                                                                      |
| `layout.ts`           | Internal | Layout utility (~660B, thin)                                                                 |
| `pipeline.ts`         | Internal | Re-export shim (579B)                                                                        |
| `screenshot.ts`       | Unclear  | Screenshot capture                                                                           |
| `dom/index.ts`        | Yes      | DOM rendering support                                                                        |
| `xterm/index.ts`      | Yes      | xterm.js integration                                                                         |

---

## `@silvery/test`

### Entry Points

| Specifier             | Resolves To        |
| --------------------- | ------------------ |
| `@silvery/test` (`.`) | `src/index.tsx`    |
| `@silvery/test/*`     | `src/*` (wildcard) |

### `.` (main)

**Render**: `render`, `createRenderer`, `createStore`, `run`, `ensureEngine`, `getActiveRenderCount`
**Locators**: `createLocator`, `createAutoLocator`
**Buffer**: `bufferToText`, `bufferToStyledText`, `bufferToHTML`, `compareBuffers`, `formatMismatch`
**Debug**: `debugTree`, `normalizeFrame`, `waitFor`, `stripAnsi`
**Keys**: `keyToAnsi`, `keyToKittyAnsi`, `CODE_TO_KEY`
**Types**: `App`, `AutoLocator`, `FilterOptions`, `BoundTerm`, `TerminalBuffer`, `SilveryLocator`, `Rect`, `RenderOptions`, `PerRenderOptions`, `Store`, `StoreOptions`, `DebugTreeOptions`, `BufferMismatch`

**Side effects**: Sets `globalThis.IS_REACT_ACT_ENVIRONMENT = true` and runs `ensureDefaultLayoutEngine()` via top-level await.

### Wildcard (`@silvery/test/*`)

| File                 | Public? | Notes                     |
| -------------------- | ------- | ------------------------- |
| `auto-locator.ts`    | Yes     | Auto-refreshing locators  |
| `compare-buffers.ts` | Yes     | Buffer comparison         |
| `debug.ts`           | Yes     | Debug tree printing       |
| `debug-mismatch.ts`  | Yes     | Mismatch context building |
| `locator.ts`         | Yes     | Locator API               |

---

## `@silvery/theme`

### Entry Points

| Specifier              | Resolves To                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `@silvery/theme` (`.`) | `src/index.ts` -> re-exports from `theme.ts` and `ThemeContext.tsx` |
| `@silvery/theme/*`     | `src/*` (wildcard)                                                  |

### `.` (main)

**React**: `ThemeProvider`, `useTheme`
**Core**: `COLOR_PALETTE_FIELDS`, `deriveTheme`, `resolveThemeColor`, `generateTheme`
**Builder**: `createTheme`, `quickTheme`, `presetTheme`
**Generators**: `fromBase16`, `fromColors`, `fromPreset`
**Color utilities**: `blend`, `brighten`, `darken`, `contrastFg`, `desaturate`, `complement`, `hexToRgb`, `rgbToHex`, `hexToHsl`, `hslToHex`, `rgbToHsl`
**State**: `setActiveTheme`, `getActiveTheme`, `pushContextTheme`, `popContextTheme`
**Validation**: `validateColorPalette`, `validateTheme`, `THEME_TOKEN_KEYS`, `checkContrast`
**Aliases**: `resolveAliases`, `resolveTokenAlias`
**CSS**: `themeToCSSVars`
**Auto-generate**: `autoGenerateTheme`
**Base16**: `importBase16`, `exportBase16`
**Detection**: `detectTerminalPalette`, `detectTheme`
**Built-in themes** (6): `ansi16DarkTheme`, `ansi16LightTheme`, `defaultDarkTheme`, `defaultLightTheme`, `builtinThemes`, `getThemeByName`
**Built-in palettes** (45 palettes from 15 families): `catppuccinMocha`, `catppuccinFrappe`, `catppuccinMacchiato`, `catppuccinLatte`, `nord`, `dracula`, `oneDark`, `solarizedDark`, `solarizedLight`, `gruvboxDark`, `gruvboxLight`, `tokyoNight`, `tokyoNightStorm`, `tokyoNightDay`, `rosePine`, `rosePineMoon`, `rosePineDawn`, `kanagawaWave`, `kanagawaDragon`, `kanagawaLotus`, `everforestDark`, `everforestLight`, `nightfox`, `dawnfox`, `monokai`, `monokaiPro`, `snazzy`, `materialDark`, `materialLight`, `palenight`, `ayuDark`, `ayuMirage`, `ayuLight`, `horizon`, `moonfly`, `nightfly`, `oxocarbonDark`, `oxocarbonLight`, `sonokai`, `edgeDark`, `edgeLight`, `modusVivendi`, `modusOperandi`, `builtinPalettes`, `getPaletteByName`

**Types**: `Theme`, `ColorPalette`, `HueName`, `AnsiPrimary`, `AnsiColorName`, `HSL`, `ThemeProviderProps`, `DetectedPalette`, `DetectThemeOptions`, `ValidationResult`, `ThemeValidationResult`, `ContrastResult`, `Base16Scheme`

### Wildcard (`@silvery/theme/*`)

Exposes all `src/` files. Some are clearly internal (generator helpers, palette data files).

---

## `@silvery/ui`

### Entry Points

| Specifier               | Resolves To              |
| ----------------------- | ------------------------ |
| `@silvery/ui` (`.`)     | `src/index.ts`           |
| `@silvery/ui/cli`       | `src/cli/index.ts`       |
| `@silvery/ui/react`     | `src/react/index.ts`     |
| `@silvery/ui/wrappers`  | `src/wrappers/index.ts`  |
| `@silvery/ui/ansi`      | `src/ansi/index.ts`      |
| `@silvery/ui/utils`     | `src/utils/index.ts`     |
| `@silvery/ui/progress`  | `src/progress/index.ts`  |
| `@silvery/ui/display`   | `src/display/index.ts`   |
| `@silvery/ui/input`     | `src/input/index.ts`     |
| `@silvery/ui/animation` | `src/animation/index.ts` |
| `@silvery/ui/*`         | `src/*` (wildcard)       |

### `.` (main)

Re-exports all types from `types.ts`, all of `cli/`, and all of `wrappers/`. Note: does NOT re-export React components (import from `@silvery/ui/react` or `@silvery/react`).

### `@silvery/ui/cli`

Non-React CLI progress: `Spinner`, `SPINNER_FRAMES`, `createSpinner`, `ProgressBar`, `MultiProgress`. Plus ANSI utilities from `cli/ansi.ts`.

### `@silvery/ui/react`

React progress components: `Spinner`, `useSpinnerFrame`, `ProgressBar`, `useProgressBar`, `Task`, `Tasks`, `useTasks`, `ProgressProvider`, `useProgress`, `ProgressIndicator`.

### `@silvery/ui/wrappers`

Async wrappers: `withSpinner`, `attachSpinner`, `withProgress`, `createProgressCallback`, `wrapGenerator`, `withIterableProgress`, `wrapEmitter`, `waitForEvent`, `withSelect`, `createSelect`, `withTextInput`, `createTextInput`.

### `@silvery/ui/ansi`

ANSI terminal control: `CURSOR_HIDE`, `CURSOR_SHOW`, `CURSOR_TO_START`, `CURSOR_SAVE`, `CURSOR_RESTORE`, `cursorUp`, `cursorDown`, `CLEAR_LINE`, `CLEAR_LINE_END`, `CLEAR_SCREEN`, `write`, `writeLine`, `withCursor`, `isTTY`, `getTerminalWidth`.

### `@silvery/ui/utils`

ETA tracking: `calculateETA`, `formatETA`, `getETA`, `createETATracker`, `DEFAULT_ETA_BUFFER_SIZE`.

### `@silvery/ui/progress`

Combined progress API: `steps`, `step`, `task` (deprecated), `tasks` (deprecated), plus re-exports from `cli/`.

### `@silvery/ui/display`

Display-only components: `Table`.

### `@silvery/ui/input`

Input components: `TextInput`, `useTextInput`, `Select`, `useSelect`.

### `@silvery/ui/animation`

Animation: `easings`, `resolveEasing`, `useAnimation`, `useTransition`, `useInterval`.

### Wildcard (`@silvery/ui/*`)

Exposes all `src/` files. Notable via-wildcard-only files:

| File              | Public?  | Notes                                                             |
| ----------------- | -------- | ----------------------------------------------------------------- |
| `components.ts`   | **FLAG** | Barrel file for components. Likely internal.                      |
| `animation.ts`    | **FLAG** | Thin re-export shim (641B). Not the same as `animation/index.ts`. |
| `images.ts`       | Unclear  | Image-related utilities                                           |
| `canvas/index.ts` | Yes      | Canvas rendering support                                          |

---

## `@silvery/compat` (private)

Marked `"private": true`. Not published separately. Exposed only via root `silvery/ink` and `silvery/chalk`.

---

## Flagged Issues

### 1. Wildcard entry points expose internal files

Every workspace package uses `./*` -> `./src/*` wildcard exports. This exposes implementation details as importable paths:

- `@silvery/ansi/storybook` - executable demo script
- `@silvery/react/exports` - barrel file that should only be imported by `index.ts`
- `@silvery/react/jsx.d.ts` - type declaration file
- `@silvery/react/react-reconciler.d.ts` - type shim
- `@silvery/tea/plugins` - thin re-export file
- `@silvery/ui/components` - internal barrel file
- `@silvery/ui/animation` (top-level shim, distinct from `animation/index.ts`)

**Recommendation**: The wildcards are intentional for deep imports (e.g., `@silvery/ui/components/VirtualList`), but consider adding a convention (e.g., underscore prefix) for files that shouldn't be imported directly. Or switch to explicit sub-path exports for each public module.

### 2. `@silvery/react` is a mega-barrel

`exports.ts` re-exports from 6 different packages (~1057 lines). This is convenient but:

- Importing `@silvery/react` pulls in React, term, tea, ansi, theme, and ui
- Makes tree-shaking hard (bundlers must analyze the entire transitive graph)
- Cross-package re-exports (e.g., `withRender` from tea, `VirtualList` from ui) blur package boundaries

**Recommendation**: Document that `@silvery/react` is the "kitchen sink" import. For tree-shaking-sensitive consumers, recommend importing from leaf packages directly.

### 3. Duplicate exports across packages

Several symbols are exported from multiple packages:

- `withRender` / `RenderTerm`: exported from `@silvery/tea`, `@silvery/term`, and `@silvery/react`
- `IncrementalRenderMismatchError`: exported from `@silvery/tea`, `@silvery/term`, and `@silvery/term/toolbelt`
- `createStore`, `silveryUpdate`, `defaultInit`, `withFocusManagement`: exported from `@silvery/tea/store` and `@silvery/term/runtime`
- Stream helpers: exported from `@silvery/tea/streams` and `@silvery/term/runtime`
- Focus manager exports: from `@silvery/tea/core` and `@silvery/react`
- `stripAnsi`: exported from `@silvery/term` (twice, as `stripAnsi` and `stripAnsiUnicode`) and `@silvery/react`

This is by design (convenience re-exports), but should be documented so consumers know the canonical source.

### 4. `@silvery/ansi/storybook` should not be importable

`packages/ansi/src/storybook.ts` is an executable script (`#!/usr/bin/env bun`) that renders a visual demo. It should not be part of the public API surface. Consider:

- Moving to `examples/` or `scripts/`
- Or excluding from the wildcard via a more targeted exports map

### 5. `@silvery/test` has top-level side effects

Importing `@silvery/test` sets `globalThis.IS_REACT_ACT_ENVIRONMENT = true` and initializes the layout engine via top-level await. This is intentional for test setup but should be documented as a side-effectful import.

### 6. No underscore-prefixed or explicitly internal exports found

All exports appear intentionally public. No `_internal` or underscore-prefixed modules detected in the export maps.
