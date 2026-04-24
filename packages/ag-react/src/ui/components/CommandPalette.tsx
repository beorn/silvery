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
import { useInput } from "../../hooks/useInput"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"

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

      // Printable character — use key.text to preserve the actually-typed
      // character (Shift+; → ':', Shift+3 → '#'). `input` is the normalized
      // base key used for keybinding resolution. See keys.ts:1120-1127.
      const char = key.text ?? input
      if (char && char >= " " && !key.ctrl && !key.meta) {
        setQuery((prev) => {
          setSelectedIndex(0)
          return prev + char
        })
      }
    },
    { isActive },
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="$border-default"
      backgroundColor="$bg-surface-raised"
      paddingX={1}
    >
      {/* Search input */}
      <Box>
        <Text color="$fg-accent" bold>
          {">"}{" "}
        </Text>
        <Text>{query || <Text color="$fg-muted">{placeholder}</Text>}</Text>
      </Box>
      <Box>
        <Text color="$border-default">{"─".repeat(30)}</Text>
      </Box>
      {/* Results */}
      {visible.length === 0 ? (
        <Text color="$fg-muted">No matching commands</Text>
      ) : (
        visible.map((cmd, i) => {
          const isSelected = i === selectedIndex
          return (
            <Box key={cmd.name} gap={1}>
              <Text inverse={isSelected} color={isSelected ? "$fg-accent" : "$fg"}>
                {isSelected ? ">" : " "} {cmd.name}
              </Text>
              {cmd.description && <Text color="$fg-muted">{cmd.description}</Text>}
              {cmd.shortcut && (
                <Text color="$fg-muted" bold>
                  {cmd.shortcut}
                </Text>
              )}
            </Box>
          )
        })
      )}
      {/* Status */}
      {filtered.length > maxVisible && (
        <Text color="$fg-muted">{filtered.length - maxVisible} more...</Text>
      )}
    </Box>
  )
}
