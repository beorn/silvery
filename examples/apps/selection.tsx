/**
 * Selection Model Demo
 *
 * Demonstrates the silvery selection model from docs/design/ui/selection.md:
 * - Node selection (click, j/k)
 * - Multi-select (Cmd+click toggle, Shift+j/k extend)
 * - Text editing (Enter → edit, Escape → node mode)
 * - Mode ladder: text ──Esc──► node ──Esc──► board
 * - Live status bar showing Selection state
 *
 * Run: bun examples/apps/selection.tsx
 */

import React, { useState, useCallback } from "react"
import { Box, Text, type SilveryMouseEvent } from "silvery"
import { run, useInput, type Key } from "silvery/runtime"

// ============================================================================
// Selection Model (pure functions — the whole design doc in ~60 lines)
// ============================================================================

type ID = string

type TextPoint = { nodeId: ID; offset: number }

type Selection = {
  nodes: readonly [ID, ...ID[]]
  text?: readonly [TextPoint] | readonly [TextPoint, TextPoint]
}

const S = {
  // Read
  cursor: (sel: Selection): ID => sel.nodes[0],
  anchor: (sel: Selection): ID => sel.nodes.at(-1)!,
  ids: (sel: Selection): ReadonlySet<ID> => new Set(sel.nodes),
  includes: (sel: Selection, id: ID): boolean => sel.nodes.includes(id),
  isEditing: (sel: Selection): boolean => !!sel.text,
  inputMode: (sel: Selection | undefined): "board" | "node" | "text" =>
    !sel ? "board" : sel.text ? "text" : "node",

  // Node mutations (clear text)
  select: (id: ID): Selection => ({ nodes: [id] }),

  toggle(sel: Selection, id: ID): Selection | undefined {
    if (sel.nodes.includes(id)) {
      const rest = sel.nodes.filter((n) => n !== id) as unknown as [ID, ...ID[]]
      return rest.length > 0 ? { nodes: rest } : undefined
    }
    return { nodes: [id, ...sel.nodes] }
  },

  extend(sel: Selection, id: ID, allIds: readonly ID[]): Selection {
    const anchorIdx = allIds.indexOf(S.anchor(sel))
    const targetIdx = allIds.indexOf(id)
    if (anchorIdx < 0 || targetIdx < 0) return sel
    const lo = Math.min(anchorIdx, targetIdx)
    const hi = Math.max(anchorIdx, targetIdx)
    const range = allIds.slice(lo, hi + 1)
    // cursor first, anchor last
    const nodes =
      targetIdx <= anchorIdx ? (range as [ID, ...ID[]]) : ([...range].reverse() as [ID, ...ID[]])
    return { nodes }
  },

  areaSelect(
    _sel: Selection | undefined,
    hitIds: readonly ID[],
    mode: "replace" | "xor",
  ): Selection | undefined {
    if (mode === "replace") {
      return hitIds.length > 0 ? { nodes: hitIds as [ID, ...ID[]] } : undefined
    }
    // XOR: toggle each hit against current
    let result = _sel
    for (const id of hitIds) {
      result = result ? S.toggle(result, id) : S.select(id)
    }
    return result
  },

  clear: (): undefined => undefined,

  collapseToCursor(sel: Selection): Selection {
    return { nodes: [sel.nodes[0]] }
  },

  // Text mutations (don't touch nodes)
  edit(sel: Selection, offset: number): Selection {
    return { ...sel, text: [{ nodeId: sel.nodes[0], offset }] }
  },

  stopEditing(sel: Selection): Selection {
    const { text: _, ...rest } = sel
    return rest as Selection
  },
}

// ============================================================================
// Demo Data
// ============================================================================

const ITEMS: { id: ID; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "today", label: "Today" },
  { id: "next", label: "Next Actions" },
  { id: "projects", label: "Projects" },
  { id: "waiting", label: "Waiting For" },
  { id: "someday", label: "Someday / Maybe" },
  { id: "reference", label: "Reference" },
  { id: "calendar", label: "Calendar" },
  { id: "review", label: "Weekly Review" },
  { id: "done", label: "Done" },
]
const ALL_IDS = ITEMS.map((i) => i.id)

// ============================================================================
// Components
// ============================================================================

function ItemRow({
  item,
  sel,
  onSelect,
}: {
  item: { id: ID; label: string }
  sel: Selection | undefined
  onSelect: (id: ID, meta: boolean, shift: boolean) => void
}) {
  const isCursor = sel ? S.cursor(sel) === item.id : false
  const isAnchor = sel ? S.anchor(sel) === item.id : false
  const isSelected = sel ? S.includes(sel, item.id) : false
  const isEditing = isCursor && sel ? S.isEditing(sel) : false

  const marker = isCursor ? "►" : isSelected ? "●" : " "
  const anchorMark = isAnchor && !isCursor ? " ⚓" : ""

  return (
    <Box
      onClick={(e: SilveryMouseEvent) => onSelect(item.id, e.metaKey, e.shiftKey)}
      onDoubleClick={() => onSelect(item.id, false, false)}
    >
      <Text color={isSelected ? "$fg-accent" : "$fg-muted"}>{marker} </Text>
      {isEditing ? (
        <Text backgroundColor="$surface" color="$text" bold>
          {" "}
          {item.label}
          <Text color="$fg-accent">│</Text>{" "}
        </Text>
      ) : (
          <Text
            bold={isCursor}
            color={isCursor ? "$fg-accent" : isSelected ? "$fg-accent" : "$muted"}
          >
          {item.label}
        </Text>
      )}
      <Text color="$muted">
        {anchorMark}
      </Text>
    </Box>
  )
}

