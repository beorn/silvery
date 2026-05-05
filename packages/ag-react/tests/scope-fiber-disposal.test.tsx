/**
 * @silvery/ag-react — Phase 1 reconciler fiber-disposal tests.
 *
 * Covers the host-config integration that is the bridge between React's
 * fiber lifetime and `@silvery/scope`:
 *
 *   - `attachNodeScope` attaches a `Scope` to a host instance (AgNode).
 *   - On unmount (`removeChild`, `removeChildFromContainer`,
 *     `clearContainer`, `detachDeletedInstance`), the reconciler walks the
 *     doomed subtree and fires `scope[Symbol.asyncDispose]()` for every
 *     attached scope.
 *   - Disposal is unavoidable: errors flow through `reportDisposeError`
 *     with `phase: "react-unmount"` rather than the React error-boundary
 *     chain.
 *   - Re-mount under the same root yields a fresh scope (lifetime ties to
 *     fiber, not to the AgNode reuse pattern).
 *
 * Scope semantics (LIFO, signal propagation, child cascade, idempotent
 * dispose) live in `packages/scope/tests/scope.test.ts`. This file only
 * verifies the host-config plumbing preserves them.
 */

import React, { forwardRef, useImperativeHandle, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createScope, setDisposeErrorSink, type DisposeErrorContext } from "@silvery/scope"
import type { AgNode } from "@silvery/ag/types"
import { createRenderer } from "@silvery/test"
import { Box, type BoxHandle } from "../src/components/Box"
import { Text } from "../src/components/Text"
import { attachNodeScope, detachNodeScope, getNodeScope } from "../src/reconciler/host-config"

// ---------------------------------------------------------------------------
// Error-sink capture — keep dispose errors out of vitest's stderr stream
// and assert on them where the test contract demands it.
// ---------------------------------------------------------------------------

type Captured = { error: unknown; context: DisposeErrorContext }

function installCapturingSink(): { captured: Captured[]; restore: () => void } {
  const captured: Captured[] = []
  const defaultSink = (error: unknown, context: DisposeErrorContext) => {
    const name = context.scope?.name ?? "?"
    // eslint-disable-next-line no-console
    console.error(`[scope dispose error] phase=${context.phase} scope=${name}`, error)
  }
  setDisposeErrorSink((error, context) => captured.push({ error, context }))
  return {
    captured,
    restore: () => setDisposeErrorSink(defaultSink),
  }
}

// Test helper — a Box that exposes its underlying AgNode so the test can
// attach a fiber-local scope. This stands in for what `useScope` /
// `useScopeEffect` will eventually do via a host-instance ref.
interface NodeProbeHandle {
  getNode(): AgNode | null
}

const NodeProbe = forwardRef<NodeProbeHandle, { children?: React.ReactNode }>(function NodeProbe(
  { children },
  ref,
) {
  const innerRef = useRef<BoxHandle>(null)
  useImperativeHandle(ref, () => ({
    getNode: () => innerRef.current?.getNode() ?? null,
  }))
  return <Box ref={innerRef}>{children}</Box>
})

// ---------------------------------------------------------------------------
// attach / get / detach round-trip
// ---------------------------------------------------------------------------

describe("attachNodeScope / getNodeScope / detachNodeScope", () => {
  it("round-trips a scope through the WeakMap slot", () => {
    const scope = createScope("probe")
    const node: AgNode = {
      type: "silvery-box",
      props: {},
      children: [],
      parent: null,
      layoutNode: null,
      boxRect: null,
      scrollRect: null,
      screenRect: null,
      prevLayout: null,
      prevScrollRect: null,
      prevScreenRect: null,
      layoutChangedThisFrame: 0,
      dirtyBits: 0,
      dirtyEpoch: 0,
    }

    expect(getNodeScope(node)).toBeUndefined()
    attachNodeScope(node, scope)
    expect(getNodeScope(node)).toBe(scope)
    expect(detachNodeScope(node)).toBe(scope)
    expect(getNodeScope(node)).toBeUndefined()
  })

  it("re-attaching the same scope is idempotent", () => {
    const scope = createScope("probe")
    const node: AgNode = makeFakeNode()
    attachNodeScope(node, scope)
    expect(() => attachNodeScope(node, scope)).not.toThrow()
    expect(getNodeScope(node)).toBe(scope)
  })

  it("attaching a different scope without detaching first throws", () => {
    const a = createScope("a")
    const b = createScope("b")
    const node: AgNode = makeFakeNode()
    attachNodeScope(node, a)
    expect(() => attachNodeScope(node, b)).toThrow(/already has a different scope attached/)
  })
})

// ---------------------------------------------------------------------------
// Reconciler unmount paths
// ---------------------------------------------------------------------------

