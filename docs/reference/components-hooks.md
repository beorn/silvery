# Components & Hooks

This is a quick-reference index of all Silvery components and hooks. For detailed usage, see the [Components Guide](/guides/components) and the individual API pages.

## Components

### Layout

| Component                       | Description                                       | API  |
| ------------------------------- | ------------------------------------------------- | ---- |
| [Box](/api/box)                 | Flexbox container with borders, padding, overflow | Core |
| [Spacer](/api/spacer)           | Flexible space that fills available room          | Core |
| [Newline](/api/newline)         | Line break                                        | Core |
| [SplitView](/guides/components) | Resizable split panes                             | UI   |

### Text & Display

| Component                       | Description                                    | API  |
| ------------------------------- | ---------------------------------------------- | ---- |
| [Text](/api/text)               | Styled text with color, bold, italic, wrapping | Core |
| [Static](/api/static)           | Non-updating content (logs, completed items)   | Core |
| [Transform](/guides/components) | Per-line string transformation                 | Core |
| [Badge](/guides/components)     | Styled label/tag                               | UI   |
| [Divider](/guides/components)   | Horizontal rule                                | UI   |
| [Link](/guides/components)      | OSC 8 hyperlink                                | UI   |
| [Image](/guides/components)     | Kitty graphics / Sixel with text fallback      | UI   |

### Input

| Component                        | Description                                         | API |
| -------------------------------- | --------------------------------------------------- | --- |
| [TextInput](/guides/components)  | Single-line text input with readline shortcuts      | UI  |
| [TextArea](/guides/components)   | Multi-line text editor with cursor, selection, undo | UI  |
| [SelectList](/guides/components) | Single-select list with keyboard navigation         | UI  |
| [Toggle](/guides/components)     | Boolean toggle                                      | UI  |
| [Button](/guides/components)     | Clickable button                                    | UI  |

### Data Display

| Component                         | Description                        | API |
| --------------------------------- | ---------------------------------- | --- |
| [Table](/guides/components)       | Column-aligned table with headers  | UI  |
| [VirtualList](/guides/components) | O(1) scroll for thousands of items | UI  |
| [VirtualView](/guides/components) | Virtualized arbitrary content      | UI  |
| [TreeView](/guides/components)    | Expandable/collapsible tree        | UI  |

### Feedback

| Component                                | Description                                | API |
| ---------------------------------------- | ------------------------------------------ | --- |
| [Spinner](/guides/components)            | Animated spinner (dots, line, arc, bounce) | UI  |
| [ProgressBar](/guides/components)        | Determinate and indeterminate progress     | UI  |
| [Toast / useToast()](/guides/components) | Auto-dismiss notifications                 | UI  |
| [Skeleton](/guides/components)           | Loading placeholder                        | UI  |

### Overlays & Navigation

| Component                                             | Description                           | API |
| ----------------------------------------------------- | ------------------------------------- | --- |
| [ModalDialog](/guides/components)                     | Modal overlay with focus trapping     | UI  |
| [CommandPalette](/guides/components)                  | Fuzzy-search command palette (Ctrl+K) | UI  |
| [PickerDialog / PickerList](/guides/components)       | Selection dialog                      | UI  |
| [Tooltip](/guides/components)                         | Contextual tooltip overlay            | UI  |
| [Tabs / TabList / Tab / TabPanel](/guides/components) | Tabbed interface                      | UI  |
| [Breadcrumb](/guides/components)                      | Path breadcrumb with separators       | UI  |

### Layout Wrappers

| Component                              | Description                            | API   |
| -------------------------------------- | -------------------------------------- | ----- |
| [ThemeProvider](/guide/theming)        | Theme context provider                 | Theme |
| [ErrorBoundary](/guides/components)    | React error boundary with reset        | UI    |
| [Console](/guides/components)          | Captures `console.log` output          | UI    |
| [Form / FormField](/guides/components) | Form layout with labels and validation | UI    |

## Hooks

### Layout & Measurement

| Hook                            | Description                                      | API  |
| ------------------------------- | ------------------------------------------------ | ---- |
| [useBoxRect](/api/use-box-rect) | Component's content dimensions (synchronous)     | Core |
| useScrollRect                   | Component's screen-space position and dimensions | Core |

### Input & Interaction

| Hook                       | Description                       | API  |
| -------------------------- | --------------------------------- | ---- |
| [useInput](/api/use-input) | Keyboard input handler            | Core |
| usePaste                   | Bracketed paste handler           | Core |
| useCursor                  | Terminal cursor positioning (IME) | Core |

### Focus

| Hook                       | Description                       | API  |
| -------------------------- | --------------------------------- | ---- |
| [useFocus](/api/use-focus) | Focus state for a component       | Core |
| useFocusManager            | Programmatic focus control        | Core |
| useFocusWithin             | Whether any descendant is focused | Core |

### App Lifecycle

| Hook                         | Description                       | API  |
| ---------------------------- | --------------------------------- | ---- |
| [useApp](/api/use-app)       | App-level methods (exit, panic)   | Core |
| usePanic                     | Fatal diagnostics after TUI exit  | Core |
| [useStdout](/api/use-stdout) | stdout stream access              | Core |

### Animation

| Hook                  | Description                       | API |
| --------------------- | --------------------------------- | --- |
| useAnimation          | Frame-based animation with easing | UI  |
| useAnimatedTransition | Animated value transitions        | UI  |

### Data & State

| Hook          | Description                                  | API  |
| ------------- | -------------------------------------------- | ---- |
| useScrollback | Freeze completed items into terminal history | Core |
| useToast      | Toast notification management                | UI   |

## See Also

- [Components Guide](/guides/components) -- Detailed usage with examples
- [Box API](/api/box) -- Full Box props reference
- [Text API](/api/text) -- Full Text props reference
- [Hooks Guide](/guide/hooks) -- Detailed hook documentation
