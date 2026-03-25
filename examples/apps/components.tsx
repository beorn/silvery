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
} from "../../src/index.js"
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

function TypographyTab({ scrollOffset }: { scrollOffset?: number }) {
  return (
    <Box flexDirection="column" gap={1} paddingX={1} overflow="scroll" scrollOffset={scrollOffset} flexGrow={1}>
      <Box flexDirection="column">
        <H1>Getting Started with Silvery</H1>
        <Lead>Build modern terminal UIs with React — layout feedback, semantic theming, and 30+ components.</Lead>
      </Box>

      <HR />

      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <H2>Typography</H2>
          <Box flexDirection="column">
            <Text bold color="$primary">
              H1 — Page Title (bold, $primary)
            </Text>
            <Text bold color="$accent">
              H2 — Section Heading (bold, $accent)
            </Text>
            <Text color="$primary">H3 — Group Heading ($primary)</Text>
            <P>P — Body paragraph text</P>
            <Lead>Lead — Introductory italic text</Lead>
            <Muted>Muted — Secondary information</Muted>
            <Small>Small — Fine print and captions</Small>
          </Box>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <H2>Inline Styles</H2>
          <Box flexDirection="column">
            <Text>
              <Strong>Strong</Strong> — bold emphasis
            </Text>
            <Text>
              <Em>Em</Em> — italic emphasis
            </Text>
            <Text>
              <Strong>
                <Em>Strong + Em</Em>
              </Strong>{" "}
              — bold italic
            </Text>
            <Text>
              <Text underline>Underline</Text> — underlined text
            </Text>
            <Text>
              <Text strikethrough>Strikethrough</Text> — deleted text
            </Text>
            <Text>
              <Code>Code</Code> — inline code span
            </Text>
            <Text>
              <Kbd>Kbd</Kbd> — keyboard shortcut
            </Text>
          </Box>
        </Box>
      </Box>

      <HR />

      <H2>Semantic Colors</H2>
      <Box flexDirection="column">
        <Box gap={1}>
          <Text backgroundColor="$primary" color="$primary-fg" bold>
            {" $primary "}
          </Text>
          <Text backgroundColor="$accent" color="$accent-fg" bold>
            {" $accent  "}
          </Text>
          <Text backgroundColor="$success" color="$success-fg" bold>
            {" $success "}
          </Text>
          <Text backgroundColor="$warning" color="$warning-fg" bold>
            {" $warning "}
          </Text>
          <Text backgroundColor="$error" color="$error-fg" bold>
            {" $error   "}
          </Text>
        </Box>
        <Box gap={1} marginTop={1}>
          <Text color="$primary">{"████"} primary</Text>
          <Text color="$accent">{"████"} accent</Text>
          <Text color="$success">{"████"} success</Text>
          <Text color="$warning">{"████"} warning</Text>
          <Text color="$error">{"████"} error</Text>
          <Text color="$muted">{"████"} muted</Text>
        </Box>
      </Box>

      <HR />

      <H2>Block Elements</H2>
      <Blockquote>
        The best color code is no color code — most components already use the right semantic tokens.
      </Blockquote>
      <CodeBlock>{"bun add silvery      # install\nbun run dev          # start dev server"}</CodeBlock>

      <H2>Lists</H2>
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <H3>Unordered</H3>
          <UL>
            <LI>
              <Strong>SelectList</Strong> — j/k navigation, scroll
            </LI>
            <LI>
              <Strong>TextInput</Strong> — full readline support
            </LI>
            <LI>
              <Strong>ModalDialog</Strong> — overlay with input blocking
            </LI>
            <LI>
              <Strong>ProgressBar</Strong> — determinate + indeterminate
            </LI>
          </UL>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <H3>Ordered</H3>
          <OL>
            <LI>
              Install with <Code>bun add silvery</Code>
            </LI>
            <LI>
              Use <Code>$tokens</Code> for semantic colors
            </LI>
            <LI>
              Layout with <Code>flexbox</Code> via Flexily
            </LI>
            <LI>
              Test with <Code>createTermless()</Code>
            </LI>
          </OL>
        </Box>
      </Box>

      <Small>silvery v0.0.1 — 38 palettes, 30+ components — silvery.dev</Small>
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

      {/* keyboard hints removed for static screenshots */}
    </Box>
  )
}

// ============================================================================
// Display Tab
// ============================================================================

