/**
 * Tabs Component
 *
 * Tab bar with keyboard navigation and panel content switching.
 * Uses compound component pattern: Tabs > TabList + TabPanel.
 *
 * Usage:
 * ```tsx
 * <Tabs defaultValue="general">
 *   <TabList>
 *     <Tab value="general">General</Tab>
 *     <Tab value="advanced">Advanced</Tab>
 *     <Tab value="about">About</Tab>
 *   </TabList>
 *   <TabPanel value="general">
 *     <Text>General settings...</Text>
 *   </TabPanel>
 *   <TabPanel value="advanced">
 *     <Text>Advanced settings...</Text>
 *   </TabPanel>
 *   <TabPanel value="about">
 *     <Text>About this app...</Text>
 *   </TabPanel>
 * </Tabs>
 * ```
 */
import React, { createContext, useCallback, useContext, useState } from "react"
import { useInput } from "../../hooks/useInput"
import { useInteractionTreatment } from "../../hooks/useInteractionTreatment"
import { Box, type BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"

// =============================================================================
// Types
// =============================================================================

export type TabsVariant = "default" | "filled"

export interface TabsProps {
  /** Default active tab value (uncontrolled) */
  defaultValue?: string
  /** Controlled active tab value */
  value?: string
  /** Called when the active tab changes */
  onChange?: (value: string) => void
  /** Whether tab input is active (default: true) */
  isActive?: boolean
  /** Visual variant of the tab strip (default: "default") */
  variant?: TabsVariant
  /** Tab children (TabList + TabPanel components) */
  children: React.ReactNode
}

export interface TabListProps {
  /** Tab children */
  children: React.ReactNode
  /** Horizontal alignment of the tab labels inside the list. */
  justifyContent?: BoxProps["justifyContent"]
  /**
   * Wrap behavior when the tab labels exceed the list width. Defaults to
   * `"nowrap"` (single row; overflowing tabs clip). Pass `"wrap"` so a tab bar
   * that is too wide for a narrow container flows onto additional rows instead
   * of clipping the trailing tabs off-screen.
   */
  flexWrap?: BoxProps["flexWrap"]
  /** Gap between tabs. Defaults to 1 for "filled", 0 for "default". */
  gap?: number
  /** Whether to render a bottom border under the tab list. Defaults to false for "filled", true for "default". */
  borderBottom?: boolean
  /** Visual variant override for this TabList. Defaults to Tabs context variant, or "default". */
  variant?: TabsVariant
}

export interface TabProps {
  /** Unique tab identifier */
  value: string
  /** Tab label children */
  children: React.ReactNode
  /** Visual variant override for this Tab. Defaults to TabList / Tabs context variant. */
  variant?: TabsVariant
}

export interface TabPanelProps {
  /** Tab value this panel corresponds to */
  value: string
  /** Panel content */
  children: React.ReactNode
}

// =============================================================================
// Context
// =============================================================================

interface TabsContextValue {
  activeValue: string
  setActiveValue: (value: string) => void
  tabValues: string[]
  registerTab: (value: string) => void
  variant: TabsVariant
}

const TabsContext = createContext<TabsContextValue>({
  activeValue: "",
  setActiveValue: () => {},
  tabValues: [],
  registerTab: () => {},
  variant: "default",
})

function useTabsContext(): TabsContextValue {
  return useContext(TabsContext)
}

// =============================================================================
// Components
// =============================================================================

/**
 * Root tabs container. Provides context for TabList, Tab, and TabPanel.
 *
 * Supports controlled (`value` + `onChange`) and uncontrolled (`defaultValue`) modes.
 * Navigate tabs with Left/Right arrow keys when the TabList is active.
 */
export function Tabs({
  defaultValue,
  value: controlledValue,
  onChange,
  isActive = true,
  variant = "default",
  children,
}: TabsProps): React.ReactElement {
  const isControlled = controlledValue !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "")
  const [tabValues, setTabValues] = useState<string[]>([])

  const activeValue = isControlled ? controlledValue : uncontrolledValue

  const setActiveValue = useCallback(
    (val: string) => {
      if (!isControlled) setUncontrolledValue(val)
      onChange?.(val)
    },
    [isControlled, onChange],
  )

  const registerTab = useCallback((val: string) => {
    setTabValues((prev) => (prev.includes(val) ? prev : [...prev, val]))
  }, [])

  // Keyboard navigation between tabs
  useInput(
    (_input, key) => {
      if (tabValues.length === 0) return

      const currentIdx = tabValues.indexOf(activeValue)
      if (currentIdx < 0) return

      if (key.rightArrow || _input === "l") {
        const next = (currentIdx + 1) % tabValues.length
        const nextValue = tabValues[next]
        if (nextValue === undefined) throw new Error("Tabs navigation resolved no next tab")
        setActiveValue(nextValue)
        return
      }

      if (key.leftArrow || _input === "h") {
        const next = (currentIdx - 1 + tabValues.length) % tabValues.length
        const nextValue = tabValues[next]
        if (nextValue === undefined) throw new Error("Tabs navigation resolved no previous tab")
        setActiveValue(nextValue)
        return
      }
    },
    { isActive },
  )

  return (
    <TabsContext.Provider value={{ activeValue, setActiveValue, tabValues, registerTab, variant }}>
      <Box flexDirection="column" flexGrow={1} minHeight={0}>
        {children}
      </Box>
    </TabsContext.Provider>
  )
}

