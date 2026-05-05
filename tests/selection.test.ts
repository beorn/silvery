/**
 * Tests for selection state machine and text extraction.
 */
import { describe, test, expect } from "vitest"
import {
  createTerminalSelectionState,
  terminalSelectionUpdate,
  normalizeRange,
  extractText,
  type SelectionScope,
} from "@silvery/headless/selection"
import {
  TerminalBuffer,
  SELECTABLE_FLAG,
  setSelectableFlag,
  isCellSelectable,
  clearSelectableFlag,
} from "@silvery/ag-term/buffer"
import {
  composeSelectionCells,
  applySelectionToBuffer,
  type SelectionTheme,
} from "@silvery/ag-term/selection-renderer"
import {
  resolveUserSelect,
  selectionHitTest,
  findContainBoundary,
  findSelectionBoundaries,
} from "@silvery/ag-term/mouse-events"
import type { AgNode, Rect } from "@silvery/ag/types"

// ============================================================================
// State Machine
// ============================================================================

describe("terminalSelectionUpdate", () => {
  test("start sets anchor and head, marks selecting", () => {
    const state = createTerminalSelectionState()
    const [next, effects] = terminalSelectionUpdate({ type: "start", col: 5, row: 3 }, state)

    expect(next.selecting).toBe(true)
    expect(next.range).toEqual({
      anchor: { col: 5, row: 3 },
      head: { col: 5, row: 3 },
    })
    expect(effects).toEqual([{ type: "render" }])
  })

  test("extend updates head while selecting", () => {
    const [state] = terminalSelectionUpdate(
      { type: "start", col: 0, row: 0 },
      createTerminalSelectionState(),
    )
    const [next, effects] = terminalSelectionUpdate({ type: "extend", col: 10, row: 2 }, state)

    expect(next.range!.anchor).toEqual({ col: 0, row: 0 })
    expect(next.range!.head).toEqual({ col: 10, row: 2 })
    expect(next.selecting).toBe(true)
    expect(effects).toEqual([{ type: "render" }])
  })

  test("extend is a no-op when not selecting", () => {
    const state = createTerminalSelectionState()
    const [next, effects] = terminalSelectionUpdate({ type: "extend", col: 5, row: 5 }, state)

    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  test("finish sets selecting=false, emits no effects", () => {
    let [state] = terminalSelectionUpdate(
      { type: "start", col: 0, row: 0 },
      createTerminalSelectionState(),
    )
    ;[state] = terminalSelectionUpdate({ type: "extend", col: 10, row: 2 }, state)
    const [next, effects] = terminalSelectionUpdate({ type: "finish" }, state)

    expect(next.selecting).toBe(false)
    expect(next.range).toBeDefined()
    expect(effects).toEqual([])
  })

  test("finish with no range", () => {
    const state = createTerminalSelectionState()
    const [next, effects] = terminalSelectionUpdate({ type: "finish" }, state)

    expect(next.selecting).toBe(false)
    expect(next.range).toBeNull()
    expect(effects).toEqual([])
  })

  test("clear resets to initial state, emits render if had range", () => {
    const [state] = terminalSelectionUpdate(
      { type: "start", col: 0, row: 0 },
      createTerminalSelectionState(),
    )
    const [next, effects] = terminalSelectionUpdate({ type: "clear" }, state)

    expect(next.range).toBeNull()
    expect(next.selecting).toBe(false)
    expect(effects).toEqual([{ type: "render" }])
  })

  test("clear with no range emits no effects", () => {
    const state = createTerminalSelectionState()
    const [next, effects] = terminalSelectionUpdate({ type: "clear" }, state)

    expect(next.range).toBeNull()
    expect(effects).toEqual([])
  })

  test("start initializes source, granularity, scope", () => {
    const state = createTerminalSelectionState()
    const scope: SelectionScope = { top: 2, bottom: 10, left: 5, right: 30 }
    const [next] = terminalSelectionUpdate(
      { type: "start", col: 7, row: 3, source: "keyboard", scope },
      state,
    )

    expect(next.source).toBe("keyboard")
    expect(next.granularity).toBe("character") // default granularity on start
    expect(next.scope).toEqual(scope)
    expect(next.range!.anchor).toEqual({ col: 7, row: 3 })
  })

  test("start clamps position to scope", () => {
    const state = createTerminalSelectionState()
    const scope: SelectionScope = { top: 5, bottom: 10, left: 5, right: 20 }
    const [next] = terminalSelectionUpdate(
      { type: "start", col: 2, row: 3, scope }, // col 2 < left 5, row 3 < top 5
      state,
    )

    expect(next.range!.anchor).toEqual({ col: 5, row: 5 })
  })

  test("extend clamps to scope", () => {
    const scope: SelectionScope = { top: 0, bottom: 5, left: 0, right: 15 }
    const [state] = terminalSelectionUpdate(
      { type: "start", col: 5, row: 2, scope },
      createTerminalSelectionState(),
    )
    const [next] = terminalSelectionUpdate(
      { type: "extend", col: 25, row: 8 }, // beyond scope
      state,
    )

    expect(next.range!.head).toEqual({ col: 15, row: 5 })
  })

  test("extend can drop contain scope when drag leaves the contained box", () => {
    const scope: SelectionScope = { top: 0, bottom: 5, left: 5, right: 15 }
    const [state] = terminalSelectionUpdate(
      { type: "start", col: 8, row: 2, scope },
      createTerminalSelectionState(),
    )
    const [next] = terminalSelectionUpdate({ type: "extend", col: 30, row: 8, scope: null }, state)

    expect(next.scope).toBeNull()
    expect(next.range!.anchor).toEqual({ col: 8, row: 2 })
    expect(next.range!.head).toEqual({ col: 30, row: 8 })
  })

  test("defaults: source=mouse, granularity=char, scope=null", () => {
    const state = createTerminalSelectionState()
    const [next] = terminalSelectionUpdate({ type: "start", col: 0, row: 0 }, state)

    expect(next.source).toBe("mouse")
    expect(next.granularity).toBe("character")
    expect(next.scope).toBeNull()
  })

  test("multiple start/extend cycles", () => {
    let [state] = terminalSelectionUpdate(
      { type: "start", col: 0, row: 0 },
      createTerminalSelectionState(),
    )
    ;[state] = terminalSelectionUpdate({ type: "extend", col: 5, row: 0 }, state)
    ;[state] = terminalSelectionUpdate({ type: "extend", col: 10, row: 1 }, state)
    ;[state] = terminalSelectionUpdate({ type: "extend", col: 3, row: 2 }, state)

    expect(state.range!.anchor).toEqual({ col: 0, row: 0 })
    expect(state.range!.head).toEqual({ col: 3, row: 2 })
  })
})

// ============================================================================
// normalizeRange
// ============================================================================

describe("normalizeRange", () => {
  test("anchor before head (forward selection)", () => {
    const result = normalizeRange({
      anchor: { col: 2, row: 1 },
      head: { col: 8, row: 3 },
    })
    expect(result).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 8 })
  })

  test("head before anchor (backward selection)", () => {
    const result = normalizeRange({
      anchor: { col: 8, row: 3 },
      head: { col: 2, row: 1 },
    })
    expect(result).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 8 })
  })

  test("same row, anchor col < head col", () => {
    const result = normalizeRange({
      anchor: { col: 2, row: 5 },
      head: { col: 10, row: 5 },
    })
    expect(result).toEqual({ startRow: 5, startCol: 2, endRow: 5, endCol: 10 })
  })

  test("same row, head col < anchor col", () => {
    const result = normalizeRange({
      anchor: { col: 10, row: 5 },
      head: { col: 2, row: 5 },
    })
    expect(result).toEqual({ startRow: 5, startCol: 2, endRow: 5, endCol: 10 })
  })

  test("same position", () => {
    const result = normalizeRange({
      anchor: { col: 5, row: 5 },
      head: { col: 5, row: 5 },
    })
    expect(result).toEqual({ startRow: 5, startCol: 5, endRow: 5, endCol: 5 })
  })
})