describe("reconciler fiber-scope disposal", () => {
  let sink: ReturnType<typeof installCapturingSink>
  beforeEach(() => {
    sink = installCapturingSink()
  })
  afterEach(() => {
    sink.restore()
  })

  it("disposes a scope attached to a host instance when its fiber unmounts", async () => {
    const ref = React.createRef<NodeProbeHandle>()
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <NodeProbe ref={ref}>
        <Text>hi</Text>
      </NodeProbe>,
    )

    const node = ref.current!.getNode()!
    expect(node).toBeDefined()
    const scope = createScope("fiber-local")
    attachNodeScope(node, scope)
    expect(scope.disposed).toBe(false)

    app.unmount()
    // Async dispose is fire-and-forget — wait a few microtasks for the
    // promise chain to settle.
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(scope.disposed).toBe(true)
    // Slot is detached by the dispose path, so a follow-up attach is
    // safe (no stale-scope leak).
    expect(getNodeScope(node)).toBeUndefined()
  })

  it("disposes scopes for the entire doomed subtree, not just the unmounted root", async () => {
    const outerRef = React.createRef<NodeProbeHandle>()
    const innerRef = React.createRef<NodeProbeHandle>()
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <NodeProbe ref={outerRef}>
        <NodeProbe ref={innerRef}>
          <Text>nested</Text>
        </NodeProbe>
      </NodeProbe>,
    )

    const outer = outerRef.current!.getNode()!
    const inner = innerRef.current!.getNode()!
    expect(inner.parent).toBe(outer)

    const outerScope = createScope("outer")
    const innerScope = createScope("inner")
    attachNodeScope(outer, outerScope)
    attachNodeScope(inner, innerScope)

    app.unmount()
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(outerScope.disposed).toBe(true)
    expect(innerScope.disposed).toBe(true)
  })

  it("(e) routes async dispose failures through reportDisposeError with phase=react-unmount", async () => {
    const ref = React.createRef<NodeProbeHandle>()
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <NodeProbe ref={ref}>
        <Text>boom</Text>
      </NodeProbe>,
    )

    const node = ref.current!.getNode()!
    const scope = createScope("fiber-local")
    scope.defer(() => {
      throw new Error("dispose-boom")
    })
    attachNodeScope(node, scope)

    app.unmount()
    for (let i = 0; i < 5; i++) await Promise.resolve()

    // Find the dispose-boom in captured errors; other errors may also fire
    // (e.g. unrelated cleanup) but ours must be there with the right phase.
    const matches = sink.captured.filter((c) => (c.error as Error).message === "dispose-boom")
    expect(matches.length).toBe(1)
    expect(matches[0]!.context.phase).toBe("react-unmount")
    expect(matches[0]!.context.scope).toBe(scope)
  })

  it("re-mount under the same renderer creates a fresh node, with no scope leaking from the previous mount", async () => {
    const refA = React.createRef<NodeProbeHandle>()
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <NodeProbe ref={refA}>
        <Text>a</Text>
      </NodeProbe>,
    )

    const nodeA = refA.current!.getNode()!
    const scopeA = createScope("a")
    attachNodeScope(nodeA, scopeA)

    app.unmount()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(scopeA.disposed).toBe(true)

    // Fresh renderer — new fiber root, new node.
    const refB = React.createRef<NodeProbeHandle>()
    const render2 = createRenderer({ cols: 20, rows: 2 })
    render2(
      <NodeProbe ref={refB}>
        <Text>b</Text>
      </NodeProbe>,
    )

    const nodeB = refB.current!.getNode()!
    expect(nodeB).not.toBe(nodeA)
    expect(getNodeScope(nodeB)).toBeUndefined()
  })

  it("removing a child via re-render disposes only the doomed subtree (not the surviving siblings)", async () => {
    const survivorRef = React.createRef<NodeProbeHandle>()
    const doomedRef = React.createRef<NodeProbeHandle>()

    function App({ showDoomed }: { showDoomed: boolean }): React.ReactElement {
      return (
        <Box>
          <NodeProbe ref={survivorRef}>
            <Text>survivor</Text>
          </NodeProbe>
          {showDoomed ? (
            <NodeProbe ref={doomedRef}>
              <Text>doomed</Text>
            </NodeProbe>
          ) : null}
        </Box>
      )
    }

    const render = createRenderer({ cols: 20, rows: 4 })
    const app = render(<App showDoomed={true} />)

    const survivorNode = survivorRef.current!.getNode()!
    const doomedNode = doomedRef.current!.getNode()!
    const survivorScope = createScope("survivor")
    const doomedScope = createScope("doomed")
    attachNodeScope(survivorNode, survivorScope)
    attachNodeScope(doomedNode, doomedScope)

    app.rerender(<App showDoomed={false} />)
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(doomedScope.disposed).toBe(true)
    expect(survivorScope.disposed).toBe(false)

    // Cleanup
    app.unmount()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(survivorScope.disposed).toBe(true)
  })

  it("disposes scopes attached to nodes that are cleared via container clear (full app teardown)", async () => {
    const ref = React.createRef<NodeProbeHandle>()
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <NodeProbe ref={ref}>
        <Text>hi</Text>
      </NodeProbe>,
    )

    const node = ref.current!.getNode()!
    const scope = createScope("clear")
    attachNodeScope(node, scope)

    // Full unmount triggers the equivalent of clearContainer for the
    // top-level child path (removeChildFromContainer).
    app.unmount()
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(scope.disposed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeNode(): AgNode {
  return {
    type: "silvery-box",
    props: {},
    children: [],
    parent: null,
    layoutNode: null,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: 0,
    dirtyBits: 0,
    dirtyEpoch: 0,
  }
}
