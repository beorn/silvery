# Component Reference

API reference for all silvery components. Import from `"silvery"` (the public barrel) unless noted otherwise.

## Layout

| Component                   | Description                                       |
| --------------------------- | ------------------------------------------------- |
| [Box](./Box.md)             | Flexbox container -- the primary layout primitive |
| [Screen](./Screen.md)       | Fullscreen root component (claims full terminal)  |
| [SplitView](./SplitView.md) | Recursive binary-tree pane tiling                 |
| [Spacer](./Spacer.md)       | Fills available space (`flexGrow={1}`)            |
| [Fill](./Fill.md)           | Repeats content to fill parent width              |
| [Newline](./Newline.md)     | Renders newline characters                        |

## Text & Display

| Component                     | Description                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [Text](./Text.md)             | Text rendering primitive with styling                                                                                   |
| [Link](./Link.md)             | OSC 8 terminal hyperlinks                                                                                               |
| [Transform](./Transform.md)   | Line-by-line text transformation                                                                                        |
| [Typography](./typography.md) | Semantic text presets (H1, H2, H3, P, Lead, Muted, Small, Strong, Em, Code, Kbd, Blockquote, CodeBlock, HR, UL, OL, LI) |
| [Badge](./Badge.md)           | Inline status label                                                                                                     |
| [Divider](./Divider.md)       | Horizontal separator with optional title                                                                                |
| [CursorLine](./CursorLine.md) | Single-line cursor rendering                                                                                            |
| [Image](./Image.md)           | Bitmap images (Kitty/Sixel)                                                                                             |
| [Skeleton](./Skeleton.md)     | Loading placeholder                                                                                                     |
| [Tooltip](./Tooltip.md)       | Contextual help text                                                                                                    |

## Input

| Component                                     | Description                              |
| --------------------------------------------- | ---------------------------------------- |
| [TextInput](./TextInput.md)                   | Single-line text input with readline     |
| [TextArea](./TextArea.md)                     | Multi-line text input with word wrapping |
| [EditContextDisplay](./EditContextDisplay.md) | Read-only multi-line display with cursor |
| [SelectList](./SelectList.md)                 | Keyboard-navigable single-select list    |
| [Toggle](./Toggle.md)                         | Focusable checkbox-style toggle          |
| [Button](./Button.md)                         | Focusable button control                 |
| [SearchBar](./SearchBar.md)                   | Search bar (uses SearchProvider context) |

## Lists & Virtualization

| Component                                           | Description                                |
| --------------------------------------------------- | ------------------------------------------ |
| [ListView](./ListView.md)                           | Unified virtualized list (recommended)     |
| [VirtualList](./VirtualList.md)                     | Deprecated -- thin wrapper around ListView |
| [VirtualView](./VirtualView.md)                     | Deprecated -- thin wrapper around ListView |
| [HorizontalVirtualList](./HorizontalVirtualList.md) | Horizontal virtualized list                |
| [ScrollbackView](./ScrollbackView.md)               | Native terminal scrollback                 |
| [ScrollbackList](./ScrollbackList.md)               | Declarative scrollback wrapper             |
| [Static](./Static.md)                               | Write-once rendering for logs              |
| [GridCell](./GridCell.md)                           | Auto-registering 2D grid position wrapper  |

## Navigation

| Component                             | Description                                                     |
| ------------------------------------- | --------------------------------------------------------------- |
| [Tabs](./Tabs.md)                     | Tab bar with keyboard navigation (Tabs, TabList, Tab, TabPanel) |
| [Breadcrumb](./Breadcrumb.md)         | Navigation breadcrumb trail                                     |
| [TreeView](./TreeView.md)             | Expandable/collapsible tree                                     |
| [CommandPalette](./CommandPalette.md) | Filterable command list                                         |

## Dialogs

| Component                         | Description                      |
| --------------------------------- | -------------------------------- |
| [ModalDialog](./ModalDialog.md)   | Reusable modal dialog            |
| [PickerDialog](./PickerDialog.md) | Search-and-select dialog         |
| [PickerList](./PickerList.md)     | Standalone scrolling result list |

## Data Display

| Component               | Description                                  |
| ----------------------- | -------------------------------------------- |
| [Table](./Table.md)     | Data table with headers and column alignment |
| [Console](./Console.md) | Rendered console output                      |

## Feedback

| Component                       | Description                                     |
| ------------------------------- | ----------------------------------------------- |
| [Spinner](./Spinner.md)         | Animated loading spinner                        |
| [ProgressBar](./ProgressBar.md) | Progress bar (determinate/indeterminate)        |
| [Toast](./Toast.md)             | Toast notifications (useToast + ToastContainer) |

## Error Handling

| Component                           | Description                       |
| ----------------------------------- | --------------------------------- |
| [ErrorBoundary](./ErrorBoundary.md) | Catches render errors in children |

## Theming

| Component                           | Description                      |
| ----------------------------------- | -------------------------------- |
| [ThemeProvider](./ThemeProvider.md) | Provides Theme to component tree |

## Form Layout

| Component         | Description                             |
| ----------------- | --------------------------------------- |
| [Form](./Form.md) | Vertical form layout (Form + FormField) |
