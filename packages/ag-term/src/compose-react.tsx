/**
 * withReact() — Compose plugin that mounts a React element into the ag tree.
 *
 * Bridges compose API to React reconciler:
 * - Ensures layout engine is initialized
 * - Creates reconciler container (which owns the ag root node)
 * - Replaces app.ag with one backed by the reconciler's root
 * - Mounts element with required context providers
 * - Re-renders on each React commit
 *
 * NOTE: withReact replaces the ag from withAg() with a reconciler-backed ag.
 * The original withAg() ag was empty — withReact populates it via React.
 *
 * @example
 * ```tsx
 * const app = pipe(create(), withAg(), withTerm(term), withReact(<App />))
 * app.render()
 * ```
 */

import type { ReactElement } from "react"
import React from "react"
import { createAg, type Ag } from "./ag"
import type { Term } from "./ansi/term"
import { ensureDefaultLayoutEngine, isLayoutEngineInitialized } from "./layout-engine"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
} from "@silvery/ag-react/reconciler"
import { TermContext, RuntimeContext, FocusManagerContext } from "@silvery/ag-react/context"
import type { RuntimeContextValue } from "@silvery/ag-react/context"
import { createFocusManager } from "@silvery/ag/focus-manager"
import { createCursorStore, CursorProvider } from "@silvery/ag-react/hooks/useCursor"

// =============================================================================
// Types
// =============================================================================

interface AppWithReactBase {
  ag: Ag
  readonly term: Term
  render(): void
  dispatch(op: { type: string; [key: string]: unknown }): void
  defer(fn: () => void): void
}

// =============================================================================
// Plugin
// =============================================================================

export function withReact(element: ReactElement) {
  return <A extends AppWithReactBase>(app: A) => {
    // Layout engine must be initialized before creating container
    // (createContainer → createRootNode → getLayoutEngine)
    // Call ensureLayoutEngine() before pipe() if not yet initialized.
    if (!isLayoutEngineInitialized()) {
      throw new Error(
        "Layout engine not initialized. Call `await ensureLayoutEngine()` before using withReact().\n" +
          "Example: await ensureLayoutEngine(); const app = pipe(create(), withAg(), withTerm(term), withReact(<App />))",
      )
    }
    const focusManager = createFocusManager()
    const cursorStore = createCursorStore()
    let mounted = true

    // Create reconciler container — owns its own root node
    const container = createContainer(() => {
      // React committed new work — trigger re-render
      if (mounted) {
        app.render()
      }
    })

    const fiberRoot = createFiberRoot(container)

    // Replace ag with one backed by the reconciler's root node
    const reconcilerRoot = getContainerRoot(container)
    const newAg = createAg(reconcilerRoot, { measurer: undefined })
    ;(app as any).ag = newAg

    // Minimal runtime context for useInput/useExit
    const runtimeValue: RuntimeContextValue = {
      on(_event, _handler) {
        return () => {}
      },
      emit() {},
      exit() {
        mounted = false
        reconciler.updateContainer(null, fiberRoot, null, () => {})
      },
    }

    // Wrap element with context providers
    const wrapped = React.createElement(
      CursorProvider,
      { store: cursorStore },
      React.createElement(
        TermContext.Provider,
        { value: app.term },
        React.createElement(
          FocusManagerContext.Provider,
          { value: focusManager },
          React.createElement(RuntimeContext.Provider, { value: runtimeValue }, element),
        ),
      ),
    )

    // Mount React tree synchronously
    reconciler.updateContainerSync(wrapped, fiberRoot, null, null)
    reconciler.flushSyncWork()

    // Register cleanup
    app.defer(() => {
      mounted = false
      reconciler.updateContainer(null, fiberRoot, null, () => {})
    })

    return { ...app, ag: newAg, element, focusManager } as A & {
      readonly element: ReactElement
      readonly focusManager: ReturnType<typeof createFocusManager>
    }
  }
}
