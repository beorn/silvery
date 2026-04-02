# Components Library

Extended component library beyond the core API. Import from `"silvery"` unless noted otherwise.

For core components (Box, Text, SelectList, TextInput, TextArea, ListView, Tabs, Table, Spinner, ProgressBar), see the [API Reference](/api/).

## Layout

- [Screen](/components/Screen) -- Fullscreen root component
- [SplitView](/components/SplitView) -- Recursive binary-tree pane tiling
- [Fill](/components/Fill) -- Repeats content to fill parent width

## Text & Display

- [Badge](/components/Badge) -- Inline status label
- [Breadcrumb](/components/Breadcrumb) -- Navigation breadcrumb trail
- [Divider](/components/Divider) -- Horizontal separator with optional title
- [CursorLine](/components/CursorLine) -- Single-line cursor rendering
- [Image](/components/Image) -- Bitmap images (Kitty/Sixel)
- [Link](/components/Link) -- OSC 8 terminal hyperlinks
- [Skeleton](/components/Skeleton) -- Loading placeholder
- [Tooltip](/components/Tooltip) -- Contextual help text
- [Typography](/components/typography) -- Semantic text presets (H1-H3, P, Lead, Muted, Code, etc.)

## Input & Selection

- [Button](/components/Button) -- Focusable button control
- [Toggle](/components/Toggle) -- Checkbox-style toggle
- [Form](/components/Form) -- Form layout with labels and validation
- [PickerDialog](/components/PickerDialog) -- Search-and-select modal
- [PickerList](/components/PickerList) -- Standalone scrolling result list
- [SearchBar](/components/SearchBar) -- Search bar with match count

## Feedback

- [Toast](/components/Toast) -- Auto-dismiss notifications
- [ModalDialog](/components/ModalDialog) -- Modal dialog with title and footer
- [ErrorBoundary](/components/ErrorBoundary) -- Error catching with fallback UI
- [Console](/components/Console) -- Captured console output display

## Scrollback

- [ScrollbackView](/components/ScrollbackView) -- Native scrollback root
- [ScrollbackList](/components/ScrollbackList) -- List with scrollback freezing

## Navigation

- [TreeView](/components/TreeView) -- Expandable/collapsible tree hierarchy
