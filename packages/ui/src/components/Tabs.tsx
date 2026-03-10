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
import React, { createContext, useCallback, useContext, useState } from "react";
import { useInput } from "@silvery/react/hooks/useInput";
import { Box } from "@silvery/react/components/Box";
import { Text } from "@silvery/react/components/Text";

// =============================================================================
// Types
// =============================================================================

export interface TabsProps {
  /** Default active tab value (uncontrolled) */
  defaultValue?: string;
  /** Controlled active tab value */
  value?: string;
  /** Called when the active tab changes */
  onChange?: (value: string) => void;
  /** Whether tab input is active (default: true) */
  isActive?: boolean;
  /** Tab children (TabList + TabPanel components) */
  children: React.ReactNode;
}

export interface TabListProps {
  /** Tab children */
  children: React.ReactNode;
}

export interface TabProps {
  /** Unique tab identifier */
  value: string;
  /** Tab label children */
  children: React.ReactNode;
}

export interface TabPanelProps {
  /** Tab value this panel corresponds to */
  value: string;
  /** Panel content */
  children: React.ReactNode;
}

// =============================================================================
// Context
// =============================================================================

interface TabsContextValue {
  activeValue: string;
  setActiveValue: (value: string) => void;
  tabValues: string[];
  registerTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue>({
  activeValue: "",
  setActiveValue: () => {},
  tabValues: [],
  registerTab: () => {},
});

function useTabsContext(): TabsContextValue {
  return useContext(TabsContext);
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
  children,
}: TabsProps): React.ReactElement {
  const isControlled = controlledValue !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const [tabValues, setTabValues] = useState<string[]>([]);

  const activeValue = isControlled ? controlledValue : uncontrolledValue;

  const setActiveValue = useCallback(
    (val: string) => {
      if (!isControlled) setUncontrolledValue(val);
      onChange?.(val);
    },
    [isControlled, onChange],
  );

  const registerTab = useCallback((val: string) => {
    setTabValues((prev) => (prev.includes(val) ? prev : [...prev, val]));
  }, []);

  // Keyboard navigation between tabs
  useInput(
    (_input, key) => {
      if (tabValues.length === 0) return;

      const currentIdx = tabValues.indexOf(activeValue);
      if (currentIdx < 0) return;

      if (key.rightArrow || _input === "l") {
        const next = (currentIdx + 1) % tabValues.length;
        setActiveValue(tabValues[next]!);
        return;
      }

      if (key.leftArrow || _input === "h") {
        const next = (currentIdx - 1 + tabValues.length) % tabValues.length;
        setActiveValue(tabValues[next]!);
        return;
      }
    },
    { isActive },
  );

  return (
    <TabsContext.Provider value={{ activeValue, setActiveValue, tabValues, registerTab }}>
      <Box flexDirection="column">{children}</Box>
    </TabsContext.Provider>
  );
}

/**
 * Horizontal tab bar container.
 *
 * Renders Tab children in a horizontal row with gap spacing.
 */
export function TabList({ children }: TabListProps): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} borderBottom borderColor="$border">
      {children}
    </Box>
  );
}

/**
 * Individual tab trigger.
 *
 * Renders the tab label with active/inactive styling. Active tab is bold
 * with `$primary` color; inactive tabs use `$mutedfg`.
 */
export function Tab({ value, children }: TabProps): React.ReactElement {
  const { activeValue, registerTab } = useTabsContext();
  const isActive = activeValue === value;

  // Register this tab's value for keyboard navigation
  React.useEffect(() => {
    registerTab(value);
  }, [value, registerTab]);

  return (
    <Box>
      <Text color={isActive ? "$primary" : "$mutedfg"} bold={isActive} underline={isActive}>
        {children}
      </Text>
    </Box>
  );
}

/**
 * Tab panel content container.
 *
 * Only renders its children when the corresponding tab is active.
 */
export function TabPanel({ value, children }: TabPanelProps): React.ReactElement | null {
  const { activeValue } = useTabsContext();

  if (activeValue !== value) return null;

  return <Box flexDirection="column">{children}</Box>;
}