function StatusBar({ sel }: { sel: Selection | undefined }) {
  const mode = S.inputMode(sel)
  const modeColor = mode === "text" ? "$fg-success" : mode === "node" ? "$fg-accent" : "$fg-muted"

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$border-default" paddingX={1}>
      <Box gap={2}>
        <Text color={modeColor} bold>
          {mode.toUpperCase()}
        </Text>
        {sel && (
          <>
            <Text color="$fg-muted">
              cursor=<Text color="$fg-accent">{S.cursor(sel)}</Text>
            </Text>
            <Text color="$fg-muted">
              anchor=<Text color="$text">{S.anchor(sel)}</Text>
            </Text>
            <Text color="$fg-muted">
              selected=<Text color="$text">{sel.nodes.length}</Text>
            </Text>
            {sel.text && (
              <Text color="$fg-muted">
                text=<Text color="$fg-success">offset {sel.text[0].offset}</Text>
              </Text>
            )}
          </>
        )}
      </Box>
      <Text color="$muted">
        j/k nav · Enter edit · Esc back · Shift+j/k extend · Cmd+click toggle · q quit
      </Text>
    </Box>
  )
}

function SelectionDemo() {
  const [sel, setSel] = useState<Selection | undefined>(undefined)
  const [editTexts, setEditTexts] = useState<Record<ID, string>>(() =>
    Object.fromEntries(ITEMS.map((i) => [i.id, i.label])),
  )

  const cursorIndex = sel ? ALL_IDS.indexOf(S.cursor(sel)) : -1

  const handleSelect = useCallback((id: ID, meta: boolean, shift: boolean) => {
    setSel((prev) => {
      if (meta && prev) return S.toggle(prev, id)
      if (shift && prev) return S.extend(prev, id, ALL_IDS)
      return S.select(id)
    })
  }, [])

  useInput((input: string, key: Key) => {
    if (input === "q" || (key.escape && !sel)) return "exit"

    const mode = S.inputMode(sel)

    // Text mode: handle typing
    if (mode === "text" && sel) {
      if (key.escape) {
        setSel(S.stopEditing(sel))
        return
      }
      if (key.backspace && sel.text) {
        const nodeId = S.cursor(sel)
        const offset = sel.text[0].offset
        if (offset > 0) {
          setEditTexts((prev) => ({
            ...prev,
            [nodeId]: prev[nodeId]!.slice(0, offset - 1) + prev[nodeId]!.slice(offset),
          }))
          setSel(S.edit(sel, offset - 1))
        }
        return
      }
      if (key.leftArrow && sel.text) {
        setSel(S.edit(sel, Math.max(0, sel.text[0].offset - 1)))
        return
      }
      if (key.rightArrow && sel.text) {
        const maxLen = editTexts[S.cursor(sel)]?.length ?? 0
        setSel(S.edit(sel, Math.min(maxLen, sel.text[0].offset + 1)))
        return
      }
      // Printable character
      if (input && !key.ctrl && !key.meta && sel.text) {
        const nodeId = S.cursor(sel)
        const offset = sel.text[0].offset
        setEditTexts((prev) => ({
          ...prev,
          [nodeId]: prev[nodeId]!.slice(0, offset) + input + prev[nodeId]!.slice(offset),
        }))
        setSel(S.edit(sel, offset + input.length))
        return
      }
      return
    }

    // Node mode
    if (mode === "node" && sel) {
      if (key.escape) {
        // Mode ladder: multi → single → board
        if (sel.nodes.length > 1) {
          setSel(S.collapseToCursor(sel))
        } else {
          setSel(S.clear())
        }
        return
      }
      if (key.return) {
        const text = editTexts[S.cursor(sel)] ?? ""
        setSel(S.edit(sel, text.length))
        return
      }
      if (input === "j" || key.downArrow) {
        const next = Math.min(ALL_IDS.length - 1, cursorIndex + 1)
        if (key.shift) {
          setSel(S.extend(sel, ALL_IDS[next]!, ALL_IDS))
        } else {
          setSel(S.select(ALL_IDS[next]!))
        }
        return
      }
      if (input === "k" || key.upArrow) {
        const next = Math.max(0, cursorIndex - 1)
        if (key.shift) {
          setSel(S.extend(sel, ALL_IDS[next]!, ALL_IDS))
        } else {
          setSel(S.select(ALL_IDS[next]!))
        }
        return
      }
      return
    }

    // Board mode — any nav enters node mode
    if (input === "j" || key.downArrow) setSel(S.select(ALL_IDS[0]!))
    if (input === "k" || key.upArrow) setSel(S.select(ALL_IDS.at(-1)!))
  })

  // Sync edit texts back to items for display
  const displayItems = ITEMS.map((item) => ({ ...item, label: editTexts[item.id] ?? item.label }))

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Box marginBottom={1}>
        <Text bold color="$fg-accent">
          Selection Model Demo
        </Text>
        <Text color="$fg-muted"> — silvery reactive selection</Text>
      </Box>

      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="round"
        borderColor="$border-default"
        overflow="hidden"
      >
        {displayItems.map((item) => (
          <ItemRow key={item.id} item={item} sel={sel} onSelect={handleSelect} />
        ))}
      </Box>

      <StatusBar sel={sel} />

      <Box marginTop={1} flexDirection="column">
        <Text color="$muted">
          nodes=[{sel?.nodes.join(", ") ?? ""}]
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export const meta = {
  name: "Selection",
  description: "Reactive selection model — node/text modes, multi-select, mode ladder",
  demo: true,
  features: ["Selection model", "mode ladder", "multi-select", "text editing"],
}

export async function main() {
  using handle = await run(<SelectionDemo />, { mode: "fullscreen" })
  await handle.waitUntilExit()
}
