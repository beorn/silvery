/**
 * @failure  Development React appends component timing entries on every commit,
 *           retaining native User Timing state for the life of a Silvery host.
 * @level    l2 — fresh Bun children drive the real reconciler without a terminal.
 * @consumer @ag/dutiful-and-maddoc-grow-without-bound
 */
import { describe, expect, test } from "vitest"
import { fileURLToPath } from "node:url"

interface ProbeResult {
  readonly mode: "development" | "production"
  readonly commits: number
  readonly measures: number
  readonly marks: number
}

const probeSource = String.raw`
  const [{ default: React }, { Box, Text }, { createContainer, createFiberRoot, reconciler }, { ensureDefaultLayoutEngine }] = await Promise.all([
    import("react"),
    import("@silvery/ag-react"),
    import("@silvery/ag-react/reconciler"),
    import("@silvery/ag-term/layout-engine"),
  ])

  await ensureDefaultLayoutEngine()
  const container = createContainer(() => {})
  const fiberRoot = createFiberRoot(container)
  const commits = Number(process.env.COMMITS)
  if (!Number.isInteger(commits) || commits < 1) throw new Error("COMMITS must be a positive integer")
  for (let tick = 0; tick < commits; tick++) {
    const rows = Array.from({ length: 200 }, (_, row) =>
      React.createElement(
        Box,
        { key: row, flexDirection: "row" },
        React.createElement(Text, { wrap: "truncate" }, "row " + row + " tick " + tick),
      ),
    )
    reconciler.updateContainerSync(React.createElement(Box, { flexDirection: "column" }, rows), fiberRoot, null, null)
    reconciler.flushSyncWork()
  }

  console.log(JSON.stringify({
    mode: process.env.NODE_ENV,
    commits,
    measures: performance.getEntriesByType("measure").length,
    marks: performance.getEntriesByType("mark").length,
  }))
`

describe("React performance timeline ownership", () => {
  test("development commits keep User Timing entries commit-bounded", async () => {
    const [twoCommits, fortyCommits] = await Promise.all([
      runProbe("development", 2),
      runProbe("development", 40),
    ])

    expect(twoCommits.measures).toBeGreaterThan(0)
    expect(fortyCommits.measures).toBe(twoCommits.measures)
    expect(fortyCommits.marks).toBe(twoCommits.marks)
  })

  test("production remains a zero-entry control", async () => {
    const result = await runProbe("production", 40)

    expect(result.measures).toBe(0)
    expect(result.marks).toBe(0)
  })
})

async function runProbe(mode: ProbeResult["mode"], commits: number): Promise<ProbeResult> {
  const child = Bun.spawn([process.execPath, "-e", probeSource], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: mode,
      COMMITS: String(commits),
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(
      `React performance probe exited ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    )
  }
  const resultLine = stdout.trim().split("\n").at(-1)
  if (resultLine === undefined) {
    throw new Error(`React performance probe returned no result\nstderr:\n${stderr}`)
  }
  return JSON.parse(resultLine) as ProbeResult
}
