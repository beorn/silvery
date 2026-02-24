/**
 * useEditContext Hook Tests
 *
 * Tests for the React hook wrapping createTermEditContext.
 * Uses inkx createRenderer for component-level testing.
 *
 * Covers: rendering, text mutations, cursor movement, callbacks,
 * auto-save on unmount, cancel suppression, activeEditContextRef.
 */

import React, { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { Box, Text } from "../src/index.ts"
import { createRenderer } from "inkx/testing"
import { useEditContext, activeEditContextRef } from "../src/hooks/use-edit-context.ts"
import type { UseEditContextOptions, UseEditContextResult } from "../src/hooks/use-edit-context.ts"

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Test component that exposes the hook result via a ref.
 * Uses React.act()-safe pattern: mutations go through the ref,
 * and the component re-renders because the hook's forceRender fires.
 */
function TestEditor(
  props: UseEditContextOptions & {
    resultRef?: React.MutableRefObject<UseEditContextResult | null>
    testID?: string
  },
) {
  const { resultRef, testID, ...hookProps } = props
  const result = useEditContext(hookProps)
  if (resultRef) resultRef.current = result

  return (
    <Box testID={testID ?? "editor"} flexDirection="column">
      <Text testID="val">{result.value}</Text>
      <Text testID="cur">cur={result.cursor}</Text>
      <Text testID="before">before={result.beforeCursor}</Text>
      <Text testID="after">after={result.afterCursor}</Text>
    </Box>
  )
}

// =============================================================================
// Rendering
// =============================================================================

const render = createRenderer({ cols: 60, rows: 10 })

describe("useEditContext: rendering", () => {
  test("renders initial value", () => {
    const app = render(<TestEditor initialValue="hello" />)
    expect(app.getByTestId("val").textContent()).toBe("hello")
    expect(app.getByTestId("cur").textContent()).toContain("cur=5")
  })

  test("renders empty initial value", () => {
    const app = render(<TestEditor />)
    expect(app.getByTestId("val").textContent()).toBe("")
    expect(app.getByTestId("cur").textContent()).toContain("cur=0")
  })

  test("renders with initial cursor at start", () => {
    const app = render(<TestEditor initialValue="hello" initialCursorPos="start" />)
    expect(app.getByTestId("cur").textContent()).toContain("cur=0")
  })

  test("renders with initial cursor at end (default)", () => {
    const app = render(<TestEditor initialValue="hello" />)
    expect(app.getByTestId("cur").textContent()).toContain("cur=5")
  })

  test("beforeCursor and afterCursor split correctly at start", () => {
    const app = render(<TestEditor initialValue="hello" initialCursorPos="start" />)
    expect(app.getByTestId("before").textContent()).toContain("before=")
    expect(app.getByTestId("after").textContent()).toContain("after=hello")
  })

  test("beforeCursor and afterCursor split correctly at end", () => {
    const app = render(<TestEditor initialValue="hello" />)
    expect(app.getByTestId("before").textContent()).toContain("before=hello")
    expect(app.getByTestId("after").textContent()).toContain("after=")
  })
})

// =============================================================================
// Text mutations via editContext
// =============================================================================

describe("useEditContext: text mutations", () => {
  test("insertChar updates displayed text", () => {
    const app = render(<TestEditor initialValue="hello" />)
    const ctx = activeEditContextRef.current!
    React.act(() => {
      ctx.insertChar("!")
    })
    expect(app.getByTestId("val").textContent()).toBe("hello!")
    expect(app.getByTestId("cur").textContent()).toContain("cur=6")
  })

  test("deleteBackward updates displayed text", () => {
    const app = render(<TestEditor initialValue="hello" />)
    const ctx = activeEditContextRef.current!
    React.act(() => {
      ctx.deleteBackward()
    })
    expect(app.getByTestId("val").textContent()).toBe("hell")
    expect(app.getByTestId("cur").textContent()).toContain("cur=4")
  })

  test("multiple insertions accumulate", () => {
    const app = render(<TestEditor initialValue="" />)
    const ctx = activeEditContextRef.current!
    React.act(() => {
      ctx.insertChar("a")
    })
    React.act(() => {
      ctx.insertChar("b")
    })
    React.act(() => {
      ctx.insertChar("c")
    })
    expect(app.getByTestId("val").textContent()).toBe("abc")
  })
})

// =============================================================================
// Callbacks
// =============================================================================

describe("useEditContext: callbacks", () => {
  test("onChange fires on text mutations", () => {
    const onChange = vi.fn()
    render(<TestEditor initialValue="hello" onChange={onChange} />)
    const ctx = activeEditContextRef.current!
    React.act(() => {
      ctx.insertChar("!")
    })
    expect(onChange).toHaveBeenCalledWith("hello!")
  })

  test("onChange fires for each mutation", () => {
    const onChange = vi.fn()
    render(<TestEditor initialValue="" onChange={onChange} />)
    const ctx = activeEditContextRef.current!
    React.act(() => {
      ctx.insertChar("a")
    })
    React.act(() => {
      ctx.insertChar("b")
    })
    React.act(() => {
      ctx.insertChar("c")
    })
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenLastCalledWith("abc")
  })

  test("onTextOp fires on text mutations", () => {
    const onTextOp = vi.fn()
    render(<TestEditor initialValue="hello" onTextOp={onTextOp} />)
    const ctx = activeEditContextRef.current!
    React.act(() => {
      ctx.insertChar("!")
    })
    expect(onTextOp).toHaveBeenCalledOnce()
    expect(onTextOp.mock.calls[0]![0]).toMatchObject({
      type: "insert",
      text: "!",
    })
  })
})

// =============================================================================
// Target methods
// =============================================================================

describe("useEditContext: target methods", () => {
  test("target.confirm calls onConfirm", () => {
    const onConfirm = vi.fn()
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    render(<TestEditor initialValue="hello" onConfirm={onConfirm} resultRef={ref} />)
    React.act(() => {
      ref.current!.target.confirm()
    })
    expect(onConfirm).toHaveBeenCalledWith("hello")
  })

  test("target.cancel calls onCancel", () => {
    const onCancel = vi.fn()
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    render(<TestEditor initialValue="hello" onCancel={onCancel} resultRef={ref} />)
    React.act(() => {
      ref.current!.target.cancel()
    })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  test("target.save calls onSave when provided", () => {
    const onSave = vi.fn()
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    render(<TestEditor initialValue="hello" onSave={onSave} resultRef={ref} />)
    React.act(() => {
      ref.current!.target.save()
    })
    expect(onSave).toHaveBeenCalledWith("hello")
  })

  test("target.save falls back to onConfirm when onSave not provided", () => {
    const onConfirm = vi.fn()
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    render(<TestEditor initialValue="hello" onConfirm={onConfirm} resultRef={ref} />)
    React.act(() => {
      ref.current!.target.save()
    })
    expect(onConfirm).toHaveBeenCalledWith("hello")
  })

  test("target.insertChar updates text", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    const app = render(<TestEditor initialValue="abc" resultRef={ref} />)
    React.act(() => {
      ref.current!.target.insertChar("X")
    })
    expect(app.getByTestId("val").textContent()).toBe("abcX")
  })

  test("target.deleteBackward updates text", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    const app = render(<TestEditor initialValue="abc" resultRef={ref} />)
    React.act(() => {
      ref.current!.target.deleteBackward()
    })
    expect(app.getByTestId("val").textContent()).toBe("ab")
  })

  test("target.cursorLeft and cursorRight", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    const app = render(<TestEditor initialValue="abc" resultRef={ref} />)
    // cursor starts at end (3)
    React.act(() => {
      ref.current!.target.cursorLeft()
    })
    expect(app.getByTestId("cur").textContent()).toContain("cur=2")
    React.act(() => {
      ref.current!.target.cursorRight()
    })
    expect(app.getByTestId("cur").textContent()).toContain("cur=3")
  })

  test("target.cursorStart and cursorEnd", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    const app = render(<TestEditor initialValue="hello" resultRef={ref} />)
    React.act(() => {
      ref.current!.target.cursorStart()
    })
    expect(app.getByTestId("cur").textContent()).toContain("cur=0")
    React.act(() => {
      ref.current!.target.cursorEnd()
    })
    expect(app.getByTestId("cur").textContent()).toContain("cur=5")
  })

  test("target.replaceContent replaces all text", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    const app = render(<TestEditor initialValue="old text" resultRef={ref} />)
    React.act(() => {
      ref.current!.target.replaceContent("new text", 3)
    })
    expect(app.getByTestId("val").textContent()).toBe("new text")
    expect(ref.current!.target.getCursorOffset()).toBe(3)
  })

  test("target.getContent and getCursorOffset", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    render(<TestEditor initialValue="hello" resultRef={ref} />)
    expect(ref.current!.target.getContent()).toBe("hello")
    expect(ref.current!.target.getCursorOffset()).toBe(5)
  })

  test("target.insertBreak returns false when no onSplitAtBoundary", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    render(<TestEditor initialValue="hello" resultRef={ref} />)
    expect(ref.current!.target.insertBreak()).toBe(false)
  })

  test("target.insertBreak returns true when onSplitAtBoundary provided", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    render(<TestEditor initialValue="hello" onSplitAtBoundary={() => {}} resultRef={ref} />)
    expect(ref.current!.target.insertBreak()).toBe(true)
  })
})