// ============================================================================
// extractText
// ============================================================================

describe("extractText", () => {
  function createBufferWithText(lines: string[], width = 20): TerminalBuffer {
    const height = lines.length
    const buf = new TerminalBuffer(width, height)
    for (let y = 0; y < height; y++) {
      const line = lines[y]!
      for (let x = 0; x < line.length && x < width; x++) {
        buf.setCell(x, y, { char: line[x]!, fg: null, bg: null })
      }
    }
    return buf
  }

  test("single row extraction", () => {
    const buf = createBufferWithText(["Hello, World!"])
    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    })
    expect(text).toBe("Hello")
  })

  test("multi-row extraction", () => {
    const buf = createBufferWithText(["First line here", "Second line", "Third line"])
    const text = extractText(buf, {
      anchor: { col: 6, row: 0 },
      head: { col: 5, row: 2 },
    })
    expect(text).toBe("line here\nSecond line\nThird")
  })

  test("trims trailing spaces", () => {
    const buf = createBufferWithText(["Hello     "], 10)
    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 9, row: 0 },
    })
    expect(text).toBe("Hello")
  })

  test("preserves blank lines within selection", () => {
    const buf = createBufferWithText(["Hello", "     ", "World"], 10)
    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 2 },
    })
    // Blank lines within selection are preserved (not dropped)
    expect(text).toBe("Hello\n\nWorld")
  })

  test("backward selection (head before anchor)", () => {
    const buf = createBufferWithText(["Hello, World!"])
    const text = extractText(buf, {
      anchor: { col: 7, row: 0 },
      head: { col: 0, row: 0 },
    })
    expect(text).toBe("Hello, W")
  })

  test("skips wide-char continuation cells", () => {
    const buf = new TerminalBuffer(10, 1)
    // Write "A" at col 0, wide char "漢" at col 1-2, "B" at col 3
    buf.setCell(0, 0, { char: "A" })
    buf.setCell(1, 0, { char: "漢", wide: true })
    buf.setCell(2, 0, { char: "", continuation: true })
    buf.setCell(3, 0, { char: "B" })

    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 3, row: 0 },
    })
    // Should get "A漢B" — continuation cell at col 2 is skipped
    expect(text).toBe("A漢B")
  })

  test("soft-wrapped rows are joined without newline", () => {
    const buf = createBufferWithText(["Hello ", "World!"], 6)
    buf.setRowMeta(0, { softWrapped: true, lastContentCol: 5 })
    buf.setRowMeta(1, { softWrapped: false, lastContentCol: 5 })

    const text = extractText(
      buf,
      {
        anchor: { col: 0, row: 0 },
        head: { col: 5, row: 1 },
      },
      { rowMetadata: buf.getRowMetadataArray() },
    )

    expect(text).toBe("Hello World!")
  })

  test("respects SELECTABLE_FLAG when enabled", () => {
    const buf = new TerminalBuffer(10, 1)

    // Write "ABCDE" — A, C, E selectable; B, D not selectable
    buf.setSelectableMode(true)
    buf.setCell(0, 0, { char: "A" })
    buf.setSelectableMode(false)
    buf.setCell(1, 0, { char: "B" })
    buf.setSelectableMode(true)
    buf.setCell(2, 0, { char: "C" })
    buf.setSelectableMode(false)
    buf.setCell(3, 0, { char: "D" })
    buf.setSelectableMode(true)
    buf.setCell(4, 0, { char: "E" })

    // Without flag check — all chars returned
    const all = extractText(
      buf,
      {
        anchor: { col: 0, row: 0 },
        head: { col: 4, row: 0 },
      },
      { respectSelectableFlag: false },
    )
    expect(all).toBe("ABCDE")

    // With flag check — only selectable chars returned
    const filtered = extractText(
      buf,
      {
        anchor: { col: 0, row: 0 },
        head: { col: 4, row: 0 },
      },
      { respectSelectableFlag: true },
    )
    expect(filtered).toBe("ACE")
  })

  test("trims trailing spaces using lastContentCol from row metadata", () => {
    const buf = createBufferWithText(["Hello          "], 15)
    buf.setRowMeta(0, { softWrapped: false, lastContentCol: 4 })

    const text = extractText(
      buf,
      {
        anchor: { col: 0, row: 0 },
        head: { col: 14, row: 0 },
      },
      { rowMetadata: buf.getRowMetadataArray() },
    )

    expect(text).toBe("Hello")
  })
})

