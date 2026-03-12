/**
 * CLIWizardShowcase — Clack-style interactive setup wizard
 *
 * Step-by-step project creation with text input, select menus, gradient pipe,
 * progress bar, and a summary box on completion.
 */

import React, { useState } from "react"
import { Box, Text, useInput } from "@silvery/term/xterm/index.ts"
import { useMouseClick, KeyHints } from "./shared.js"

// --- Types ---

interface WizardState {
  step: number
  cursor: number
  answers: string[]
}

// --- Data ---

const WIZARD_STEPS = [
  { label: "Project name", type: "text" as const, answer: "my-app" },
  {
    label: "Framework",
    type: "select" as const,
    options: ["Vanilla", "React", "Vue", "Svelte"],
    answer: "React",
    defaultCursor: 1,
  },
  {
    label: "TypeScript?",
    type: "select" as const,
    options: ["Yes", "No"],
    answer: "Yes",
    defaultCursor: 0,
  },
  {
    label: "Package manager",
    type: "select" as const,
    options: ["bun", "npm", "yarn", "pnpm"],
    answer: "bun",
    defaultCursor: 0,
  },
]

// Catppuccin Mocha palette gradient for the wizard pipe (purple -> teal -> green)
const PIPE_GRADIENT = [
  "#cba6f7", // mauve
  "#b4befe", // lavender
  "#89b4fa", // blue
  "#74c7ec", // sapphire
  "#89dceb", // sky
  "#94e2d5", // teal
  "#a6e3a1", // green
]

// Distinct bullet colors per step (Catppuccin Mocha)
const STEP_COLORS = ["#cba6f7", "#89b4fa", "#89dceb", "#f9e2af"]

function GradientPipe({ index, total }: { index: number; total: number }): JSX.Element {
  const gradientIdx = Math.floor((index / Math.max(1, total - 1)) * (PIPE_GRADIENT.length - 1))
  const color = PIPE_GRADIENT[Math.min(gradientIdx, PIPE_GRADIENT.length - 1)]!
  return <Text color={color}>{"\u2502"}</Text>
}