// =============================================================================
// Auto-save on unmount
// =============================================================================

describe("useEditContext: auto-save on unmount", () => {
  test("auto-save on unmount when value changed", () => {
    const onConfirm = vi.fn()
    let setVisible: (v: boolean) => void = () => {}

    function Wrapper() {
      const [vis, setVis] = useState(true)
      setVisible = setVis
      return vis ? <TestEditor initialValue="hello" onConfirm={onConfirm} /> : <Text testID="gone">gone</Text>
    }

    const app = render(<Wrapper />)
    const ctx = activeEditContextRef.current!

    React.act(() => {
      ctx.insertChar("!") // Modify text
    })

    // Unmount the editor
    React.act(() => {
      setVisible(false)
    })
    expect(app.getByTestId("gone").textContent()).toBe("gone")

    // onConfirm should have been called with the modified value on unmount
    expect(onConfirm).toHaveBeenCalledWith("hello!")
  })

  test("no auto-save on unmount when cancelled", () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    let setVisible: (v: boolean) => void = () => {}
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>

    function Wrapper() {
      const [vis, setVis] = useState(true)
      setVisible = setVis
      return vis ? (
        <TestEditor initialValue="hello" onConfirm={onConfirm} onCancel={onCancel} resultRef={ref} />
      ) : (
        <Text testID="gone">gone</Text>
      )
    }

    const app = render(<Wrapper />)
    const ctx = activeEditContextRef.current!

    React.act(() => {
      ctx.insertChar("!") // Modify text
    })
    React.act(() => {
      ref.current!.target.cancel() // Cancel before unmount
    })

    // Unmount the editor
    React.act(() => {
      setVisible(false)
    })

    // onConfirm should NOT have been called on unmount (cancel suppresses auto-save)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  test("no auto-save when value unchanged", () => {
    const onConfirm = vi.fn()
    let setVisible: (v: boolean) => void = () => {}

    function Wrapper() {
      const [vis, setVis] = useState(true)
      setVisible = setVis
      return vis ? <TestEditor initialValue="hello" onConfirm={onConfirm} /> : <Text testID="gone">gone</Text>
    }

    const app = render(<Wrapper />)
    // Don't modify text, just unmount
    React.act(() => {
      setVisible(false)
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

// =============================================================================
// activeEditContextRef
// =============================================================================

describe("useEditContext: activeEditContextRef", () => {
  test("sets activeEditContextRef on mount", () => {
    activeEditContextRef.current = null
    render(<TestEditor initialValue="hello" />)
    expect(activeEditContextRef.current).not.toBeNull()
    expect(activeEditContextRef.current!.text).toBe("hello")
  })

  test("clears activeEditContextRef on unmount", () => {
    let setVisible: (v: boolean) => void = () => {}
    function Wrapper() {
      const [vis, setVis] = useState(true)
      setVisible = setVis
      return vis ? <TestEditor initialValue="test" /> : <Text>gone</Text>
    }
    render(<Wrapper />)
    expect(activeEditContextRef.current).not.toBeNull()
    React.act(() => {
      setVisible(false)
    })
    expect(activeEditContextRef.current).toBeNull()
  })
})

// =============================================================================
// clear and setValue
// =============================================================================

describe("useEditContext: clear and setValue", () => {
  test("clear resets text to empty", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    const app = render(<TestEditor initialValue="hello" resultRef={ref} />)
    expect(app.getByTestId("val").textContent()).toBe("hello")
    React.act(() => {
      ref.current!.clear()
    })
    expect(app.getByTestId("val").textContent()).toBe("")
  })

  test("setValue replaces text", () => {
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    const app = render(<TestEditor initialValue="hello" resultRef={ref} />)
    React.act(() => {
      ref.current!.setValue("world")
    })
    expect(app.getByTestId("val").textContent()).toBe("world")
  })

  test("setValue triggers onChange", () => {
    const onChange = vi.fn()
    const ref = React.createRef<UseEditContextResult>() as React.MutableRefObject<UseEditContextResult | null>
    render(<TestEditor initialValue="hello" onChange={onChange} resultRef={ref} />)
    React.act(() => {
      ref.current!.setValue("world")
    })
    // onChange is called by both the onTextUpdate handler and setValue's direct call
    expect(onChange).toHaveBeenCalledWith("world")
  })
})
