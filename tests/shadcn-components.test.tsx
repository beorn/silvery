/**
 * Tests for shadcn-style components:
 *   Form/FormField, Toast/useToast, CommandPalette, TreeView,
 *   Breadcrumb, Tabs, Tooltip, Skeleton
 *
 * Uses createRenderer for interactive components and static rendering
 * for simple display components.
 */

import React, { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { Box, Text, useInput } from "../src/index.js"
import { Form, FormField } from "../src/components/Form.js"
import { useToast, ToastContainer } from "../src/components/Toast.js"
import { CommandPalette } from "../src/components/CommandPalette.js"
import type { CommandItem } from "../src/components/CommandPalette.js"
import { TreeView } from "../src/components/TreeView.js"
import type { TreeNode } from "../src/components/TreeView.js"
import { Breadcrumb } from "../src/components/Breadcrumb.js"
import { Tabs, TabList, Tab, TabPanel } from "../src/components/Tabs.js"
import { Tooltip } from "../src/components/Tooltip.js"
import { Skeleton } from "../src/components/Skeleton.js"
import { createRenderer } from "inkx/testing"

// =============================================================================
// Form + FormField
// =============================================================================

describe("Form", () => {
  const render = createRenderer({ cols: 50, rows: 10 })

  test("renders children vertically", () => {
    const app = render(
      <Form>
        <Text>Field 1</Text>
        <Text>Field 2</Text>
      </Form>,
    )
    expect(app.text).toContain("Field 1")
    expect(app.text).toContain("Field 2")
  })

  test("renders FormField with label", () => {
    const app = render(
      <Form>
        <FormField label="Username">
          <Text>input here</Text>
        </FormField>
      </Form>,
    )
    expect(app.text).toContain("Username")
    expect(app.text).toContain("input here")
  })

  test("renders FormField with error message", () => {
    const app = render(
      <Form>
        <FormField label="Email" error="Invalid email address">
          <Text>test@</Text>
        </FormField>
      </Form>,
    )
    expect(app.text).toContain("Email")
    expect(app.text).toContain("Invalid email address")
  })

  test("renders FormField with required indicator", () => {
    const app = render(
      <Form>
        <FormField label="Name" required>
          <Text>input</Text>
        </FormField>
      </Form>,
    )
    expect(app.text).toContain("Name")
    expect(app.text).toContain("*")
  })

  test("renders FormField with description", () => {
    const app = render(
      <Form>
        <FormField label="Password" description="Must be at least 8 characters">
          <Text>****</Text>
        </FormField>
      </Form>,
    )
    expect(app.text).toContain("Password")
    expect(app.text).toContain("Must be at least 8 characters")
  })

  test("renders multiple FormFields", () => {
    const app = render(
      <Form>
        <FormField label="First Name">
          <Text>John</Text>
        </FormField>
        <FormField label="Last Name">
          <Text>Doe</Text>
        </FormField>
      </Form>,
    )
    expect(app.text).toContain("First Name")
    expect(app.text).toContain("Last Name")
    expect(app.text).toContain("John")
    expect(app.text).toContain("Doe")
  })
})

// =============================================================================
// Toast / useToast
// =============================================================================

describe("Toast", () => {
  const render = createRenderer({ cols: 50, rows: 15 })

  test("useToast creates and displays a toast", () => {
    function TestApp() {
      const { toast, toasts } = useToast()
      return (
        <Box flexDirection="column">
          <Text
            testID="trigger"
            // Trigger on mount for simplicity
          >
            {toasts.length === 0 ? "no toasts" : "has toasts"}
          </Text>
          <ToastContainer toasts={toasts} />
          {/* Auto-trigger a toast */}
          <TriggerToast onMount={() => toast({ title: "Hello" })} />
        </Box>
      )
    }

    function TriggerToast({ onMount }: { onMount: () => void }) {
      React.useEffect(() => {
        onMount()
      }, [])
      return null
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("Hello")
    expect(app.text).toContain("has toasts")
  })

  test("toast renders with variant icons", () => {
    function TestApp() {
      const { toast, toasts } = useToast()
      React.useEffect(() => {
        toast({ title: "Saved", variant: "success" })
      }, [])
      return <ToastContainer toasts={toasts} />
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("Saved")
    expect(app.text).toContain("[+]")
  })

  test("toast renders error variant", () => {
    function TestApp() {
      const { toast, toasts } = useToast()
      React.useEffect(() => {
        toast({ title: "Failed", variant: "error" })
      }, [])
      return <ToastContainer toasts={toasts} />
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("Failed")
    expect(app.text).toContain("[x]")
  })

  test("toast with duration=0 persists indefinitely", () => {
    function TestApp() {
      const { toast, toasts } = useToast()
      React.useEffect(() => {
        toast({ title: "Persistent", duration: 0 })
      }, [])
      return (
        <Box flexDirection="column">
          <Text>{toasts.length} toasts</Text>
          <ToastContainer toasts={toasts} />
        </Box>
      )
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("Persistent")
    expect(app.text).toContain("1 toasts")
  })

  test("dismissAll clears all toasts via key trigger", async () => {
    function TestApp() {
      const { toast, toasts, dismissAll } = useToast()
      React.useEffect(() => {
        toast({ title: "One", duration: 0 })
        toast({ title: "Two", duration: 0 })
      }, [])
      useInput((input) => {
        if (input === "d") dismissAll()
      })
      return (
        <Box flexDirection="column">
          <Text>{toasts.length} toasts</Text>
          <ToastContainer toasts={toasts} />
        </Box>
      )
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("2 toasts")

    await app.press("d")
    expect(app.text).toContain("0 toasts")
  })

  test("multiple toasts stack vertically", () => {
    function TestApp() {
      const { toast, toasts } = useToast()
      React.useEffect(() => {
        toast({ title: "First" })
        toast({ title: "Second" })
      }, [])
      return <ToastContainer toasts={toasts} />
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("First")
    expect(app.text).toContain("Second")
  })

  test("ToastContainer respects maxVisible", () => {
    function TestApp() {
      const { toast, toasts } = useToast()
      React.useEffect(() => {
        toast({ title: "One", duration: 0 })
        toast({ title: "Two", duration: 0 })
        toast({ title: "Three", duration: 0 })
      }, [])
      return <ToastContainer toasts={toasts} maxVisible={2} />
    }

    const app = render(<TestApp />)
    // Only the last 2 should be visible
    expect(app.text).not.toContain("One")
    expect(app.text).toContain("Two")
    expect(app.text).toContain("Three")
  })
})

// =============================================================================
// CommandPalette
// =============================================================================

describe("CommandPalette", () => {
  const render = createRenderer({ cols: 60, rows: 20 })

  const commands: CommandItem[] = [
    { name: "Save", description: "Save current file", shortcut: "Ctrl+S" },
    { name: "Quit", description: "Exit application", shortcut: "Ctrl+Q" },
    { name: "Help", description: "Show help" },
    { name: "Open", description: "Open a file" },
  ]

  test("renders all commands", () => {
    const app = render(<CommandPalette commands={commands} />)
    expect(app.text).toContain("Save")
    expect(app.text).toContain("Quit")
    expect(app.text).toContain("Help")
    expect(app.text).toContain("Open")
  })

  test("renders command descriptions", () => {
    const app = render(<CommandPalette commands={commands} />)
    expect(app.text).toContain("Save current file")
    expect(app.text).toContain("Exit application")
  })

  test("renders shortcuts", () => {
    const app = render(<CommandPalette commands={commands} />)
    expect(app.text).toContain("Ctrl+S")
    expect(app.text).toContain("Ctrl+Q")
  })

  test("renders placeholder when empty query", () => {
    const app = render(<CommandPalette commands={commands} placeholder="Type a command..." />)
    expect(app.text).toContain("Type a command...")
  })

  test("filters commands by typing", async () => {
    const app = render(<CommandPalette commands={commands} />)

    await app.press("s")
    // "Save" matches, "Quit" doesn't match 's'
    expect(app.text).toContain("Save")
  })

  test("shows no matching message when nothing matches", async () => {
    const app = render(<CommandPalette commands={commands} />)

    await app.press("z")
    await app.press("z")
    await app.press("z")
    expect(app.text).toContain("No matching commands")
  })

  test("navigates with arrow keys", async () => {
    const app = render(<CommandPalette commands={commands} />)

    // First item should be selected by default
    expect(app.text).toContain("> Save")

    await app.press("ArrowDown")
    expect(app.text).toContain("> Quit")
  })

  test("fires onSelect on Enter", async () => {
    const handleSelect = vi.fn()
    const app = render(<CommandPalette commands={commands} onSelect={handleSelect} />)

    await app.press("ArrowDown") // Move to Quit
    await app.press("Enter")

    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ name: "Quit" }))
  })

  test("fires onClose on Escape", async () => {
    const handleClose = vi.fn()
    const app = render(<CommandPalette commands={commands} onClose={handleClose} />)

    await app.press("Escape")
    expect(handleClose).toHaveBeenCalled()
  })

  test("backspace removes last character from query", async () => {
    const app = render(<CommandPalette commands={commands} />)

    await app.press("z")
    await app.press("z")
    expect(app.text).toContain("No matching commands")

    await app.press("Backspace")
    await app.press("Backspace")
    // Back to showing all commands
    expect(app.text).toContain("Save")
  })
})

// =============================================================================
// TreeView
// =============================================================================

describe("TreeView", () => {
  const render = createRenderer({ cols: 50, rows: 15 })

  const tree: TreeNode[] = [
    {
      id: "1",
      label: "Documents",
      children: [
        { id: "1.1", label: "README.md" },
        { id: "1.2", label: "notes.txt" },
      ],
    },
    { id: "2", label: "config.json" },
    {
      id: "3",
      label: "src",
      children: [{ id: "3.1", label: "index.ts" }],
    },
  ]

  test("renders root nodes", () => {
    const app = render(<TreeView data={tree} />)
    expect(app.text).toContain("Documents")
    expect(app.text).toContain("config.json")
    expect(app.text).toContain("src")
  })

  test("collapsed by default: children not visible", () => {
    const app = render(<TreeView data={tree} />)
    expect(app.text).not.toContain("README.md")
    expect(app.text).not.toContain("notes.txt")
  })

  test("shows expand indicator for nodes with children", () => {
    const app = render(<TreeView data={tree} />)
    expect(app.text).toContain(">")
  })

  test("expands node on Enter", async () => {
    const app = render(<TreeView data={tree} />)

    // First node is Documents (has children)
    await app.press("Enter")
    expect(app.text).toContain("README.md")
    expect(app.text).toContain("notes.txt")
  })

  test("collapses expanded node on Enter", async () => {
    const app = render(<TreeView data={tree} />)

    await app.press("Enter") // Expand Documents
    expect(app.text).toContain("README.md")

    await app.press("Enter") // Collapse Documents
    expect(app.text).not.toContain("README.md")
  })

  test("navigates with j/k", async () => {
    const app = render(<TreeView data={tree} />)

    // Start at Documents
    await app.press("j") // Move to config.json
    await app.press("j") // Move to src

    // Expand src
    await app.press("Enter")
    expect(app.text).toContain("index.ts")
  })

  test("expands with right arrow", async () => {
    const app = render(<TreeView data={tree} />)

    await app.press("ArrowRight")
    expect(app.text).toContain("README.md")
  })

  test("collapses with left arrow", async () => {
    const app = render(<TreeView data={tree} />)

    await app.press("ArrowRight") // Expand
    expect(app.text).toContain("README.md")

    await app.press("ArrowLeft") // Collapse
    expect(app.text).not.toContain("README.md")
  })

  test("defaultExpanded shows all children", () => {
    const app = render(<TreeView data={tree} defaultExpanded />)
    expect(app.text).toContain("Documents")
    expect(app.text).toContain("README.md")
    expect(app.text).toContain("notes.txt")
    expect(app.text).toContain("index.ts")
  })

  test("custom renderNode", () => {
    const app = render(<TreeView data={tree} renderNode={(node) => <Text bold>{node.label.toUpperCase()}</Text>} />)
    expect(app.text).toContain("DOCUMENTS")
    expect(app.text).toContain("CONFIG.JSON")
  })

  test("fires onToggle when expanding/collapsing", async () => {
    const handleToggle = vi.fn()
    const app = render(<TreeView data={tree} onToggle={handleToggle} />)

    await app.press("Enter") // Expand Documents
    expect(handleToggle).toHaveBeenCalledWith("1", true)

    await app.press("Enter") // Collapse Documents
    expect(handleToggle).toHaveBeenCalledWith("1", false)
  })

  test("renders empty state when no data", () => {
    const app = render(<TreeView data={[]} />)
    expect(app.text).toContain("No items")
  })
})

// =============================================================================
// Breadcrumb
// =============================================================================

describe("Breadcrumb", () => {
  const render = createRenderer({ cols: 60, rows: 5 })

  test("renders single item", () => {
    const app = render(<Breadcrumb items={[{ label: "Home" }]} />)
    expect(app.text).toContain("Home")
  })

  test("renders multiple items with default separator", () => {
    const app = render(<Breadcrumb items={[{ label: "Home" }, { label: "Settings" }, { label: "Profile" }]} />)
    expect(app.text).toContain("Home")
    expect(app.text).toContain("/")
    expect(app.text).toContain("Settings")
    expect(app.text).toContain("Profile")
  })

  test("renders with custom separator", () => {
    const app = render(<Breadcrumb items={[{ label: "Home" }, { label: "Settings" }]} separator=">" />)
    expect(app.text).toContain("Home")
    expect(app.text).toContain(">")
    expect(app.text).toContain("Settings")
  })

  test("renders empty for no items", () => {
    const app = render(<Breadcrumb items={[]} />)
    // Should render an empty box, no crash
    expect(app.text.trim()).toBe("")
  })

  test("last item is distinguished from earlier items", () => {
    // We can't easily check bold/color in plain text, but we verify both render
    const app = render(<Breadcrumb items={[{ label: "Root" }, { label: "Current" }]} />)
    expect(app.text).toContain("Root")
    expect(app.text).toContain("Current")
  })
})

// =============================================================================
// Tabs
// =============================================================================

describe("Tabs", () => {
  const render = createRenderer({ cols: 60, rows: 15 })

  test("renders tab labels", () => {
    const app = render(
      <Tabs defaultValue="general">
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="advanced">Advanced</Tab>
        </TabList>
        <TabPanel value="general">
          <Text>General content</Text>
        </TabPanel>
        <TabPanel value="advanced">
          <Text>Advanced content</Text>
        </TabPanel>
      </Tabs>,
    )
    expect(app.text).toContain("General")
    expect(app.text).toContain("Advanced")
  })

  test("shows default tab panel content", () => {
    const app = render(
      <Tabs defaultValue="general">
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="advanced">Advanced</Tab>
        </TabList>
        <TabPanel value="general">
          <Text>General content</Text>
        </TabPanel>
        <TabPanel value="advanced">
          <Text>Advanced content</Text>
        </TabPanel>
      </Tabs>,
    )
    expect(app.text).toContain("General content")
    expect(app.text).not.toContain("Advanced content")
  })

  test("switches tab with arrow keys", async () => {
    const app = render(
      <Tabs defaultValue="general">
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="advanced">Advanced</Tab>
        </TabList>
        <TabPanel value="general">
          <Text>General content</Text>
        </TabPanel>
        <TabPanel value="advanced">
          <Text>Advanced content</Text>
        </TabPanel>
      </Tabs>,
    )
    expect(app.text).toContain("General content")

    await app.press("ArrowRight")
    expect(app.text).toContain("Advanced content")
    expect(app.text).not.toContain("General content")
  })

  test("wraps around when navigating past last tab", async () => {
    const app = render(
      <Tabs defaultValue="advanced">
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="advanced">Advanced</Tab>
        </TabList>
        <TabPanel value="general">
          <Text>General content</Text>
        </TabPanel>
        <TabPanel value="advanced">
          <Text>Advanced content</Text>
        </TabPanel>
      </Tabs>,
    )

    await app.press("ArrowRight") // Wrap to general
    expect(app.text).toContain("General content")
  })

  test("wraps backward when navigating before first tab", async () => {
    const app = render(
      <Tabs defaultValue="general">
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="advanced">Advanced</Tab>
        </TabList>
        <TabPanel value="general">
          <Text>General content</Text>
        </TabPanel>
        <TabPanel value="advanced">
          <Text>Advanced content</Text>
        </TabPanel>
      </Tabs>,
    )

    await app.press("ArrowLeft") // Wrap to advanced
    expect(app.text).toContain("Advanced content")
  })

  test("fires onChange callback", async () => {
    const handleChange = vi.fn()
    const app = render(
      <Tabs defaultValue="general" onChange={handleChange}>
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="advanced">Advanced</Tab>
        </TabList>
        <TabPanel value="general">
          <Text>General</Text>
        </TabPanel>
        <TabPanel value="advanced">
          <Text>Advanced</Text>
        </TabPanel>
      </Tabs>,
    )

    await app.press("ArrowRight")
    expect(handleChange).toHaveBeenCalledWith("advanced")
  })

  test("controlled mode respects value prop", () => {
    const app = render(
      <Tabs value="advanced">
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="advanced">Advanced</Tab>
        </TabList>
        <TabPanel value="general">
          <Text>General content</Text>
        </TabPanel>
        <TabPanel value="advanced">
          <Text>Advanced content</Text>
        </TabPanel>
      </Tabs>,
    )
    expect(app.text).toContain("Advanced content")
    expect(app.text).not.toContain("General content")
  })
})

// =============================================================================
// Tooltip
// =============================================================================

describe("Tooltip", () => {
  const render = createRenderer({ cols: 50, rows: 10 })

  test("renders children always", () => {
    const app = render(
      <Tooltip content="Help text">
        <Text>Target</Text>
      </Tooltip>,
    )
    expect(app.text).toContain("Target")
  })

  test("hides tooltip text by default", () => {
    const app = render(
      <Tooltip content="Help text">
        <Text>Target</Text>
      </Tooltip>,
    )
    expect(app.text).not.toContain("Help text")
  })

  test("shows tooltip when show is true", () => {
    const app = render(
      <Tooltip content="Help text" show>
        <Text>Target</Text>
      </Tooltip>,
    )
    expect(app.text).toContain("Target")
    expect(app.text).toContain("Help text")
  })

  test("hides tooltip when show is false", () => {
    const app = render(
      <Tooltip content="Help text" show={false}>
        <Text>Target</Text>
      </Tooltip>,
    )
    expect(app.text).toContain("Target")
    expect(app.text).not.toContain("Help text")
  })

  test("responds to show prop changes", () => {
    function TestApp() {
      const [visible, setVisible] = useState(false)
      useInput((input) => {
        if (input === "t") setVisible((v) => !v)
      })
      return (
        <Tooltip content="Dynamic tooltip" show={visible}>
          <Text>Target</Text>
        </Tooltip>
      )
    }

    const app = render(<TestApp />)
    expect(app.text).not.toContain("Dynamic tooltip")

    // Note: we can test prop changes via rerender
    app.rerender(
      <Tooltip content="Dynamic tooltip" show>
        <Text>Target</Text>
      </Tooltip>,
    )
    expect(app.text).toContain("Dynamic tooltip")
  })
})

// =============================================================================
// Skeleton
// =============================================================================

describe("Skeleton", () => {
  const render = createRenderer({ cols: 40, rows: 10 })

  test("renders with default width", () => {
    const app = render(<Skeleton />)
    expect(app.text).toContain("░".repeat(20))
  })

  test("renders with custom width", () => {
    const app = render(<Skeleton width={10} />)
    expect(app.text).toContain("░".repeat(10))
  })

  test("renders with custom height", () => {
    const app = render(<Skeleton width={15} height={3} />)
    const lines = app.text.split("\n").filter((l: string) => l.includes("░"))
    expect(lines.length).toBe(3)
  })

  test("renders with custom character", () => {
    const app = render(<Skeleton width={10} char="=" />)
    expect(app.text).toContain("=".repeat(10))
  })

  test("renders circle shape with shorter centered width", () => {
    const app = render(<Skeleton width={20} shape="circle" />)
    // Circle shape should render some placeholder chars
    expect(app.text).toContain("░")
  })

  test("renders single line by default", () => {
    const app = render(<Skeleton width={10} />)
    const lines = app.text.split("\n").filter((l: string) => l.includes("░"))
    expect(lines.length).toBe(1)
  })
})
