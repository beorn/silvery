/**
 * CLI Wizard Example
 *
 * A multi-step project scaffolding wizard demonstrating:
 * - SelectList for option selection with keyboard navigation
 * - TextInput for free-form text entry
 * - ProgressBar for visual progress feedback
 * - Step-by-step flow with state transitions
 *
 * Usage: bun run examples/interactive/cli-wizard.tsx
 *
 * Controls:
 *   j/k or Up/Down - Navigate options (step 1)
 *   Enter          - Confirm selection / submit input
 *   Type           - Enter project name (step 2)
 *   q or Esc       - Quit (when not typing)
 */

import React, { useState, useCallback, useEffect } from "react"
import {
  render,
  Box,
  Text,
  SelectList,
  TextInput,
  ProgressBar,
  Spinner,
  useInput,
  useApp,
  createTerm,
  type Key,
  type SelectOption,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "CLI Wizard",
  description: "Multi-step project scaffolding wizard with selection, input, and progress",
  features: ["SelectList", "TextInput", "ProgressBar", "Spinner", "useInput()"],
}

// ============================================================================
// Types
// ============================================================================

type WizardStep = "framework" | "name" | "installing" | "done"

interface WizardState {
  step: WizardStep
  framework: string | null
  projectName: string
  progress: number
}

// ============================================================================
// Data
// ============================================================================

const FRAMEWORKS: SelectOption[] = [
  { label: "React      — A JavaScript library for building user interfaces", value: "react" },
  { label: "Vue        — The progressive JavaScript framework", value: "vue" },
  { label: "Svelte     — Cybernetically enhanced web apps", value: "svelte" },
  { label: "Solid      — Simple and performant reactivity", value: "solid" },
  { label: "Angular    — Platform for building web applications", value: "angular", disabled: true },
]

const INSTALL_STEPS = [
  "Resolving dependencies...",
  "Downloading packages...",
  "Linking dependencies...",
  "Building project...",
  "Generating types...",
  "Setting up config...",
  "Done!",
]

// ============================================================================
// Components
// ============================================================================

/** Step indicator showing current position in the wizard */
function StepIndicator({ current, total }: { current: number; total: number }): JSX.Element {
  return (
    <Box paddingX={1} marginBottom={1}>
      {Array.from({ length: total }, (_, i) => {
        const isDone = i < current
        const isCurrent = i === current
        const dot = isDone ? "\u25cf" : isCurrent ? "\u25cb" : "\u25cb"
        const color = isDone ? "$success" : isCurrent ? "$primary" : "$muted"
        return (
          <Text key={i} color={color} bold={isCurrent}>
            {dot}
            {i < total - 1 ? " \u2500 " : ""}
          </Text>
        )
      })}
    </Box>
  )
}

/** Step 1: Framework selection */
function FrameworkStep({ onSelect }: { onSelect: (option: SelectOption) => void }): JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="$primary">
          ? Select a framework:
        </Text>
      </Box>
      <SelectList items={FRAMEWORKS} onSelect={onSelect} />
      <Box marginTop={1}>
        <Text dim italic>
          (Angular is coming soon)
        </Text>
      </Box>
    </Box>
  )
}

/** Step 2: Project name input */
function NameStep({
  value,
  onChange,
  onSubmit,
  framework,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  framework: string
}): JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="$primary">
          ? Project name
        </Text>
        <Text color="$muted"> ({framework})</Text>
        <Text bold color="$primary">
          :
        </Text>
      </Box>
      <Box>
        <Text color="$muted">{"\u276f "}</Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} prompt="" />
      </Box>
      <Box marginTop={1}>
        <Text dim>Press Enter to confirm</Text>
      </Box>
    </Box>
  )
}

