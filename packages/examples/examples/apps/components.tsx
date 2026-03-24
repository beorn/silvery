/**
 * Components Showcase
 *
 * A UI component gallery demonstrating silvery's built-in components:
 * - Typography: H1-H3, Strong, Muted, Small, Lead, Code, Blockquote, lists
 * - Inputs: TextInput, TextArea, SelectList, Toggle with focus cycling
 * - Display: ProgressBar, Spinner, Badge, border styles, ModalDialog
 */

import React, { useState, useCallback } from "react"
import {
  render,
  Box,
  Text,
  Muted,
  useInput,
  useApp,
  createTerm,
  // Typography
  H1,
  H2,
  H3,
  P,
  Lead,
  Small,
  Strong,
  Em,
  Code,
  Blockquote,
  CodeBlock,
  HR,
  UL,
  OL,
  LI,
  // Inputs
  TextInput,
  TextArea,
  SelectList,
  Toggle,
  Button,
  // Display
  ProgressBar,
  Spinner,
  Badge,
  Divider,
  ModalDialog,
  // Tabs
  Tabs,
  TabList,
  Tab,
  TabPanel,
  type Key,
} from "silvery"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Components",
  description: "UI component gallery with typography, inputs, and dialogs",
  demo: true,
  features: ["Typography", "TextInput", "SelectList", "ModalDialog", "ProgressBar", "focus ring"],
}

// ============================================================================
// Typography Tab
// ============================================================================

function TypographyTab() {
  return (
    <Box flexDirection="column" gap={1} paddingX={1} overflow="scroll" flexGrow={1}>
      <H1>Getting Started with Silvery</H1>
      <Lead>Build modern terminal UIs with React — layout feedback, semantic theming, and 30+ components.</Lead>

      <HR />

      <H2>Installation</H2>
      <P>
        Install silvery and its peer dependencies. The framework uses <Strong>React 19</Strong> with a custom reconciler
        — no DOM required.
      </P>
      <CodeBlock>{"bun add silvery"}</CodeBlock>

      <H2>Core Concepts</H2>
      <P>
        Silvery follows <Em>The Silvery Way</Em> — 10 principles that keep your TUI apps shiny. Here are the most
        important ones:
      </P>

      <H3>Use Built-in Components</H3>
      <P>
        <Code>silvery/ui</Code> ships 30+ components. They handle keyboard navigation, theming,
        mouse support, and dozens of edge cases.
      </P>
      <UL>
        <LI>
          <Strong>SelectList</Strong> — keyboard-navigable single-select with j/k, wrapping, and scroll
        </LI>
        <LI>
          <Strong>TextInput</Strong> — full readline: Ctrl+A/E/K/U, Alt+B/F, kill ring, clipboard
        </LI>
        <LI>
          <Strong>ModalDialog</Strong> — double-border dialog with title, footer, and input blocking
        </LI>
        <LI>
          <Strong>ProgressBar</Strong> — determinate and indeterminate modes with auto-width
        </LI>
      </UL>

      <H3>Semantic Theme Colors</H3>
      <P>
        Use <Code>$tokens</Code> instead of hardcoded colors. Your app adapts to 38 built-in palettes automatically:
      </P>
      <OL>
        <LI>
          <Text color="$primary">$primary</Text> — brand emphasis, active elements
        </LI>
        <LI>
          <Text color="$accent">$accent</Text> — contrasting hue for attention
        </LI>
        <LI>
          <Text color="$success">$success</Text> — completion, checkmarks
        </LI>
        <LI>
          <Text color="$warning">$warning</Text> — caution signals
        </LI>
        <LI>
          <Text color="$error">$error</Text> — failures, destructive actions
        </LI>
      </OL>

      <Blockquote>
        Less is more. The best color code is no color code — most components already use the right tokens.
      </Blockquote>

      <H3>Think in Flexbox</H3>
      <P>
        Silvery uses CSS flexbox via Flexily. Components know their size via <Code>useContentRect()</Code> —
        synchronous, during render. No effects, no flash.
      </P>

      <Small>Last updated: silvery v0.0.1 — see silvery.dev for full documentation</Small>
    </Box>
  )
}

// ============================================================================
// Inputs Tab
// ============================================================================

const frameworkItems = [
  { label: "Silvery", value: "silvery" },
  { label: "Ink", value: "ink" },
  { label: "Blessed", value: "blessed", disabled: true },
  { label: "Terminal Kit", value: "terminal-kit" },
  { label: "React Curse", value: "react-curse" },
]

