---
title: Building CLI Wizards & Setup Tools with inkx
description: Build interactive CLI wizards with multi-step forms, selection lists, progress bars, and focus scopes using inkx.
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# CLI Wizards & Setup Tools

Interactive CLI wizards guide users through multi-step configuration, installation, or setup flows. They combine selection prompts, text inputs, progress feedback, and branching logic into a single terminal experience. inkx provides the building blocks for all of this as first-class React components, so you can compose wizard steps the same way you compose any React UI.

<LiveDemo xtermSrc="/inkx/examples/showcase.html?demo=cli-wizard" :height="400" />

## Why inkx

Most terminal UI libraries force you to chain sequential `readline` prompts or shell out to separate prompt utilities. inkx takes a different approach: each wizard step is a React component with its own state, and transitions between steps are just state changes. You get full control over layout, focus, and rendering without leaving the React model.

## Key Benefits

- **SelectList component** -- Built-in single-select with keyboard navigation (arrow keys, j/k, Home/End), disabled item support, and automatic scroll windowing via `maxVisible`. No external prompt library needed.

- **TextInput and ReadlineInput** -- Text fields that work out of the box. `TextInput` covers simple cases; `ReadlineInput` adds full readline shortcuts (Ctrl+A/E for Home/End, Ctrl+K/U for kill line, Alt+B/F for word movement, Ctrl+Y for yank, and a kill ring). Both support controlled and uncontrolled modes, placeholder text, and password masking.

- **ProgressBar and Spinner** -- Visual progress feedback during long operations. `ProgressBar` supports both determinate (0-1 value) and indeterminate (animated bounce) modes with customizable fill characters and colors. `Spinner` ships with four animation presets (dots, line, arc, bounce).

- **Focus scopes** -- Each wizard step can live inside a `Box` with `focusScope`, so Tab and arrow key navigation cycles within that step rather than leaking to the entire app. Enter a scope on step transition, exit it on Back. The focus system is tree-based and requires no manual wiring.

- **Static rendering** -- When the wizard finishes, use `renderStatic()` to produce pipe-friendly output with no cursor control sequences. Pass `{ plain: true }` to strip ANSI codes entirely, making the output safe for redirection to files or other tools.

## Code Example

A complete multi-step wizard using `run()`, `SelectList`, `TextInput`, and `ProgressBar`:

```tsx
import { useState, useEffect } from "react"
import { run, useInput } from "inkx/runtime"
import { Box, Text, SelectList, TextInput, ProgressBar } from "inkx"

type Step = "select" | "name" | "install" | "done"

function Wizard() {
  const [step, setStep] = useState<Step>("select")
  const [framework, setFramework] = useState("")
  const [name, setName] = useState("")
  const [progress, setProgress] = useState(0)

  useInput((input) => {
    if (input === "q") return "exit"
  })

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
      <Box flexDirection="column" gap={1}>
        <Text bold>Step 1: Choose a framework</Text>
        <SelectList
          items={[
            { label: "React", value: "react" },
            { label: "Vue", value: "vue" },
            { label: "Svelte", value: "svelte" },
            { label: "Angular (coming soon)", value: "angular", disabled: true },
          ]}
          onSelect={(opt) => {
            setFramework(opt.label)
            setStep("name")
          }}
        />
        <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
      </Box>
    )
  }

  if (step === "name") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Step 2: Project name</Text>
        <TextInput
          placeholder="my-app"
          onSubmit={(val) => {
            setName(val || "my-app")
            setStep("install")
          }}
          prompt="> "
        />
        <Text dimColor>Type a name and press Enter</Text>
      </Box>
    )
  }

  if (step === "install") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Step 3: Installing {framework}...</Text>
        <ProgressBar value={progress} width={40} color="green" />
        <Text dimColor>Setting up {name}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="green" bold>
        Done!
      </Text>
      <Text>
        Created {name} with {framework}.
      </Text>
      <Text dimColor>Press q to exit</Text>
    </Box>
  )
}

await run(<Wizard />)
```

Run it with `bun wizard.tsx` or `npx tsx wizard.tsx`.

## What inkx Adds

Most TUI frameworks require third-party packages for selection lists, progress bars, and spinners. inkx ships all wizard primitives as first-party components with consistent APIs: `SelectList` handles single and multi-select with keyboard navigation, `ProgressBar` and `Spinner` provide visual feedback, and focus scopes isolate Tab navigation per wizard step. One framework, no plugin constellation.

## Next Steps

Ready to build your own CLI wizard? Start with the [Getting Started guide](/guide/getting-started) to set up inkx, then explore the [Components guide](/guide/components) for SelectList, TextInput, ProgressBar, and Spinner.