// ============================================================================
// Buffer SELECTABLE_FLAG
// ============================================================================

describe("SELECTABLE_FLAG in buffer", () => {
  test("setSelectableMode stamps flag on setCell", () => {
    const buf = new TerminalBuffer(5, 1)
    buf.setSelectableMode(true)
    buf.setCell(0, 0, { char: "A" })
    buf.setSelectableMode(false)
    buf.setCell(1, 0, { char: "B" })

    expect(buf.isCellSelectable(0, 0)).toBe(true)
    expect(buf.isCellSelectable(1, 0)).toBe(false)
  })

  test("setSelectableMode stamps flag on fill", () => {
    const buf = new TerminalBuffer(10, 2)
    buf.setSelectableMode(true)
    buf.fill(0, 0, 10, 1, { char: "X" })
    buf.setSelectableMode(false)
    buf.fill(0, 1, 10, 1, { char: "Y" })

    expect(buf.isCellSelectable(5, 0)).toBe(true)
    expect(buf.isCellSelectable(5, 1)).toBe(false)
  })

  test("clone preserves SELECTABLE_FLAG", () => {
    const buf = new TerminalBuffer(5, 1)
    buf.setSelectableMode(true)
    buf.setCell(0, 0, { char: "A" })

    const clone = buf.clone()
    expect(clone.isCellSelectable(0, 0)).toBe(true)
  })

  test("SELECTABLE_FLAG does not affect diff comparison", () => {
    const buf1 = new TerminalBuffer(5, 1)
    buf1.setCell(0, 0, { char: "A" })

    const buf2 = new TerminalBuffer(5, 1)
    buf2.setSelectableMode(true)
    buf2.setCell(0, 0, { char: "A" })

    // Cells should be "equal" for diff purposes despite different SELECTABLE_FLAG
    expect(buf2.cellEquals(0, 0, buf1)).toBe(true)
    expect(buf2.rowMetadataEquals(0, buf1)).toBe(true)
  })

  test("helper functions work on packed values", () => {
    const packed = 0
    const withFlag = setSelectableFlag(packed)
    expect(isCellSelectable(withFlag)).toBe(true)

    const cleared = clearSelectableFlag(withFlag)
    expect(isCellSelectable(cleared)).toBe(false)
  })
})