function InputsTab() {
  const [textValue, setTextValue] = useState("")
  const [areaValue, setAreaValue] = useState("")
  const [selectedFramework, setSelectedFramework] = useState(0)
  const [darkMode, setDarkMode] = useState(true)
  const [notifications, setNotifications] = useState(false)
  const [autoSave, setAutoSave] = useState(true)
  const [focusIndex, setFocusIndex] = useState(0)

  const focusableCount = 5

  useInput((_input: string, key: Key) => {
    if (key.tab && !key.shift) {
      setFocusIndex((prev) => (prev + 1) % focusableCount)
    }
    if (key.tab && key.shift) {
      setFocusIndex((prev) => (prev - 1 + focusableCount) % focusableCount)
    }
  })

  const resetAll = useCallback(() => {
    setTextValue("")
    setAreaValue("")
    setSelectedFramework(0)
    setDarkMode(true)
    setNotifications(false)
    setAutoSave(true)
  }, [])

  return (
    <Box flexDirection="column" gap={1} paddingX={1} overflow="scroll" flexGrow={1}>
      <Box flexDirection="row" gap={2} flexGrow={1}>
        {/* Left column: Input controls */}
        <Box flexDirection="column" gap={1} flexGrow={1} flexBasis={0}>
          <H2>Text Input</H2>
          <TextInput
            value={textValue}
            onChange={setTextValue}
            onSubmit={() => setTextValue("")}
            placeholder="Type something..."
            prompt="search: "
            borderStyle="round"
            isActive={focusIndex === 0}
          />

          <H2>Text Area</H2>
          <TextArea
            value={areaValue}
            onChange={setAreaValue}
            placeholder="Write your thoughts..."
            height={4}
            borderStyle="round"
            isActive={focusIndex === 1}
          />

          <H2>Select List</H2>
          <Box borderStyle="round" borderColor={focusIndex === 2 ? "$focusborder" : "$border"} paddingX={1}>
            <SelectList
              items={frameworkItems}
              highlightedIndex={selectedFramework}
              onHighlight={setSelectedFramework}
              isActive={focusIndex === 2}
            />
          </Box>
        </Box>

        {/* Right column: Toggles + Summary */}
        <Box flexDirection="column" gap={1} flexGrow={1} flexBasis={0}>
          <H2>Toggles</H2>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={focusIndex === 3 ? "$focusborder" : "$border"}
            paddingX={1}
            paddingY={1}
            gap={1}
          >
            <Toggle value={darkMode} onChange={setDarkMode} label="Dark mode" isActive={focusIndex === 3} />
            <Toggle value={notifications} onChange={setNotifications} label="Notifications" isActive={false} />
            <Toggle value={autoSave} onChange={setAutoSave} label="Auto-save" isActive={false} />
          </Box>

          <H2>Button</H2>
          <Button label="Reset All" onPress={resetAll} isActive={focusIndex === 4} />

          <HR />

          <H2>Current Values</H2>
          <Box flexDirection="column" backgroundColor="$surfacebg" paddingX={1} paddingY={1} borderStyle="round">
            <Text color="$surface">
              <Strong>Text:</Strong> {textValue || <Muted>(empty)</Muted>}
            </Text>
            <Text color="$surface">
              <Strong>Area:</Strong>{" "}
              {areaValue ? areaValue.split("\n")[0] + (areaValue.includes("\n") ? "..." : "") : <Muted>(empty)</Muted>}
            </Text>
            <Text color="$surface">
              <Strong>Framework:</Strong> {frameworkItems[selectedFramework]?.label}
            </Text>
            <Text color="$surface">
              <Strong>Dark mode:</Strong> {darkMode ? "on" : "off"}
            </Text>
            <Text color="$surface">
              <Strong>Notifications:</Strong> {notifications ? "on" : "off"}
            </Text>
            <Text color="$surface">
              <Strong>Auto-save:</Strong> {autoSave ? "on" : "off"}
            </Text>
          </Box>
        </Box>
      </Box>

      <Small>Tab/Shift+Tab to cycle focus — Space toggles — Enter submits</Small>
    </Box>
  )
}

// ============================================================================
// Display Tab
// ============================================================================

