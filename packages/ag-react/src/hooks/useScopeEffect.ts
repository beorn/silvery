/**
 * useScopeEffect — `useEffect` that owns a fresh child scope.
 *
 * On each commit (and on dep changes) this hook:
 *   1. creates `child = parent.child()` from the enclosing scope,
 *   2. calls `setup(child)` **after commit** (inside React's effect phase —
 *      never during render),
 *   3. on the next dep-change or unmount, runs the optional cleanup
 *      returned by `setup`, then starts `child[Symbol.asyncDispose]()`.
 *
 * Disposal is fire-and-forget — `useEffect` cleanup must be synchronous, so
 * any rejection from the async dispose is routed through `reportDisposeError`
 * with `{ phase: "react-unmount", scope: child }`. This satisfies proof
 * obligation (e): every fire-and-forget teardown reports exactly once.
 *
 * StrictMode (proof obligation (b)): React invokes the effect twice in dev
 * — mount → unmount → remount. The first mount's `child` is disposed by the
 * cleanup synchronously (the dispose promise is fired; the scope is
 * detached from the parent's `#children` set immediately on completion, and
 * post-dispose `child.use/defer/child` throws `ReferenceError` right away).
 * The second mount then calls `parent.child()` again and gets a brand-new
 * scope with a fresh signal and empty disposer stack.
 *
 * Render-phase rule (proof obligation (a)): the only call that happens
 * during render is `useScope()` (pure context read) and the `useEffect`
 * registration itself. `parent.child()` and `setup(...)` run inside the
 * effect body, which React only schedules after the commit phase.
 */

import { useEffect } from "react"
import type { DependencyList } from "react"
import { reportDisposeError, type Scope } from "@silvery/scope"
import { useScope } from "./useScope"

export type ScopeEffectCleanup = void | (() => void)
export type ScopeEffectSetup = (scope: Scope) => ScopeEffectCleanup

/**
 * Run `setup(childScope)` after commit. On dep change or unmount:
 *
 *   1. run the optional cleanup returned from `setup`,
 *   2. start `childScope[Symbol.asyncDispose]()` (errors → `reportDisposeError`).
 *
 * The scope passed to `setup` is **owned by the effect** — do not pass it
 * to `scope.use(...)` on another scope or store it in a long-lived ref; it
 * is disposed as soon as the effect re-runs or the component unmounts.
 */
export function useScopeEffect(setup: ScopeEffectSetup, deps: DependencyList): void {
  const parent = useScope()

  // `parent` is read from context, so referencing it as a dep is redundant
  // (React infers it), but being explicit makes intent obvious: if the
  // enclosing scope changes (hot-swap, provider rewire), the effect re-owns
  // under the new parent.
  //
  // We deliberately do NOT add `setup` to the deps — callers pass inline
  // closures and shouldn't be forced to memoize. `deps` is the declared
  // dependency set; setup re-runs iff deps change.
  //
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const child = parent.child()
    let userCleanup: (() => void) | undefined
    try {
      const ret = setup(child)
      if (typeof ret === "function") userCleanup = ret
    } catch (err) {
      // Setup threw synchronously. We still own `child`, so dispose it
      // before re-throwing so resources aren't leaked.
      void child[Symbol.asyncDispose]().catch((e) =>
        reportDisposeError(e, { phase: "react-unmount", scope: child }),
      )
      throw err
    }

    return () => {
      // 1) Run user cleanup first — matches React's useEffect contract:
      //    cleanup runs *before* we tear down owned resources, so the user
      //    has a chance to act on still-live handles.
      if (userCleanup) {
        try {
          userCleanup()
        } catch (err) {
          // User-cleanup errors are reported via the same sink, so they
          // don't swallow silently. We continue to dispose the scope.
          reportDisposeError(err, { phase: "react-unmount", scope: child })
        }
      }
      // 2) Fire-and-forget async dispose. React's cleanup must return
      //    void/sync; any rejection surfaces via reportDisposeError.
      void child[Symbol.asyncDispose]().catch((e) =>
        reportDisposeError(e, { phase: "react-unmount", scope: child }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, ...deps])
}
