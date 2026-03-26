---
title: Components — 30+ Ready-Made UI Components
description: Kitchen-sink showcase of Silvery's component library — Tabs, SelectList, CommandPalette, ModalDialog, Toast, TreeView, Badge, Spinner, ProgressBar, and more.
prev:
  text: Overview
  link: /examples/
next:
  text: Layout
  link: /examples/layout
---

# Components

Silvery ships 30+ components out of the box — from basic building blocks (Box, Text) to complex interactive widgets (SelectList, CommandPalette, ModalDialog). This example shows them composed together in a single dashboard.

## What It Demonstrates

- **SelectList** — Keyboard-navigable selection with j/k, arrows, Home/End, disabled items, and `maxVisible` scroll windowing
- **ProgressBar** — Determinate (0–1 value) and indeterminate (animated) modes with customizable fill and colors
- **Spinner** — Four animation presets: dots, line, arc, bounce
- **TextInput** — Full readline shortcuts (Ctrl+A/E, Ctrl+K/U, Alt+B/F, Ctrl+Y, kill ring), placeholder, password masking
- **Tabs** — Tab/Shift+Tab or arrow-key switching between content panels
- **Badge** — Inline status indicators with semantic colors
- **Box** — Flex layout with borders, padding, margin, gap, overflow

## Key Patterns

### Component Composition

Silvery components compose like regular React. A SelectList inside a Box with borders, inside a flex column with a header — no special wiring needed:

```tsx
<Box flexDirection="column" borderStyle="single" borderColor="$primary">
  <Text bold> Choose a framework </Text>
  <SelectList
    items={[
      { label: "React", value: "react" },
      { label: "Vue", value: "vue" },
      { label: "Svelte", value: "svelte" },
    ]}
    onSelect={(item) => setFramework(item.value)}
    maxVisible={5}
  />
</Box>
```

### Semantic Theme Tokens

Use `$token` colors instead of hardcoded values. The theme adapts to the user's terminal palette:

```tsx
<Text color="$primary">Active</Text>
<Text color="$success">Completed</Text>
<Text color="$warning">Pending</Text>
<Text color="$error">Failed</Text>
<Text color="$muted">Secondary info</Text>
```

### Progress Feedback

ProgressBar sizes itself via flex — no manual width calculations:

```tsx
<Box flexDirection="row">
  <Box flexGrow={value}>
    <Text color="$success">{"█".repeat(50)}</Text>
  </Box>
  <Box flexGrow={100 - value}>
    <Text color="$muted">{"░".repeat(50)}</Text>
  </Box>
</Box>
```

## Features Used

| Feature         | Usage                                      |
| --------------- | ------------------------------------------ |
| `SelectList`    | Selection prompts with keyboard navigation |
| `TextInput`     | Text entry with readline shortcuts         |
| `ProgressBar`   | Visual progress feedback                   |
| `Spinner`       | Loading animation                          |
| `Box`           | Flex layout, borders, padding              |
| `Text`          | Styled text with `$token` colors           |
| `useInput()`    | Keyboard handling                          |
| `ThemeProvider` | Semantic color tokens                      |

## Exercises

1. **Add a ModalDialog** — Show a confirmation dialog when the user presses Enter on a selection
2. **Add a Toast** — Display a notification when an action completes
3. **Theme switching** — Add a keybinding to cycle through built-in themes
4. **Focus scopes** — Wrap each panel in a `Box` with `focusScope` so Tab cycles within each panel
