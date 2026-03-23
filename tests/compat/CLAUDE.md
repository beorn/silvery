# Compat Tests

Two layers of Ink/Chalk compatibility testing. Layer 1 is authoritative (real upstream tests);
Layer 2 is fast and CI-friendly (auto-generated vitest). Both should be run when changing the
compat layer, but only Layer 2 runs in normal CI.

## Strategy

Ink's test suite uses ava (their test runner) and node-pty (for interactive/PTY tests). We can't
adopt ava wholesale because: (1) it's slow, (2) it requires cloning upstream repos, (3) PTY tests
need node-pty which is a native dependency. So we use a two-layer approach:

- **Layer 1 (ava)**: Clone real Ink/Chalk repos, run their ava suites against our compat layer.
  This is the source of truth. Run it when making compat changes or before releases.
- **Layer 2 (vitest)**: Auto-generated from Ink's ava tests via a codemod (`gen-vitest.ts`).
  Fast, no native deps, runs in CI. Covers the portable subset of Ink's tests — everything
  except files that test ink engine internals (reconciler, render, write-synchronized, etc.)
  that silvery replaces entirely.

**When Ink releases a new version:**

1. Delete `/tmp/silvery-compat/` to re-clone
2. Run `bun run compat` to see what changed in the upstream ava suite
3. Run `bun packages/ink/scripts/gen-vitest.ts` to regenerate vitest tests
4. Fix any new failures, update EXPECTED_FAILURES/RENDER_MODE_FAILURES in gen-vitest.ts
5. Run both layers to verify

## 1. Real Upstream Tests (Layer 1 — authoritative)

Clones the real Ink/Chalk repos and runs their original ava test suites against silvery's compat layer.

```bash
bun run compat           # Both Ink and Chalk
bun run compat:ink       # Ink only
bun run compat:chalk     # Chalk only
```

From km: `bun run test:compat`.

Cached clones at `/tmp/silvery-compat/`. Delete to re-clone. See `packages/ink/scripts/compat-check.ts`.

## 2. Auto-Generated Vitest Tests (Layer 2 — fast, CI)

Auto-generated from Ink's upstream ava test suite via a codemod. Generated tests live in
`tests/compat/ink/generated/` (gitignored — regenerate, don't edit).

```bash
# Generate (clones ink if not cached, transforms tests, writes to generated/)
bun packages/ink/scripts/gen-vitest.ts

# Run
bun vitest run --project vendor vendor/silvery/tests/compat/ink/generated/
bun vitest run --project vendor vendor/silvery/tests/compat/chalk/
```

### What the codemod does

The codemod (`gen-vitest.ts`) transforms ink's ava-based tests to vitest:

- **Ava → vitest**: Wraps tests with an ava-shim (`t.is` → `expect().toBe()`, etc.)
- **Import rewrites**: `ink` → `@silvery/ink/ink`, third-party deps → inline equivalents
- **PTY → in-process**: Converts node-pty interactive tests to run in-process using
  `termFixture()`/`runFixture()` (MockStdin + createStdout mocks). No native deps needed.
- **Fixture conversion**: Transforms ink fixture files (standalone TSX scripts with `render()`
  calls) into importable modules exporting `createFixture(args)` factories
- **Sinon → vitest**: Replaces sinon stubs/spies/FakeTimers with vitest equivalents
- **Known failures**: Marks tests in EXPECTED_FAILURES as `.failing`, RENDER_MODE_FAILURES as
  `.failing` (tests that need interactive render mode not available in test renderer)

### File classification

| Category       | Files                                                                                                                                        | Handling                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Standard tests | 23 files                                                                                                                                     | Direct ava→vitest transform                               |
| PTY tests      | 6 files (hooks-use-input, hooks-use-input-kitty, hooks-use-input-navigation, hooks-use-paste, hooks, exit)                                   | Fixture + termFixture/runFixture in-process conversion    |
| Internal files | 9 files (reconciler, render, write-synchronized, errors, log-update, measure-text, cursor-helpers, kitty-keyboard, alternate-screen-example) | Skipped — test ink engine internals that silvery replaces |

### Key helpers

| File                          | Purpose                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `helpers/ava-shim.ts`         | Ava→vitest bridge (`t.is` → `expect().toBe()`, `.failing` → `.fails()`) |
| `helpers/create-stdout.ts`    | Mock stdout with sinon-compatible spy properties                        |
| `helpers/create-term.ts`      | `termFixture()` and `runFixture()` — in-process PTY replacements        |
| `helpers/render-to-string.ts` | Layout engine init wrapper for renderToString tests                     |

### Expected failures

Two categories in gen-vitest.ts:

- **EXPECTED_FAILURES**: Tests that fail due to intentional silvery behavior differences
  (e.g., silvery maps 0x7F to backspace, Ink maps it to delete) or in-process test limitations
  (e.g., `process.stdout.write` output ordering differs from real PTY)
- **RENDER_MODE_FAILURES**: Tests that need interactive render mode features (error boundary
  behavior, Static component rendering) not available in the test renderer. These pass in
  Layer 1 (real ava + ink's own test runner).

## Current Status

- **Chalk**: 100% compat (32/32 real tests)
- **Ink**: 98.9% strict compat (804 passed, 9 known architectural differences)
- **Vitest**: 34 files generated, 10,361 lines, 21 fixtures (976 lines)

## Updating When Ink Changes

```bash
# 1. Re-clone upstream (delete cache)
rm -rf /tmp/silvery-compat/

# 2. Run Layer 1 to see what changed
bun run compat:ink

# 3. Regenerate Layer 2
bun packages/ink/scripts/gen-vitest.ts

# 4. Run Layer 2 and fix failures
bun vitest run --project vendor vendor/silvery/tests/compat/ink/generated/

# 5. Update EXPECTED_FAILURES / RENDER_MODE_FAILURES in gen-vitest.ts as needed

# 6. Verify both layers
bun run compat && bun vitest run --project vendor vendor/silvery/tests/compat/ink/generated/
```

The generated tests are gitignored. The codemod script + helpers are the source of truth.
Re-running the codemod always produces a fresh set of tests from the latest upstream clone.