function DisplayTab() {
  const [showModal, setShowModal] = useState(false)
  const [selectedBorder, setSelectedBorder] = useState(0)

  const borderStyles = ["round", "bold", "single", "double", "classic"] as const

  useInput((input: string, key: Key) => {
    if (key.return && !showModal) {
      setShowModal(true)
    }
    if ((key.escape || input === "q") && showModal) {
      setShowModal(false)
    }
    if (input === "j" && !showModal) {
      setSelectedBorder((prev) => Math.min(prev + 1, borderStyles.length - 1))
    }
    if (input === "k" && !showModal) {
      setSelectedBorder((prev) => Math.max(prev - 1, 0))
    }
  })

  return (
    <Box flexDirection="column" gap={1} paddingX={1} overflow="scroll" flexGrow={1}>
      <Box flexDirection="row" gap={2} flexGrow={1}>
        {/* Left column */}
        <Box flexDirection="column" gap={1} flexGrow={1} flexBasis={0}>
          <H2>Progress Bars</H2>
          <Box flexDirection="column" gap={1}>
            <Box>
              <Text color="$muted">{"Build   "}</Text>
              <Box flexGrow={1}>
                <ProgressBar value={1.0} label="✓" />
              </Box>
            </Box>
            <Box>
              <Text color="$muted">{"Test    "}</Text>
              <Box flexGrow={1}>
                <ProgressBar value={0.73} />
              </Box>
            </Box>
            <Box>
              <Text color="$muted">{"Deploy  "}</Text>
              <Box flexGrow={1}>
                <ProgressBar value={0.35} />
              </Box>
            </Box>
            <Box>
              <Text color="$muted">{"Install "}</Text>
              <Box flexGrow={1}>
                <ProgressBar />
              </Box>
            </Box>
          </Box>

          <H2>Spinners</H2>
          <Box flexDirection="column">
            <Spinner type="dots" label="Loading packages..." />
            <Spinner type="line" label="Compiling..." />
            <Spinner type="arc" label="Optimizing bundle..." />
            <Spinner type="bounce" label="Connecting..." />
          </Box>

          <H2>Badges</H2>
          <Box gap={1} flexWrap="wrap">
            <Badge label="Stable" variant="success" />
            <Badge label="Beta" variant="warning" />
            <Badge label="Deprecated" variant="error" />
            <Badge label="v0.0.1" variant="primary" />
            <Badge label="MIT" />
          </Box>
        </Box>

        {/* Right column */}
        <Box flexDirection="column" gap={1} flexGrow={1} flexBasis={0}>
          <H2>Border Styles</H2>
          <Box flexDirection="column" gap={1}>
            {borderStyles.map((style, i) => (
              <Box
                key={style}
                borderStyle={style as any}
                borderColor={i === selectedBorder ? "$primary" : "$border"}
                paddingX={1}
              >
                <Text bold={i === selectedBorder}>
                  {i === selectedBorder ? "▸ " : "  "}
                  {style}
                </Text>
              </Box>
            ))}
          </Box>

          <Divider title="Status" />

          <Box flexDirection="column">
            <Text color="$success">✓ All checks passed</Text>
            <Text color="$warning">⚠ 2 deprecation warnings</Text>
            <Text color="$error">✗ 1 vulnerability found</Text>
            <Text color="$info">ℹ 47 packages installed</Text>
          </Box>

          <Small>j/k select border — Enter opens modal — q quits</Small>
        </Box>
      </Box>

      {showModal && (
        <Box position="absolute" display="flex" justifyContent="center" alignItems="center" width="100%" height="100%">
          <ModalDialog title="Component Gallery" width={50} footer="ESC or q to close">
            <Box flexDirection="column" gap={1}>
              <P>
                This gallery demonstrates <Strong>silvery</Strong>'s built-in UI components. Every component uses
                semantic theme tokens — they adapt to any of the 38 built-in palettes automatically.
              </P>
              <HR />
              <Box flexDirection="column">
                <Text color="$success">✓ Typography presets (H1-H3, Lead, Muted, Code)</Text>
                <Text color="$success">✓ Input components (TextInput, TextArea, SelectList)</Text>
                <Text color="$success">✓ Display widgets (ProgressBar, Spinner, Badge)</Text>
                <Text color="$success">✓ Layout primitives (Box, Divider, border styles)</Text>
                <Text color="$success">✓ Dialog system (ModalDialog with input blocking)</Text>
              </Box>
            </Box>
          </ModalDialog>
        </Box>
      )}
    </Box>
  )
}

// ============================================================================
// App
// ============================================================================

export function ComponentsApp() {
  const { exit } = useApp()
  const [activeTab, setActiveTab] = useState("typography")

  useInput((input: string, key: Key) => {
    // Only quit with q when not on the inputs tab (where user may be typing)
    if (input === "q" && activeTab !== "inputs") {
      exit()
    }
    if (key.escape && activeTab !== "display") {
      exit()
    }
  })

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Tabs defaultValue="typography" onChange={setActiveTab}>
        <TabList>
          <Tab value="typography">Typography</Tab>
          <Tab value="inputs">Inputs</Tab>
          <Tab value="display">Display</Tab>
        </TabList>
        <TabPanel value="typography">
          <TypographyTab />
        </TabPanel>
        <TabPanel value="inputs">
          <InputsTab />
        </TabPanel>
        <TabPanel value="display">
          <DisplayTab />
        </TabPanel>
      </Tabs>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l tab  Tab cycle inputs  j/k navigate  Enter modal  Esc/q quit">
      <ComponentsApp />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