// ============================================================================
// Row Metadata
// ============================================================================

describe("RowMetadata", () => {
  test("setRowMeta and getRowMeta", () => {
    const buf = new TerminalBuffer(10, 3)
    buf.setRowMeta(0, { softWrapped: true, lastContentCol: 8 })
    buf.setRowMeta(1, { softWrapped: false, lastContentCol: 5 })

    const meta0 = buf.getRowMeta(0)
    expect(meta0.softWrapped).toBe(true)
    expect(meta0.lastContentCol).toBe(8)

    const meta1 = buf.getRowMeta(1)
    expect(meta1.softWrapped).toBe(false)
    expect(meta1.lastContentCol).toBe(5)

    // Default for unset row
    const meta2 = buf.getRowMeta(2)
    expect(meta2.softWrapped).toBe(false)
    expect(meta2.lastContentCol).toBe(-1)
  })

  test("clone preserves row metadata", () => {
    const buf = new TerminalBuffer(10, 2)
    buf.setRowMeta(0, { softWrapped: true, lastContentCol: 7 })

    const clone = buf.clone()
    const meta = clone.getRowMeta(0)
    expect(meta.softWrapped).toBe(true)
    expect(meta.lastContentCol).toBe(7)

    // Mutations on clone don't affect original
    clone.setRowMeta(0, { softWrapped: false })
    expect(buf.getRowMeta(0).softWrapped).toBe(true)
  })

  test("out-of-bounds returns defaults", () => {
    const buf = new TerminalBuffer(5, 2)
    const meta = buf.getRowMeta(-1)
    expect(meta.softWrapped).toBe(false)
    expect(meta.lastContentCol).toBe(-1)
  })
})