function DisplayTab({ scrollOffset }: { scrollOffset?: number }) {
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
    <Box flexDirection="column" gap={1} flexGrow={1} marginTop={1}>
      {/* Progress Bars */}
      <Box flexDirection="column">
        <Divider title="Progress Bars" />
        <Box flexDirection="column">
          <Box>
            <Text color="$muted">{"Build   "}</Text>
            <Box flexGrow={1}><ProgressBar value={1.0} label="✓" /></Box>
          </Box>
          <Box>
            <Text color="$muted">{"Test    "}</Text>
            <Box flexGrow={1}><ProgressBar value={0.73} /></Box>
          </Box>
          <Box>
            <Text color="$muted">{"Deploy  "}</Text>
            <Box flexGrow={1}><ProgressBar value={0.35} /></Box>
          </Box>
          <Box>
            <Text color="$muted">{"Install "}</Text>
            <Box flexGrow={1}><ProgressBar /></Box>
          </Box>
        </Box>
      </Box>

      {/* Spinners + Badges row */}
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column">
          <Divider title="Spinners" />
          <Box flexDirection="column">
            <Spinner type="dots" label="Loading packages..." />
            <Spinner type="line" label="Compiling..." />
            <Spinner type="arc" label="Optimizing bundle..." />
            <Spinner type="bounce" label="Connecting..." />
          </Box>
        </Box>
        <Box flexDirection="column">
          <Divider title="Badges" />
          <Box gap={1} flexWrap="wrap">
            <Badge label="Stable" variant="success" />
            <Badge label="Beta" variant="warning" />
            <Badge label="Deprecated" variant="error" />
            <Badge label="v0.0.1" variant="primary" />
            <Badge label="MIT" />
          </Box>
        </Box>
      </Box>

      {/* Status + Border Styles row */}
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column">
          <Divider title="Status" />
          <Box flexDirection="column">
            <Text><Text color="$success">{"✓"}</Text> All checks passed</Text>
            <Text><Text color="$warning">{"⚠"}</Text> 2 deprecation warnings</Text>
            <Text><Text color="$error">{"✗"}</Text> 1 vulnerability found</Text>
            <Text><Text color="$info">{"ℹ"}</Text> 47 packages installed</Text>
          </Box>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Divider title="Border Styles" />
          <Box flexDirection="column" gap={0}>
            {borderStyles.map((style, i) => (
              <Box
                key={style}
                borderStyle={style as any}
                borderColor={i === selectedBorder ? "$primary" : "$border"}
                borderLeft={true}
                borderRight={true}
                borderTop={i === 0}
                borderBottom={true}
                paddingX={1}
              >
                <Text bold={i === selectedBorder}>
                  {i === selectedBorder ? "▸ " : "  "}{style}
                </Text>
              </Box>
            ))}
          </Box>
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
                <Text color="$success">{"✓ Typography presets (H1-H3, Lead, Muted, Code)"}</Text>
                <Text color="$success">{"✓ Input components (TextInput, TextArea, SelectList)"}</Text>
                <Text color="$success">{"✓ Display widgets (ProgressBar, Spinner, Badge)"}</Text>
                <Text color="$success">{"✓ Layout primitives (Box, Divider, border styles)"}</Text>
                <Text color="$success">{"✓ Dialog system (ModalDialog with input blocking)"}</Text>
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
  const [activeTab, setActiveTab] = useState("display")
  const [scrollOffset, setScrollOffset] = useState(0)

  // Reset scroll when switching tabs
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab)
    setScrollOffset(0)
  }, [])

  useInput((input: string, key: Key) => {
    // Only quit with q when not on the inputs tab (where user may be typing)
    if (input === "q" && activeTab !== "inputs") {
      exit()
    }
    if (key.escape && activeTab !== "display") {
      exit()
    }

    // Arrow keys / j/k scroll the active tab content (typography and display tabs)
    if (activeTab !== "inputs") {
      if (key.downArrow || (activeTab === "typography" && input === "j")) {
        setScrollOffset((prev) => prev + 1)
      }
      if (key.upArrow || (activeTab === "typography" && input === "k")) {
        setScrollOffset((prev) => Math.max(0, prev - 1))
      }
      if (key.pageDown) {
        setScrollOffset((prev) => prev + 10)
      }
      if (key.pageUp) {
        setScrollOffset((prev) => Math.max(0, prev - 10))
      }
      if (key.home || (activeTab === "typography" && input === "g")) {
        setScrollOffset(0)
      }
      if (key.end || (activeTab === "typography" && input === "G")) {
        setScrollOffset(999) // will be clamped by scroll phase
      }
    }
  })

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {activeTab === "display" && <DisplayTab scrollOffset={scrollOffset} />}
      {activeTab === "inputs" && <InputsTab />}
      {activeTab === "typography" && <TypographyTab scrollOffset={scrollOffset} />}
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