/** Step 3: Installation progress */
function InstallStep({ progress, stepIndex }: { progress: number; stepIndex: number }): JSX.Element {
  const currentStep = INSTALL_STEPS[Math.min(stepIndex, INSTALL_STEPS.length - 1)]!

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Spinner type="dots" />
        <Text bold color="$warning">
          {" "}
          Installing dependencies...
        </Text>
      </Box>

      <Box marginBottom={1}>
        <ProgressBar value={progress} color="$primary" label="" />
      </Box>

      <Text color="$muted">{currentStep}</Text>
    </Box>
  )
}

/** Step 4: Completion summary */
function DoneStep({ framework, projectName }: { framework: string; projectName: string }): JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="$success">
          {"\u2714"} Project created successfully!
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="$success" paddingX={2} paddingY={1}>
        <Box>
          <Text color="$muted">Framework: </Text>
          <Text bold>{framework}</Text>
        </Box>
        <Box>
          <Text color="$muted">Project: </Text>
          <Text bold>{projectName}</Text>
        </Box>
        <Box>
          <Text color="$muted">Location: </Text>
          <Text bold>./{projectName}/</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color="$muted">Get started:</Text>
        <Text bold color="$primary">
          {"  "}cd {projectName}
        </Text>
        <Text bold color="$primary">
          {"  "}bun install
        </Text>
        <Text bold color="$primary">
          {"  "}bun dev
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dim>Press q or Esc to exit</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

export function CliWizard(): JSX.Element {
  const { exit } = useApp()
  const [state, setState] = useState<WizardState>({
    step: "framework",
    framework: null,
    projectName: "",
    progress: 0,
  })

  // Handle framework selection
  const handleFrameworkSelect = useCallback((option: SelectOption) => {
    setState((prev) => ({
      ...prev,
      step: "name",
      framework: option.value,
      projectName: `my-${option.value}-app`,
    }))
  }, [])

  // Handle project name change
  const handleNameChange = useCallback((value: string) => {
    setState((prev) => ({ ...prev, projectName: value }))
  }, [])

  // Handle project name submission
  const handleNameSubmit = useCallback((value: string) => {
    if (value.trim()) {
      setState((prev) => ({ ...prev, step: "installing", progress: 0 }))
    }
  }, [])

  // Simulate installation progress
  useEffect(() => {
    if (state.step !== "installing") return

    const timer = setInterval(() => {
      setState((prev) => {
        const next = prev.progress + 0.08 + Math.random() * 0.04
        if (next >= 1) {
          clearInterval(timer)
          return { ...prev, step: "done", progress: 1 }
        }
        return { ...prev, progress: next }
      })
    }, 200)

    return () => clearInterval(timer)
  }, [state.step])

  // Global quit handler (only when not in text input step)
  useInput((input: string, key: Key) => {
    if (state.step === "name") return // TextInput handles its own input
    if (input === "q" || key.escape) {
      exit()
    }
  })

  // Map progress to step index for display
  const installStepIndex = Math.floor(state.progress * (INSTALL_STEPS.length - 1))

  const stepNumber = state.step === "framework" ? 0 : state.step === "name" ? 1 : state.step === "installing" ? 2 : 3

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box borderStyle="single" borderColor="$primary" paddingX={2} marginBottom={1}>
        <Text bold color="$primary">
          create-app
        </Text>
        <Text color="$muted"> v1.0.0</Text>
      </Box>

      <StepIndicator current={stepNumber} total={4} />

      {state.step === "framework" && <FrameworkStep onSelect={handleFrameworkSelect} />}

      {state.step === "name" && state.framework && (
        <NameStep
          value={state.projectName}
          onChange={handleNameChange}
          onSubmit={handleNameSubmit}
          framework={state.framework}
        />
      )}

      {state.step === "installing" && <InstallStep progress={state.progress} stepIndex={installStepIndex} />}

      {state.step === "done" && state.framework && (
        <DoneStep framework={state.framework} projectName={state.projectName} />
      )}
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="j/k navigate  Enter select  q/Esc quit">
      <CliWizard />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