// ============================================================================
// resolveUserSelect
// ============================================================================

describe("resolveUserSelect", () => {
  function makeNode(userSelect?: string, parent?: AgNode): AgNode {
    return {
      type: "silvery-box",
      props: { userSelect },
      children: [],
      parent: parent ?? null,
      layoutNode: null,
      prevLayout: null,
      boxRect: { x: 0, y: 0, width: 10, height: 5 },
      scrollRect: { x: 0, y: 0, width: 10, height: 5 },
      prevScrollRect: null,
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      prevScreenRect: null,
      layoutChangedThisFrame: false,
      contentDirty: false,
      stylePropsDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      hidden: false,
    } as unknown as AgNode
  }

  test("root with no userSelect defaults to text", () => {
    const root = makeNode(undefined)
    expect(resolveUserSelect(root)).toBe("text")
  })

  test("explicit none returns none", () => {
    const node = makeNode("none")
    expect(resolveUserSelect(node)).toBe("none")
  })

  test("explicit text returns text", () => {
    const node = makeNode("text")
    expect(resolveUserSelect(node)).toBe("text")
  })

  test("explicit contain returns contain", () => {
    const node = makeNode("contain")
    expect(resolveUserSelect(node)).toBe("contain")
  })

  test("auto inherits from parent", () => {
    const parent = makeNode("none")
    const child = makeNode("auto", parent)
    expect(resolveUserSelect(child)).toBe("none")
  })

  test("text overrides parent none", () => {
    const parent = makeNode("none")
    const child = makeNode("text", parent)
    expect(resolveUserSelect(child)).toBe("text")
  })

  test("auto with no explicit parent resolves to text (root default)", () => {
    const grandparent = makeNode(undefined)
    const parent = makeNode("auto", grandparent)
    const child = makeNode("auto", parent)
    expect(resolveUserSelect(child)).toBe("text")
  })
})

// ============================================================================
// selectionHitTest vs pointer hitTest
// ============================================================================