/**
 * Horizontal tab bar container.
 *
 * Renders Tab children in a row.
 * Default variant: compact segmented row with borderBottom and gap 0.
 * Filled variant: tabs with background fills and gap 1 between them.
 */
export function TabList({
  children,
  justifyContent,
  flexWrap,
  gap: propGap,
  borderBottom: propBorderBottom,
  variant: propVariant,
}: TabListProps): React.ReactElement {
  const context = useTabsContext()
  const variant = propVariant ?? context.variant ?? "default"
  const isFilled = variant === "filled"
  const gap = propGap ?? (isFilled ? 1 : 0)
  const borderBottom = propBorderBottom ?? !isFilled

  const content = (
    <Box
      flexDirection="row"
      flexWrap={flexWrap}
      gap={gap}
      width="100%"
      borderBottom={borderBottom}
      borderColor="$border-default"
      justifyContent={justifyContent}
    >
      {children}
    </Box>
  )

  if (propVariant !== undefined && propVariant !== context.variant) {
    return <TabsContext.Provider value={{ ...context, variant }}>{content}</TabsContext.Provider>
  }
  return content
}

/**
 * Individual tab trigger.
 *
 * Default variant: tab label with active/inactive styling. Tabs do not use a
 * filled background; the active tab is the selected text color.
 *
 * Filled variant: tab label with its own filled background box, 1-cell horizontal
 * padding around each tab, and a distinct selected background color.
 */
export function Tab({ value, children, variant: propVariant }: TabProps): React.ReactElement {
  const { activeValue, setActiveValue, registerTab, variant: contextVariant } = useTabsContext()
  const variant = propVariant ?? contextVariant ?? "default"
  const isFilled = variant === "filled"
  const isActive = activeValue === value

  const interaction = useInteractionTreatment(
    "control",
    isFilled ? "tabFilled" : "warningText",
    true,
    {
      selected: isActive,
    },
  )

  // Register this tab's value for keyboard navigation
  React.useEffect(() => {
    registerTab(value)
  }, [value, registerTab])

  return (
    <Box
      mouseCursor="pointer"
      onMouseDown={() => setActiveValue(value)}
      onMouseEnter={interaction.onMouseEnter}
      onMouseLeave={interaction.onMouseLeave}
      paddingX={isFilled ? 1 : undefined}
      paddingRight={isFilled ? undefined : 2}
      backgroundColor={isFilled ? interaction.treatment.backgroundColor : undefined}
    >
      <Text color={interaction.treatment.color} bold>
        {children}
      </Text>
    </Box>
  )
}

/**
 * Tab panel content container.
 *
 * Only renders its children when the corresponding tab is active.
 */
export function TabPanel({ value, children }: TabPanelProps): React.ReactElement | null {
  const { activeValue } = useTabsContext()

  if (activeValue !== value) return null

  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      {children}
    </Box>
  )
}
