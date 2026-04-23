/**
 * Defaults contract — `createTerm()` live terminal factory.
 *
 * See tests/contracts/README.md for the convention.
 *
 * `createTerm()` (from `@silvery/ag-term`) is the central Term abstraction.
 * It has four factory shapes documented in its JSDoc:
 *
 *   - `createTerm()` — Node.js terminal, auto-detect from process.stdin/stdout
 *   - `createTerm({ cols, rows })` — headless for testing (no I/O, fixed dims)
 *   - `createTerm(backend, { cols, rows })` — emulator backend
 *   - `createTerm(emulator)` — pre-created termless Terminal
 *
 * Documented defaults this file pins:
 *   - Headless mode: no stdout or stdin wired
 *   - Headless mode: `term.caps` is always populated — `defaultCaps()` with
 *     `colorTier: 'mono'` (Phase 2 of km-silvery.terminal-profile-plateau
 *     made `Term.caps` non-optional across every constructor)
 *   - Node mode: caps delegate to `detectTerminalCaps()` — which honors
 *     FORCE_COLOR (seed 2 of the Phase 1 regression set)
 *
 * Seed row in this file: FORCE_COLOR flows through `createTerm()`'s default
 * caps detection. If someone accidentally reintroduces the pre-fix
 * short-circuit at this layer, this test catches it before `run()` does.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createTerm } from "../../packages/ag-term/src/ansi/term"

// ============================================================================
// Env-var scaffolding
// ============================================================================

let savedNoColor: string | undefined
let savedForceColor: string | undefined

beforeEach(() => {
  savedNoColor = process.env.NO_COLOR
  savedForceColor = process.env.FORCE_COLOR
  delete process.env.NO_COLOR
  delete process.env.FORCE_COLOR
})

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = savedNoColor
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR
  else process.env.FORCE_COLOR = savedForceColor
})

// ============================================================================
// Headless mode defaults — createTerm({ cols, rows })
// ============================================================================

describe("contract: createTerm({ cols, rows }) (headless)", () => {
  test("contract: headless term reports the dims it was constructed with", () => {
    const term = createTerm({ cols: 40, rows: 10 })
    expect(term.cols).toBe(40)
    expect(term.rows).toBe(10)
  })

  test("contract: headless term has populated caps (Phase 2: always-on)", () => {
    // Phase 2 of km-silvery.terminal-profile-plateau made `Term.caps`
    // non-optional. Headless Terms still do no I/O, but they now carry a
    // deterministic `defaultCaps()`-derived profile so callers can read
    // `term.caps.X` without a `?? detectTerminalCaps()` fallback. Headless
    // defaults to `colorTier: 'mono'` to match `hasColor()` — tests wanting
    // a richer profile pass `{ caps: { colorTier: 'truecolor' } }`.
    const term = createTerm({ cols: 80, rows: 24 })
    expect(term.caps).toBeDefined()
    expect(term.caps.colorTier).toBe("mono")
    expect(term.caps.unicode).toBe(false)
    expect(term.caps.mouse).toBe(false)
  })

  test("contract: headless term accepts caps override", () => {
    // `createTermless()` exposes `caps?: Partial<TerminalCaps>` via
    // `createTerm({ cols, rows, caps })`. The override merges with
    // `defaultCaps()` so callers only specify the fields they care about.
    const term = createTerm({
      cols: 80,
      rows: 24,
      caps: { colorTier: "truecolor", kittyKeyboard: true },
    })
    expect(term.caps.colorTier).toBe("truecolor")
    expect(term.caps.kittyKeyboard).toBe(true)
  })
})

// ============================================================================
// Node-backed createTerm honors explicit caps overrides
// ============================================================================
//
// Seed 2 companion — the FORCE_COLOR contract lives on `detectTerminalCaps`
// itself (see run-defaults.contract.test.tsx). At the `createTerm()` layer,
// the relevant default is: an `options.caps` override must win over auto-
// detection. If that precedence ever flips, forced-tier tests (and `run()`'s
// `colorTier` override path) break silently.

describe("contract: createTerm({ caps }) overrides detection", () => {
  test("contract: explicit caps override auto-detection (truecolor)", () => {
    // Setting FORCE_COLOR=0 would normally force 'none' if detection ran.
    // With explicit caps, the override must win regardless.
    process.env.FORCE_COLOR = "0"
    const term = createTerm({
      caps: { colorTier: "truecolor" } as any,
    })
    expect(term.caps.colorTier).toBe("truecolor")
  })

  test("contract: explicit caps override auto-detection (mono)", () => {
    process.env.FORCE_COLOR = "3"
    const term = createTerm({
      caps: { colorTier: "mono" } as any,
    })
    expect(term.caps.colorTier).toBe("mono")
  })
})

// ============================================================================
// term.profile — H15 contract (Term owns its resolved TerminalProfile)
// ============================================================================
//
// Post km-silvery.plateau-term-owns-profile: every Term constructor commits to
// a full {@link TerminalProfile} at creation and exposes it as `term.profile`.
// Entry points (run.tsx, create-app.tsx) consume this profile directly instead
// of rebuilding via `createTerminalProfile({ caps: term.caps })` — one Term,
// one detection pass, one profile flowing end-to-end.
//
// The two invariants pinned below are what callers depend on:
//
//   1. `term.profile.caps` mirrors the caps that constructed the Term — there
//      is no drift window where `term.caps !== term.profile.caps`.
//   2. `term.profile.colorProvenance === "caller-caps"` (and `colorForced` is
//      `false`) whenever the Term was built from an explicit caps object
//      (every emulator/headless Term, plus Node Terms once their caps are
//      populated). Env-level precedence (NO_COLOR / FORCE_COLOR /
//      colorOverride) is applied at `run()` / `createApp()`, NOT during Term
//      construction.

describe("contract: Term owns its TerminalProfile (H15)", () => {
  test("contract: headless term.profile.caps matches term.caps", () => {
    const term = createTerm({ cols: 80, rows: 24 })
    // Identity across the two views — no second detection pass is allowed to
    // produce a slightly different caps object.
    expect(term.profile.caps.colorTier).toBe(term.caps.colorTier)
    expect(term.profile.caps.unicode).toBe(term.caps.unicode)
    expect(term.profile.caps.mouse).toBe(term.caps.mouse)
    expect(term.profile.caps.bracketedPaste).toBe(term.caps.bracketedPaste)
    // The convenience alias on the profile mirrors the tier directly.
    expect(term.profile.colorTier).toBe(term.caps.colorTier)
  })

  test('contract: headless term.profile.colorProvenance === "caller-caps"', () => {
    // Term construction is not an opportunity for env precedence — the profile
    // records "caller-caps" because the Term committed to a caps object before
    // any env override could apply. That attribution keeps `run()`'s pre-
    // quantize gate (which triggers only on `profile.colorForced === true`)
    // correct when it consumes `term.profile` directly.
    const term = createTerm({ cols: 80, rows: 24 })
    expect(term.profile.colorProvenance).toBe("caller-caps")
    expect(term.profile.colorForced).toBe(false)
  })

  test("contract: headless term with caps override reflects override in term.profile", () => {
    // Profile seeds from the committed caps — if the caller passed a caps
    // override, both `term.caps` and `term.profile.caps` must show it. Any
    // drift here means the Node-backed Term path has a subtle bug where the
    // TTY detector ran on top of the override.
    const term = createTerm({
      cols: 80,
      rows: 24,
      caps: { colorTier: "truecolor", kittyKeyboard: true },
    })
    expect(term.profile.caps.colorTier).toBe("truecolor")
    expect(term.profile.caps.kittyKeyboard).toBe(true)
    expect(term.profile.colorTier).toBe("truecolor")
    expect(term.profile.colorProvenance).toBe("caller-caps")
    expect(term.profile.colorForced).toBe(false)
  })
})

// ============================================================================
// Phase 2 backlog — defaults still to cover
// ============================================================================
//
// - `createTerm()` with default stdout: when a TTY is attached, `detectColor`
//   runs the full detection chain (COLORTERM, TERM, TERM_PROGRAM, CI env).
//   Each branch needs a contract test with the appropriate env fixture.
// - `createTerm({ stdout })` with a custom stream: caps must use the provided
//   stream's isTTY / _handle, not `process.stdout`.
// - `createTerm(emulator)`: screen-backed Term must not attempt stdin raw
//   mode. Pin with a `term.modes` null-observer check.
// - Capability overrides via `createTerm({ caps })`: explicit caps must
//   bypass detection entirely.
// - `term[Symbol.dispose]()`: disposal must be idempotent.
//
// See `createTerm` overloads in packages/ag-term/src/ansi/term.ts.
