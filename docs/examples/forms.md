---
title: Forms & Input — TextInput, SelectList, Validation
description: Build interactive forms, multi-step wizards, and input-driven UIs with Silvery's TextInput, SelectList, and focus scope components.
prev:
  text: Layout
  link: /examples/layout
next:
  text: Tables & Data
  link: /examples/tables
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Forms & Input

Interactive CLI wizards guide users through multi-step configuration, installation, or setup flows. Silvery provides the building blocks as first-class React components: each wizard step is a React component with its own state, and transitions between steps are just state changes. You get full control over layout, focus, and rendering without leaving the React model.

<LiveDemo xtermSrc="/examples/showcase.html?demo=cli-wizard" :height="400" />

## Key Benefits

- **SelectList** — Built-in single-select with keyboard navigation (arrow keys, j/k, Home/End), disabled item support, and automatic scroll windowing via `maxVisible`. No external prompt library needed.

- **TextInput** — Text input with full readline shortcuts (Ctrl+A/E for Home/End, Ctrl+K/U for kill line, Alt+B/F for word movement, Ctrl+Y for yank, kill ring). Supports controlled and uncontrolled modes, placeholder text, and password masking.

- **ProgressBar and Spinner** — Visual progress feedback during long operations. `ProgressBar` supports both determinate (0–1 value) and indeterminate (animated) modes. `Spinner` ships with four animation presets (dots, line, arc, bounce).

- **Focus scopes** — Each wizard step can live inside a `Box` with `focusScope`, so Tab and arrow key navigation cycles within that step rather than leaking to the entire app.

- **Static rendering** — When the wizard finishes, use `renderStatic()` to produce pipe-friendly output with no cursor control sequences. Pass `{ plain: true }` to strip ANSI codes entirely.

## Source Code

A complete multi-step wizard using Silvery's built-in components — SelectList handles keyboard navigation, TextInput provides readline editing, and ProgressBar shows progress. No manual `useInput()` for selection or text entry:

::: code-group

```tsx [wizard.tsx]
import { useState, useEffect } from "react"
import { Box, Text, SelectList, TextInput, ProgressBar, render, useApp, createTerm } from "silvery"

type Step = "select" | "name" | "install" | "done"

function Wizard() {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>("select")
  const [framework, setFramework] = useState("")
  const [name, setName] = useState("")
  const [progress, setProgress] = useState(0)

  // Simulate installation progress
  useEffect(() => {
    if (step !== "install") return
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          clearInterval(timer)
          setStep("done")
          return 1
        }
        return p + 0.05
      })
    }, 100)
    return () => clearInterval(timer)
  }, [step])

  if (step === "select") {
    return (
      <Box flexDirection="column" gap={1} focusScope>
        <Text bold>Step 1: Choose a framework</Text>
        <SelectList
          items={[
            { label: "React", value: "react" },
            { label: "Vue", value: "vue" },
            { label: "Svelte", value: "svelte" },
            { label: "Angular (coming soon)", value: "angular", disabled: true },
          ]}
          onSelect={(item) => {
            setFramework(item.label)
            setStep("name")
          }}
          maxVisible={5}
        />
        <Text color="$muted">↑↓ navigate  Enter select</Text>
      </Box>
    )
  }

  if (step === "name") {
    return (
      <Box flexDirection="column" gap={1} focusScope>
        <Text bold>Step 2: Project name</Text>
        <TextInput
          placeholder="my-app"
          onSubmit={(val) => {
            setName(val || "my-app")
            setStep("install")
          }}
          prompt="> "
        />
        <Text color="$muted">Type a name and press Enter (Ctrl+A/E, Ctrl+K/U, Alt+B/F all work)</Text>
      </Box>
    )
  }

  if (step === "install") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Step 3: Installing {framework}...</Text>
        <ProgressBar value={progress} width={40} color="$success" />
        <Text color="$muted">Setting up {name || "my-app"}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="$success" bold>Done!</Text>
      <Text>Created {name || "my-app"} with {framework}.</Text>
      <Text color="$muted">Press q to exit</Text>
    </Box>
  )
}

using term = createTerm()
await render(<Wizard />, term)
```

:::

## Key Patterns

### Multi-Step State Machine

Wizard steps are just state. Transitions are `setStep()` calls. Each step renders different content:

```tsx
type Step = "select" | "name" | "install" | "done"
const [step, setStep] = useState<Step>("select")

// In render:
if (step === "select") return <SelectionUI />
if (step === "name") return <NameInputUI />
if (step === "install") return <ProgressUI />
return <DoneUI />
```

### SelectList — Not Manual Cursor Tracking

Use SelectList instead of building your own list with `useInput()` + cursor state. It handles arrow keys, j/k, Home/End, disabled items, scroll windowing, and selection callbacks:

```tsx
<SelectList
  items={[
    { label: "React", value: "react" },
    { label: "Vue", value: "vue" },
    { label: "Angular", value: "angular", disabled: true },
  ]}
  onSelect={(item) => handleSelection(item.value)}
  maxVisible={5}
/>
```

### TextInput — Full Readline Built In

TextInput ships with Emacs keybindings out of the box — no manual key handling needed:

- **Ctrl+A / Ctrl+E** — Home / End
- **Ctrl+K / Ctrl+U** — Kill to end / Kill to start
- **Alt+B / Alt+F** — Word backward / forward
- **Ctrl+Y** — Yank (paste from kill ring)
- **Ctrl+W** — Kill word backward

```tsx
<TextInput
  placeholder="my-app"
  onSubmit={(val) => setName(val)}
  prompt="> "
/>
```

### Focus Scopes — Isolate Navigation Per Step

Each wizard step wraps in `focusScope` so Tab cycles within that step, not the entire app:

```tsx
<Box focusScope>
  <SelectList items={options} onSelect={handleSelect} />
</Box>
```

When the step transitions, focus automatically moves to the new scope's first focusable element.

## Features Used

| Feature | Usage |
| --- | --- |
| `SelectList` | Single-select with keyboard navigation |
| `TextInput` | Text entry with readline shortcuts |
| `ProgressBar` | Visual installation progress |
| `Spinner` | Loading animation |
| `focusScope` | Tab navigation isolation per step |
| `useInput()` | Custom keyboard handling |
| `renderStatic()` | Pipe-friendly final output |

## What Silvery Adds

Most terminal UI libraries force you to chain sequential `readline` prompts or shell out to separate prompt utilities. Silvery takes a different approach: each wizard step is a React component with its own state. One framework, no plugin constellation.

## Exercises

1. **Add validation** — Reject empty project names, show error messages
2. **Add a back button** — Press Escape to go to the previous step
3. **Multi-select** — Let users pick multiple frameworks with Space to toggle
4. **Animated progress** — Use indeterminate ProgressBar during dependency resolution
