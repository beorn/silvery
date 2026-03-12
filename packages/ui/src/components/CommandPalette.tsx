/**
 * CommandPalette Component
 *
 * A filterable command list with keyboard navigation. Takes an array of
 * commands with name, description, and optional shortcut. Users can type
 * to filter and navigate with arrow keys / j/k.
 *
 * Usage:
 * ```tsx
 * const commands = [
 *   { name: "Save", description: "Save current file", shortcut: "Ctrl+S" },
 *   { name: "Quit", description: "Exit application", shortcut: "Ctrl+Q" },
 *   { name: "Help", description: "Show help" },
 * ]
 *
 * <CommandPalette
 *   commands={commands}
 *   onSelect={(cmd) => exec(cmd.name)}
 *   placeholder="Type a command..."
 * />
 * ```
 */
import React, { useCallback, useMemo, useState } from "react"
import { useInput } from "@silvery/react/hooks/useInput"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface CommandItem {
  /** Command display name */
  name: string
  /** Command description */
  description?: string
  /** Keyboard shortcut hint */
  shortcut?: string
}

export interface CommandPaletteProps {
  /** Available commands */
  commands: CommandItem[]
  /** Called when a command is selected (Enter) */
  onSelect?: (command: CommandItem) => void
  /** Called when the palette is dismissed (Escape) */
  onClose?: () => void
  /** Placeholder text for the filter input (default: "Search commands...") */
  placeholder?: string
  /** Max visible results (default: 10) */
  maxVisible?: number
  /** Whether this component captures input (default: true) */
  isActive?: boolean
}

// =============================================================================
// Helpers
// =============================================================================

/** Case-insensitive fuzzy match: all query characters appear in order. */
function fuzzyMatch(query: string, text: string): boolean {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

// =============================================================================
// Component
// =============================================================================

/**
 * Filterable command palette with keyboard navigation.
 *
 * Type to filter commands by name, navigate with Up/Down or j/k,
 * confirm with Enter, dismiss with Escape.
 */
export function CommandPalette({
  commands,
  onSelect,
  onClose,
  placeholder = "Search commands...",
  maxVisible = 10,
  isActive = true,
}: CommandPaletteProps): React.ReactElement {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filtered = useMemo(() => {
    if (!query) return commands
    return commands.filter(
      (cmd) =>
        fuzzyMatch(query, cmd.name) || (cmd.description && fuzzyMatch(query, cmd.description)),
    )
  }, [commands, query])

  const visible = filtered.slice(0, maxVisible)

  const clampIndex = useCallback(
    (idx: number) => Math.max(0, Math.min(idx, filtered.length - 1)),
    [filtered.length],
  )

  useInput(
    (input, key) => {
      // Navigation
      if (key.upArrow) {
        setSelectedIndex((prev) => clampIndex(prev - 1))
        return
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => clampIndex(prev + 1))
        return
      }

      // Select
      if (key.return) {
        const cmd = filtered[selectedIndex]
        if (cmd) onSelect?.(cmd)
        return
      }

      // Dismiss
      if (key.escape) {
        onClose?.()
        return
      }

      // Backspace
      if (key.backspace || key.delete) {
        setQuery((prev) => {
          const next = prev.slice(0, -1)
          setSelectedIndex(0)
          return next
        })
        return
      }

      // Printable character
      if (input && input >= " " && !key.ctrl && !key.meta) {
        setQuery((prev) => {
          setSelectedIndex(0)
          return prev + input
        })
      }
    },
    { isActive },
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="$border"
      backgroundColor="$surface-bg"
      paddingX={1}
    >
      {/* Search input */}
      <Box>
        <Text color="$primary" bold>
          {">"}{" "}
        </Text>
        <Text>{query || <Text color="$disabledfg">{placeholder}</Text>}</Text>
      </Box>
      <Box>
        <Text color="$border">{"─".repeat(30)}</Text>
      </Box>
      {/* Results */}
      {visible.length === 0 ? (
        <Text color="$disabledfg">No matching commands</Text>
      ) : (
        visible.map((cmd, i) => {
          const isSelected = i === selectedIndex
          return (
            <Box key={cmd.name} gap={1}>
              <Text inverse={isSelected} color={isSelected ? "$primary" : "$fg"}>
                {isSelected ? ">" : " "} {cmd.name}
              </Text>
              {cmd.description && <Text color="$muted">{cmd.description}</Text>}
              {cmd.shortcut && (
                <Text color="$disabledfg" bold>
                  {cmd.shortcut}
                </Text>
              )}
            </Box>
          )
        })
      )}
      {/* Status */}
      {filtered.length > maxVisible && (
        <Text color="$disabledfg">{filtered.length - maxVisible} more...</Text>
      )}
    </Box>
  )
}