describe("selectionHitTest", () => {
  function makeTree(): {
    root: AgNode
    selectable: AgNode
    nonSelectable: AgNode
    pointerNone: AgNode
  } {
    const root: AgNode = {
      type: "silvery-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: {} as any,
      prevLayout: null,
      boxRect: { x: 0, y: 0, width: 40, height: 20 },
      scrollRect: { x: 0, y: 0, width: 40, height: 20 },
      prevScrollRect: null,
      screenRect: { x: 0, y: 0, width: 40, height: 20 },
      prevScreenRect: null,
      layoutChangedThisFrame: false,
      contentDirty: false,
      stylePropsDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      hidden: false,
    } as unknown as AgNode

    // pointerEvents=none but userSelect=text — should be found by selection but not pointer
    const pointerNone: AgNode = {
      type: "silvery-box",
      props: { pointerEvents: "none", userSelect: "text" },
      children: [],
      parent: root,
      layoutNode: {} as any,
      prevLayout: null,
      boxRect: { x: 0, y: 0, width: 10, height: 5 },
      scrollRect: { x: 0, y: 0, width: 10, height: 5 },
      prevScrollRect: null,
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      prevScreenRect: null,
      layoutChangedThisFrame: false,
      contentDirty: false,
      stylePropsDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      hidden: false,
    } as unknown as AgNode

    // userSelect=none — should NOT be found by selection but IS by pointer
    const nonSelectable: AgNode = {
      type: "silvery-box",
      props: { userSelect: "none" },
      children: [],
      parent: root,
      layoutNode: {} as any,
      prevLayout: null,
      boxRect: { x: 10, y: 0, width: 10, height: 5 },
      scrollRect: { x: 10, y: 0, width: 10, height: 5 },
      prevScrollRect: null,
      screenRect: { x: 10, y: 0, width: 10, height: 5 },
      prevScreenRect: null,
      layoutChangedThisFrame: false,
      contentDirty: false,
      stylePropsDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      hidden: false,
    } as unknown as AgNode

    // Normal selectable node
    const selectable: AgNode = {
      type: "silvery-box",
      props: { userSelect: "text" },
      children: [],
      parent: root,
      layoutNode: {} as any,
      prevLayout: null,
      boxRect: { x: 20, y: 0, width: 10, height: 5 },
      scrollRect: { x: 20, y: 0, width: 10, height: 5 },
      prevScrollRect: null,
      screenRect: { x: 20, y: 0, width: 10, height: 5 },
      prevScreenRect: null,
      layoutChangedThisFrame: false,
      contentDirty: false,
      stylePropsDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      hidden: false,
    } as unknown as AgNode

    root.children = [pointerNone, nonSelectable, selectable]
    return { root, selectable, nonSelectable, pointerNone }
  }

  test("selectionHitTest finds pointerEvents=none node with userSelect=text", () => {
    const { root, pointerNone } = makeTree()
    const hit = selectionHitTest(root, 5, 2)
    expect(hit).toBe(pointerNone)
  })

  test("selectionHitTest does NOT find userSelect=none node", () => {
    const { root } = makeTree()
    // Point at (15, 2) is in the nonSelectable node area
    const hit = selectionHitTest(root, 15, 2)
    // Should fall through to root since nonSelectable blocks selection
    expect(hit).not.toHaveProperty("props.userSelect", "none")
  })

  test("selectionHitTest finds explicitly selectable node", () => {
    const { root, selectable } = makeTree()
    const hit = selectionHitTest(root, 25, 2)
    expect(hit).toBe(selectable)
  })
})

// ============================================================================
// findContainBoundary
// ============================================================================

describe("findContainBoundary", () => {
  function makeContainTree(): { root: AgNode; inner: AgNode; leaf: AgNode } {
    const root: AgNode = {
      type: "silvery-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: {} as any,
      scrollRect: { x: 0, y: 0, width: 80, height: 24 },
    } as unknown as AgNode

    const inner: AgNode = {
      type: "silvery-box",
      props: { userSelect: "contain" },
      children: [],
      parent: root,
      layoutNode: {} as any,
      scrollRect: { x: 5, y: 2, width: 30, height: 10 },
    } as unknown as AgNode

    const leaf: AgNode = {
      type: "silvery-text",
      props: {},
      children: [],
      parent: inner,
      layoutNode: {} as any,
      scrollRect: { x: 6, y: 3, width: 20, height: 5 },
    } as unknown as AgNode

    root.children = [inner]
    inner.children = [leaf]
    return { root, inner, leaf }
  }

  test("returns contain boundary from ancestor", () => {
    const { leaf } = makeContainTree()
    const scope = findContainBoundary(leaf)

    expect(scope).toEqual({
      top: 2,
      bottom: 11,
      left: 5,
      right: 34,
    })
  })

  test("returns null when no contain ancestor exists", () => {
    const node: AgNode = {
      type: "silvery-box",
      props: {},
      children: [],
      parent: null,
      layoutNode: {} as any,
      scrollRect: { x: 0, y: 0, width: 10, height: 5 },
    } as unknown as AgNode

    expect(findContainBoundary(node)).toBeNull()
  })
})