export function CLIWizardShowcase(): JSX.Element {
  const [state, setState] = useState<WizardState>({
    step: 0,
    cursor: 0,
    answers: [],
  })
  const [done, setDone] = useState(false)
  const [textInput, setTextInput] = useState("")

  useInput((input, key) => {
    if (done) return
    const currentStep = WIZARD_STEPS[state.step]
    if (!currentStep) return

    if (currentStep.type === "select") {
      const opts = currentStep.options!
      if (key.upArrow) setState((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }))
      if (key.downArrow) setState((s) => ({ ...s, cursor: Math.min(opts.length - 1, s.cursor + 1) }))
    }

    if (currentStep.type === "text") {
      if (key.backspace || key.delete) {
        setTextInput((t) => t.slice(0, -1))
        return
      }
      if (input) {
        setTextInput((t) => t + input)
        return
      }
    }

    if (key.return) {
      let answer: string
      if (currentStep.type === "select") {
        answer = currentStep.options![state.cursor]!
      } else {
        answer = textInput || currentStep.answer
        setTextInput("")
      }
      const newAnswers = [...state.answers, answer]
      if (state.step + 1 >= WIZARD_STEPS.length) {
        setDone(true)
        setState({ step: state.step + 1, cursor: 0, answers: newAnswers })
      } else {
        const nextStep = WIZARD_STEPS[state.step + 1]!
        const nextCursor = nextStep.type === "select" ? (nextStep.defaultCursor ?? 0) : 0
        setState({ step: state.step + 1, cursor: nextCursor, answers: newAnswers })
      }
    }
  })

  // Click to select options in select steps
  useMouseClick(({ y }) => {
    if (done) return
    const currentStep = WIZARD_STEPS[state.step]
    if (currentStep?.type !== "select") return

    // Calculate where options start in the terminal output:
    // padding(1) + title(1) + version(1) + marginBottom(1) + progress(1) + marginBottom(1) +
    // header "Configure..."(1) + pipe(1) = 8 rows of header
    // Each completed step: label(1) + pipe(1) = 2 rows
    // Active step label(1) = 1 row, then options start
    const headerRows = 8
    const completedRows = state.step * 2
    const activeLabel = 1
    const optionsStartY = headerRows + completedRows + activeLabel

    const clickedOption = y - optionsStartY
    if (clickedOption >= 0 && clickedOption < currentStep.options!.length) {
      setState((s) => ({ ...s, cursor: clickedOption }))
    }
  })

  // Progress bar: completed steps / total
  const progress = Math.min(state.step, WIZARD_STEPS.length)
  const progressWidth = 20
  const filled = Math.round((progress / WIZARD_STEPS.length) * progressWidth)

  // Total pipe lines for gradient calculation
  const totalPipeLines = WIZARD_STEPS.length * 3 + 4

  // Track line index for gradient
  let pipeLineIdx = 0

  return (
    <Box flexDirection="column" padding={1} paddingLeft={2}>
      {/* Title bar */}
      <Box marginBottom={0}>
        <Text color="#cba6f7" bold>
          {"\u25B2 "}
        </Text>
        <Text bold color="#cdd6f4">
          create-app
        </Text>
        <Text color="#6c7086"> v1.0</Text>
      </Box>

      {/* Progress indicator */}
      <Box marginBottom={1}>
        <Text color="#585b70"> </Text>
        <Text>
          <Text color="#a6e3a1">{"\u2501".repeat(filled)}</Text>
          <Text color="#313244">{"\u2501".repeat(progressWidth - filled)}</Text>
        </Text>
        <Text color="#585b70">
          {" "}
          {progress}/{WIZARD_STEPS.length}
        </Text>
      </Box>

      <Text>
        <Text bold color="#cba6f7">
          {"\u250C"}{" "}
        </Text>
        <Text bold color="#cdd6f4">
          Configure your project
        </Text>
      </Text>
      <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />

      {WIZARD_STEPS.map((ws, i) => {
        const isDone = i < state.step
        const isActive = i === state.step && !done
        const isPending = i > state.step
        const stepColor = STEP_COLORS[i % STEP_COLORS.length]!

        if (isDone) {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#a6e3a1" bold>
                  {"\u2714"}
                </Text>
                <Text color="#a6adc8"> {ws.label}</Text>
                <Text dim color="#585b70">
                  {" "}
                  {"\u00B7"}{" "}
                </Text>
                <Text bold color={stepColor}>
                  {state.answers[i]}
                </Text>
              </Text>
              <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
            </React.Fragment>
          )
        }

        if (isActive && ws.type === "text") {
          const displayText = textInput || ws.answer
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color={stepColor} bold>
                  {"\u25C6"}
                </Text>
                <Text bold color="#cdd6f4">
                  {" "}
                  {ws.label}
                </Text>
              </Text>
              <Text>
                <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
                <Text color={stepColor}> {displayText}</Text>
                <Text color={stepColor}>{"\u258B"}</Text>
              </Text>
              <Text>
                <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
                <Text dim color="#585b70">
                  {" "}
                  type a name, then Enter
                </Text>
              </Text>
              <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
            </React.Fragment>
          )
        }

        if (isActive && ws.type === "select") {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color={stepColor} bold>
                  {"\u25C6"}
                </Text>
                <Text bold color="#cdd6f4">
                  {" "}
                  {ws.label}
                </Text>
              </Text>
              {ws.options!.map((opt, oi) => (
                <Text key={opt}>
                  <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
                  {"  "}
                  {oi === state.cursor ? (
                    <Text bold color={stepColor}>
                      {"\u25CF"} {opt}
                    </Text>
                  ) : (
                    <Text color="#6c7086">
                      {"\u25CB"} {opt}
                    </Text>
                  )}
                </Text>
              ))}
              <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
            </React.Fragment>
          )
        }

        if (isPending) {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#45475a">{"\u25CB"}</Text>
                <Text color="#585b70"> {ws.label}</Text>
              </Text>
              <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
            </React.Fragment>
          )
        }

        return null
      })}

      {done ? (
        <>
          <Text>
            <Text color="#a6e3a1" bold>
              {"\u2714"}
            </Text>
            <Text color="#a6e3a1" bold>
              {" "}
              All done!
            </Text>
          </Text>
          <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
          {/* Summary box with colored labels */}
          <Box flexDirection="column" marginLeft={1} borderStyle="round" borderColor="#45475a" paddingX={1}>
            <Text>
              <Text color="#cba6f7" bold>
                Project{"   "}
              </Text>
              <Text color="#cdd6f4">{state.answers[0] ?? "my-app"}</Text>
            </Text>
            <Text>
              <Text color="#89b4fa" bold>
                Framework{" "}
              </Text>
              <Text color="#cdd6f4">{state.answers[1] ?? "React"}</Text>
            </Text>
            <Text>
              <Text color="#89dceb" bold>
                TypeScript
              </Text>
              <Text color="#cdd6f4"> {state.answers[2] ?? "Yes"}</Text>
            </Text>
            <Text>
              <Text color="#f9e2af" bold>
                Manager{"   "}
              </Text>
              <Text color="#cdd6f4">{state.answers[3] ?? "bun"}</Text>
            </Text>
          </Box>
          <GradientPipe index={pipeLineIdx++} total={totalPipeLines} />
          <Text>
            <Text color="#a6e3a1" bold>
              {"\u2514"}{" "}
            </Text>
            <Text color="#a6e3a1">cd </Text>
            <Text color="#cdd6f4" bold>
              {state.answers[0] ?? "my-app"}
            </Text>
            <Text color="#6c7086"> && </Text>
            <Text color="#a6e3a1">bun dev</Text>
          </Text>
        </>
      ) : (
        <Text color="#45475a">{"\u2514"}</Text>
      )}

      <KeyHints hints={"\u2191\u2193 select  Enter confirm  Backspace/Del delete"} />
    </Box>
  )
}
