# Components & Hooks

This is a quick-reference index of all Silvery components and hooks. For detailed usage, see the [Components Guide](/guides/components) and the individual API pages.

## Components

### Layout

| Component | Description | API |
|-----------|-------------|-----|
| [Box](/api/box) | Flexbox container with borders, padding, overflow | Core |
| [Spacer](/api/spacer) | Flexible space that fills available room | Core |
| [Newline](/api/newline) | Line break | Core |
| [SplitView](/guide/components) | Resizable split panes | UI |

### Text & Display

| Component | Description | API |
|-----------|-------------|-----|
| [Text](/api/text) | Styled text with color, bold, italic, wrapping | Core |
| [Static](/api/static) | Non-updating content (logs, completed items) | Core |
| [Transform](/guide/components) | Per-line string transformation | Core |
| [Badge](/guide/components) | Styled label/tag | UI |
| [Divider](/guide/components) | Horizontal rule | UI |
| [Link](/guide/components) | OSC 8 hyperlink | UI |
| [Image](/guide/components) | Kitty graphics / Sixel with text fallback | UI |

### Input

| Component | Description | API |
|-----------|-------------|-----|
| [TextInput](/guide/components) | Single-line text input with readline shortcuts | UI |
| [TextArea](/guide/components) | Multi-line text editor with cursor, selection, undo | UI |
| [SelectList](/guide/components) | Single-select list with keyboard navigation | UI |
| [Toggle](/guide/components) | Boolean toggle | UI |
| [Button](/guide/components) | Clickable button | UI |

### Data Display

| Component | Description | API |
|-----------|-------------|-----|
| [Table](/guide/components) | Column-aligned table with headers | UI |
| [VirtualList](/guide/components) | O(1) scroll for thousands of items | UI |
| [VirtualView](/guide/components) | Virtualized arbitrary content | UI |
| [TreeView](/guide/components) | Expandable/collapsible tree | UI |

### Feedback

| Component | Description | API |
|-----------|-------------|-----|
| [Spinner](/guide/components) | Animated spinner (dots, line, arc, bounce) | UI |
| [ProgressBar](/guide/components) | Determinate and indeterminate progress | UI |
| [Toast / useToast()](/guide/components) | Auto-dismiss notifications | UI |
| [Skeleton](/guide/components) | Loading placeholder | UI |

### Overlays & Navigation

| Component | Description | API |
|-----------|-------------|-----|
| [ModalDialog](/guide/components) | Modal overlay with focus trapping | UI |
| [CommandPalette](/guide/components) | Fuzzy-search command palette (Ctrl+K) | UI |
| [PickerDialog / PickerList](/guide/components) | Selection dialog | UI |
| [Tooltip](/guide/components) | Contextual tooltip overlay | UI |
| [Tabs / TabList / Tab / TabPanel](/guide/components) | Tabbed interface | UI |
| [Breadcrumb](/guide/components) | Path breadcrumb with separators | UI |

### Layout Wrappers

| Component | Description | API |
|-----------|-------------|-----|
| [ThemeProvider](/guides/theming) | Theme context provider | Theme |
| [ErrorBoundary](/guide/components) | React error boundary with reset | UI |
| [Console](/guide/components) | Captures `console.log` output | UI |
| [Form / FormField](/guide/components) | Form layout with labels and validation | UI |

## Hooks

### Layout & Measurement

| Hook | Description | API |
|------|-------------|-----|
| [useContentRect](/api/use-content-rect) | Component's content dimensions (synchronous) | Core |
| useScreenRect | Component's screen-space position and dimensions | Core |

### Input & Interaction

| Hook | Description | API |
|------|-------------|-----|
| [useInput](/api/use-input) | Keyboard input handler | Core |
| usePaste | Bracketed paste handler | Core |
| useCursor | Terminal cursor positioning (IME) | Core |

### Focus

| Hook | Description | API |
|------|-------------|-----|
| [useFocus](/api/use-focus) | Focus state for a component | Core |
| useFocusManager | Programmatic focus control | Core |
| useFocusWithin | Whether any descendant is focused | Core |

### App Lifecycle

| Hook | Description | API |
|------|-------------|-----|
| [useApp](/api/use-app) | App-level methods (exit) | Core |
| [useStdout](/api/use-stdout) | stdout stream access | Core |

### Animation

| Hook | Description | API |
|------|-------------|-----|
| useAnimation | Frame-based animation with easing | UI |
| useAnimatedTransition | Animated value transitions | UI |

### Data & State

| Hook | Description | API |
|------|-------------|-----|
| useScrollback | Freeze completed items into terminal history | Core |
| useToast | Toast notification management | UI |

## See Also

- [Components Guide](/guides/components) -- Detailed usage with examples
- [Box API](/api/box) -- Full Box props reference
- [Text API](/api/text) -- Full Text props reference
- [Hooks Guide](/guide/hooks) -- Detailed hook documentation