// ============================================================================
// findSelectionBoundaries
// ============================================================================

describe("findSelectionBoundaries", () => {
  test("returns document ancestors nearest first", () => {
    const root = {
      type: "silvery-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: {} as any,
      scrollRect: { x: 0, y: 0, width: 80, height: 24 },
    } as unknown as AgNode
    const turn = {
      type: "silvery-box",
      props: {},
      children: [],
      parent: root,
      layoutNode: {} as any,
      scrollRect: { x: 2, y: 4, width: 60, height: 8 },
    } as unknown as AgNode
    const prompt = {
      type: "silvery-box",
      props: {},
      children: [],
      parent: turn,
      layoutNode: {} as any,
      scrollRect: { x: 20, y: 5, width: 30, height: 3 },
    } as unknown as AgNode
    root.children = [turn]
    turn.children = [prompt]

    const boundaries = findSelectionBoundaries(prompt)

    expect(boundaries.map((boundary) => boundary.node)).toEqual([prompt, turn, root])
    expect(boundaries.map((boundary) => boundary.scope)).toEqual([
      { top: 5, bottom: 7, left: 20, right: 49 },
      { top: 4, bottom: 11, left: 2, right: 61 },
      { top: 0, bottom: 23, left: 0, right: 79 },
    ])
    expect(boundaries.some((boundary) => boundary.hardContain)).toBe(false)
  })

  test("skips zero-area scrollRects (e.g. virtual text children with inlineRects)", () => {
    // Regression: virtual <Text> children carry inlineRects for hit testing
    // but have a placeholder scrollRect of {0,0,0,0}. If findSelectionBoundaries
    // includes that as a scope, the resulting `nearestCommonSelectionScope`
    // collapses every double/triple-click to (0,0) via clampToScope, silently
    // breaking word/line selection. (See click-granularity.test.tsx.)
    const root = {
      type: "silvery-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: {} as any,
      scrollRect: { x: 0, y: 0, width: 40, height: 10 },
    } as unknown as AgNode
    const text = {
      type: "silvery-text",
      props: {},
      children: [],
      parent: root,
      layoutNode: {} as any,
      scrollRect: { x: 0, y: 0, width: 24, height: 1 },
    } as unknown as AgNode
    // Virtual inline text child — has inlineRects, scrollRect is zero-area.
    const virtualInline = {
      type: "silvery-text",
      props: {},
      children: [],
      parent: text,
      layoutNode: {} as any,
      scrollRect: { x: 0, y: 0, width: 0, height: 0 },
      inlineRects: [{ x: 0, y: 0, width: 24, height: 1 }],
    } as unknown as AgNode
    root.children = [text]
    text.children = [virtualInline]

    const boundaries = findSelectionBoundaries(virtualInline)

    // The virtual inline child must NOT contribute a scope — only its
    // ancestors with real geometry should.
    expect(boundaries.map((boundary) => boundary.node)).toEqual([text, root])
    expect(boundaries.map((boundary) => boundary.scope)).toEqual([
      { top: 0, bottom: 0, left: 0, right: 23 },
      { top: 0, bottom: 9, left: 0, right: 39 },
    ])
  })

  test("marks explicit contain as a hard boundary", () => {
    const root = {
      type: "silvery-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: {} as any,
      scrollRect: { x: 0, y: 0, width: 80, height: 24 },
    } as unknown as AgNode
    const modal = {
      type: "silvery-box",
      props: { userSelect: "contain" },
      children: [],
      parent: root,
      layoutNode: {} as any,
      scrollRect: { x: 10, y: 3, width: 40, height: 10 },
    } as unknown as AgNode
    const text = {
      type: "silvery-text",
      props: {},
      children: [],
      parent: modal,
      layoutNode: {} as any,
      scrollRect: { x: 12, y: 5, width: 20, height: 1 },
    } as unknown as AgNode
    root.children = [modal]
    modal.children = [text]

    const boundaries = findSelectionBoundaries(text)

    expect(boundaries.map((boundary) => boundary.hardContain)).toEqual([false, true, false])
  })
})

