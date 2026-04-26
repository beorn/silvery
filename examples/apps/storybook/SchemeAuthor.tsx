/**
 * SchemeAuthor — interactive 22-color scheme input grid.
 *
 * Feature 5/5 of the full storybook. Replaces the middle pane when toggled
 * via `a` from the bottom bar. Users can:
 *
 *   • Seed from the currently selected scheme (default)
 *   • Navigate slots with j/k (up/down) and h/l (same-column left/right)
 *   • Enter → open a readline-style TextInput on the current slot
 *   • Type a new hex (`#rrggbb` or `#rgb`) — Escape cancels, Enter commits
 *   • Watch the slot's derived Theme re-render live once the hex validates
 *   • `x` exports the scheme as `ColorScheme` JSON (stderr log + OSC52 copy)
 *
 * This pane owns its own local `useInput` (via the mounted TextInput) only
 * when editing. When not editing, navigation keys flow from App.tsx.
 *
 * `onUpdate(scheme)` is the live-preview bridge: App re-derives the Theme
 * whenever a slot commits, re-theming the left + right panes so the author
 * sees the full chain (22 raw colors → 40 flat tokens → every component).
 */

import React, { useCallback, useMemo, useState } from "react"
import { Box, Text, Muted, Divider, Strong, Small, TextInput, useInput } from "silvery"
import type { ColorScheme } from "@silvery/ansi"

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** All 22 slots from ColorScheme in a display-friendly order. */
export const SLOT_KEYS = [
  "foreground",
  "background",
  "cursorColor",
  "cursorText",
  "selectionForeground",
  "selectionBackground",
  "black",
  "brightBlack",
  "red",
  "brightRed",
  "green",
  "brightGreen",
  "yellow",
  "brightYellow",
  "blue",
  "brightBlue",
  "magenta",
  "brightMagenta",
  "cyan",
  "brightCyan",
  "white",
  "brightWhite",
] as const satisfies readonly (keyof ColorScheme)[]

export type SlotKey = (typeof SLOT_KEYS)[number]

/** Minimal OSC 52 clipboard copy — works in most modern terminals. */
function osc52Copy(text: string): void {
  try {
    const b64 = Buffer.from(text, "utf8").toString("base64")
    process.stdout.write(`\x1b]52;c;${b64}\x07`)
  } catch {
    // Non-Bun runtimes don't expose Buffer this way; fallback: log.
    process.stderr.write(`(clipboard unavailable) ${text}\n`)
  }
}

