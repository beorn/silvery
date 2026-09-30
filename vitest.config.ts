import { defineConfig } from "vitest/config"
import { availableParallelism } from "node:os"

// Standalone test config — km bead @km/all/19772-system-simplification/19780.
// silvery must be testable from a fresh clone (`git clone … && bun install &&
// bun run test`) without the km monorepo's root config. Mirrors the km
// vendor-project knobs silvery's suite depends on:
//   - `server.deps.inline: ["zod"]` — without inlining, zod's ESM/CJS interop
//     under vitest-on-bun yields an undefined namespace (`z.object` TypeError);
//     km carries the same knob for the same reason.
//   - React deduping — the isolated bun store can hand the test renderer and
//     components different React copies (null hooks dispatcher).
// Inside the km monorepo this file is inert: km's vendor project defines its
// own root/config and never reads nested configs.
export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "react-reconciler"],
  },
  test: {
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Never let discovery wander into embedded agent worktrees / debris —
      // stale checkouts there carry pre-deletion copies of test files that
      // false-fail against the current source (SR-7, deletion-wave 21453).
      "**/.claude/**",
      "**/.worktrees/**",
      // Source siblings are dependency inputs, not part of Silvery's suite.
      "**/.ci-siblings/**",
      // Playwright-driven — run via `bun run test:showcase`, not vitest.
      "tests/web/**",
      "tests/site-smoke.test.ts",
      // pty memleak harness needs a serial worker (km runs it in the
      // vendor-serial project); excluded from the parallel standalone run.
      "tests/perf/termless-memleak-harness.test.tsx",
    ],
    setupFiles: ["./tests/vitest.setup.ts"],
    testTimeout: 30_000,
    maxWorkers: Math.max(availableParallelism() - 1, 1),
    server: { deps: { inline: ["zod"] } },
    // vitest-worker infra race, seen only on loaded 2-core CI runners: a
    // console log is still in flight over the worker RPC when the test
    // environment tears down ("Closing rpc while 'onUserConsoleLog' was
    // pending"). All tests have already passed when it fires — it is
    // harness noise, and it failed otherwise-green Tests runs on
    // 2026-07-02 (d53acf56, 960a0a05). ONLY this exact shape is ignored;
    // every other unhandled error stays fatal.
    onUnhandledError(error) {
      if (
        error.name === "EnvironmentTeardownError" &&
        String(error.message).includes("onUserConsoleLog")
      ) {
        return false
      }
    },
  },
})