// ============================================================================
// Style Composition
// ============================================================================

describe("composeSelectionCells", () => {
  test("returns empty array for null selection", () => {
    const buf = new TerminalBuffer(10, 1)
    const changes = composeSelectionCells(buf, null)
    expect(changes).toEqual([])
  })

  test("swaps fg/bg as fallback", () => {
    const buf = new TerminalBuffer(10, 1)
    buf.setCell(0, 0, { char: "A", fg: 1, bg: 2 })

    const changes = composeSelectionCells(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 0, row: 0 },
    })

    expect(changes).toHaveLength(1)
    expect(changes[0]!.fg).toBe(2) // was bg
    expect(changes[0]!.bg).toBe(1) // was fg
  })

  test("uses theme tokens when provided", () => {
    const buf = new TerminalBuffer(10, 1)
    buf.setCell(0, 0, { char: "A", fg: 1, bg: 2 })

    const theme: SelectionTheme = {
      selectionFg: { r: 255, g: 255, b: 255 },
      selectionBg: { r: 0, g: 0, b: 128 },
    }

    const changes = composeSelectionCells(
      buf,
      {
        anchor: { col: 0, row: 0 },
        head: { col: 0, row: 0 },
      },
      theme,
    )

    expect(changes).toHaveLength(1)
    expect(changes[0]!.fg).toEqual({ r: 255, g: 255, b: 255 })
    expect(changes[0]!.bg).toEqual({ r: 0, g: 0, b: 128 })
  })

  test("skips continuation cells", () => {
    const buf = new TerminalBuffer(5, 1)
    buf.setCell(0, 0, { char: "漢", wide: true })
    buf.setCell(1, 0, { char: "", continuation: true })
    buf.setCell(2, 0, { char: "B" })

    const changes = composeSelectionCells(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 2, row: 0 },
    })

    // Should have 2 changes: col 0 (wide char) and col 2 (B) — col 1 (continuation) skipped
    expect(changes).toHaveLength(2)
    expect(changes.map((c) => c.col)).toEqual([0, 2])
  })

  test("respects SELECTABLE_FLAG when enabled", () => {
    const buf = new TerminalBuffer(5, 1)
    buf.setSelectableMode(true)
    buf.setCell(0, 0, { char: "A" })
    buf.setSelectableMode(false)
    buf.setCell(1, 0, { char: "B" })
    buf.setSelectableMode(true)
    buf.setCell(2, 0, { char: "C" })

    const changes = composeSelectionCells(
      buf,
      {
        anchor: { col: 0, row: 0 },
        head: { col: 2, row: 0 },
      },
      undefined,
      true,
    ) // respectSelectableFlag = true

    // Only A and C are selectable
    expect(changes).toHaveLength(2)
    expect(changes.map((c) => c.col)).toEqual([0, 2])
  })

  test("applySelectionToBuffer modifies cell colors", () => {
    const buf = new TerminalBuffer(5, 1)
    buf.setCell(0, 0, { char: "A", fg: 1, bg: 2 })

    const changes = composeSelectionCells(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 0, row: 0 },
    })

    applySelectionToBuffer(buf, changes)

    const cell = buf.getCell(0, 0)
    expect(cell.fg).toBe(2) // swapped
    expect(cell.bg).toBe(1) // swapped
    expect(cell.char).toBe("A") // char unchanged
  })
})