/** Normalize a hex to `#RRGGBB` uppercase; null if invalid. */
function normalizeHex(raw: string): string | null {
  const s = raw.trim()
  if (!HEX.test(s)) return null
  if (s.length === 4) {
    const r = s[1]!,
      g = s[2]!,
      b = s[3]!
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return s.toUpperCase()
}

function HexSlot({
  slotKey,
  value,
  selected,
  editing,
  onCommit,
  onCancel,
}: {
  slotKey: SlotKey
  value: string
  selected: boolean
  editing: boolean
  onCommit: (hex: string) => void
  onCancel: () => void
}): React.ReactElement {
  const [buffer, setBuffer] = useState(value)
  // Reset buffer to the latest slot value each time editing re-engages.
  React.useEffect(() => {
    if (editing) setBuffer(value)
  }, [editing, value])

  const valid = HEX.test(buffer.trim())
  const marker = editing ? "✎" : selected ? "▸" : " "
  const labelColor = editing || selected ? "$fg-accent" : undefined
  const label = slotKey.padEnd(20)

  // Cancel on Escape — driven by useInput at isActive=editing.
  useInput(
    (_input, key) => {
      if (key.escape) onCancel()
    },
    { isActive: editing },
  )

  return (
    <Box gap={1}>
      <Text color={editing || selected ? "$fg-accent" : "$fg-muted"}>{marker}</Text>
      <Text color={valid ? value : "$fg-error"}>██</Text>
      <Text color={labelColor} bold={editing || selected}>
        {label}
      </Text>
      {editing ? (
        <Box
          borderStyle="single"
          borderColor={valid ? "$fg-accent" : "$fg-error"}
          paddingX={1}
          width={12}
        >
          <TextInput
            value={buffer}
            onChange={setBuffer}
            onSubmit={(val) => {
              const norm = normalizeHex(val)
              if (norm) onCommit(norm)
              // invalid input on Enter: keep editing, no commit
            }}
            isActive
            placeholder="#rrggbb"
          />
        </Box>
      ) : (
        <Text>{value}</Text>
      )}
      {editing && !valid ? (
        <Small>
          <Text color="$fg-error">invalid</Text>
        </Small>
      ) : null}
    </Box>
  )
}

export interface SchemeAuthorProps {
  /** Starting scheme (usually the currently selected built-in). */
  seed: ColorScheme
  schemeName: string
  /** Called whenever a slot commits — App re-derives and re-themes. */
  onUpdate: (scheme: ColorScheme) => void
}

export function SchemeAuthor({
  seed,
  schemeName,
  onUpdate,
}: SchemeAuthorProps): React.ReactElement {
  // Local working copy — commits bubble up via onUpdate, but the authoring
  // state lives here so the user can iterate on slots without losing edits.
  const [draft, setDraft] = useState<ColorScheme>(seed)
  const [cursor, setCursor] = useState(0)
  const [editing, setEditing] = useState(false)

  // Reseed whenever the external scheme name changes (user cycles left pane
  // selection while the author pane is open).
  const seedKey = schemeName
  React.useEffect(() => {
    setDraft(seed)
    setCursor(0)
    setEditing(false)
  }, [seedKey, seed])

  const commit = useCallback(
    (hex: string) => {
      const next: ColorScheme = { ...draft, [SLOT_KEYS[cursor]!]: hex }
      setDraft(next)
      setEditing(false)
      onUpdate(next)
    },
    [cursor, draft, onUpdate],
  )

  const cancel = useCallback(() => setEditing(false), [])

  const step = useCallback((delta: number) => {
    setCursor((c) => {
      const next = c + delta
      if (next < 0) return 0
      if (next >= SLOT_KEYS.length) return SLOT_KEYS.length - 1
      return next
    })
  }, [])

  // Navigation + edit triggers — only active when not editing; editing mode
  // is handled by the HexSlot's own TextInput (which owns its own input).
  useInput(
    (input, key) => {
      if (input === "j" || key.downArrow) return step(1)
      if (input === "k" || key.upArrow) return step(-1)
      // h/l flip columns between the fg/bg stack and the ansi 16. Map visually.
      if (input === "l" || key.rightArrow) return step(2)
      if (input === "h" || key.leftArrow) return step(-2)
      if (input === "g") return setCursor(0)
      if (input === "G") return setCursor(SLOT_KEYS.length - 1)
      if (key.return) return setEditing(true)
      if (input === "x") {
        osc52Copy(JSON.stringify(draft, null, 2))
      }
    },
    { isActive: !editing },
  )

  // Compute pairs-of-two for a two-column grid (slot left | slot right).
  const rows = useMemo(() => {
    const pairs: [number, number | null][] = []
    for (let i = 0; i < SLOT_KEYS.length; i += 2) {
      pairs.push([i, i + 1 < SLOT_KEYS.length ? i + 1 : null])
    }
    return pairs
  }, [])

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="$fg-accent"
      overflow="scroll"
      overflowIndicator
      userSelect="contain"
    >
      <Box paddingX={1} gap={1}>
        <Text bold color="$fg-accent">
          SCHEME AUTHOR
        </Text>
        <Muted>·</Muted>
        <Muted>seeded from</Muted>
        <Text color="$fg-info">{schemeName}</Text>
        <Muted>·</Muted>
        <Small>
          <Muted>
            <Text color="$fg-accent">Enter</Text> edit · <Text color="$fg-accent">Esc</Text> cancel
            · <Text color="$fg-accent">x</Text> copy JSON
          </Muted>
        </Small>
      </Box>
      <Divider />
      <Box flexDirection="column" paddingX={1}>
        <Small>
          <Muted>
            Type hex (`#rrggbb` / `#rgb`). Enter commits, the full Sterling Theme re-derives, and
            the rest of the storybook re-themes live. `x` exports the 22 raw colors as ColorScheme
            JSON and copies to clipboard (OSC 52).
          </Muted>
        </Small>
        <Divider />
        {rows.map(([iL, iR]) => (
          <Box key={iL} gap={2}>
            <Box flexGrow={1}>
              <HexSlot
                slotKey={SLOT_KEYS[iL]!}
                value={draft[SLOT_KEYS[iL]!] ?? "#000000"}
                selected={cursor === iL}
                editing={editing && cursor === iL}
                onCommit={commit}
                onCancel={cancel}
              />
            </Box>
            {iR !== null ? (
              <Box flexGrow={1}>
                <HexSlot
                  slotKey={SLOT_KEYS[iR]!}
                  value={draft[SLOT_KEYS[iR]!] ?? "#000000"}
                  selected={cursor === iR}
                  editing={editing && cursor === iR}
                  onCommit={commit}
                  onCancel={cancel}
                />
              </Box>
            ) : (
              <Box flexGrow={1} />
            )}
          </Box>
        ))}

        <Box marginTop={1} flexDirection="column" gap={0}>
          <Strong>Live derivation chain</Strong>
          <Small>
            <Muted>
              22 raw colors (above) → sterling.deriveFromScheme() → 40 flat tokens + role objects →
              every component in COMPONENTS / TOKENS / CONTRAST panes re-themed. The derivation runs
              on every commit; open the TOKENS pane to inspect the output, CONTRAST to audit WCAG
              compliance.
            </Muted>
          </Small>
        </Box>
      </Box>
    </Box>
  )
}
