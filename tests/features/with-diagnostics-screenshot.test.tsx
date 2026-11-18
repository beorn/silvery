/**
 * @failure A withDiagnostics failure screenshot is written to a fixed /tmp/silvery-diagnostics instead of the caller's temporary directory, or is written when capture was never asked for.
 * @level l2
 * @consumer withDiagnostics captureOnFailure (packages/ag-term/src/plugins/with-diagnostics.ts); @i/1-instruments/31167-one-logging-path temporary-writer ruling C
 * @testonly none
 *
 * Failure screenshots stay opt-in: captureOnFailure defaults to false. When
 * captured with no screenshotDir they land in silvery-diagnostics/ under the
 * platform temporary directory (os.tmpdir(), which honours TMPDIR), an explicit
 * screenshotDir still wins, and the thrown diagnostic names the file actually
 * written. The failure is a real one: a cursor command whose action changes
 * the screen fails the stability check, which is when the plugin captures.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRenderer } from "@silvery/test"
import { Text } from "silvery"
import { type Command, type CommandDef, withCommands } from "@silvery/commands/with-commands"
import { type DiagnosticOptions, withDiagnostics } from "@silvery/ag-term/plugins/with-diagnostics"

/**
 * A capture needs the declared Chromium from the CODE flake devshell
 * (PLAYWRIGHT_BROWSERS_PATH + FONTCONFIG_FILE), as screenshot-geometry does.
 * Without it the capture cases would fail on a missing browser, so they say so.
 */
const declaredBrowserEnv = Boolean(
  process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.FONTCONFIG_FILE,
)
if (!declaredBrowserEnv) {
  console.warn(
    "withDiagnostics screenshots: capture cases skipped — needs the declared Chromium from the CODE flake devshell (PLAYWRIGHT_BROWSERS_PATH, FONTCONFIG_FILE)",
  )
}

const SCREENSHOT = "fail-cursor_down-stability.png"
const roots: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh directory standing in for the caller's temporary root; afterEach removes it. */
function callerTmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "silvery-diagnostics-tmpdir-"))
  roots.push(dir)
  return dir
}

/**
 * A screen whose cursor move changes it, so the stability check fails for
 * real: the failure on which withDiagnostics captures a screenshot.
 */
function movingScreen() {
  const app = createRenderer({ cols: 20, rows: 2 })(<Text>before</Text>)
  const down: CommandDef<undefined, "move"> = {
    id: "cursor_down",
    name: "Down",
    description: "Move the cursor down",
    execute: () => "move",
  }
  return withCommands(app, {
    registry: { get: (id) => (id === down.id ? down : undefined), getAll: () => [down] },
    getContext: () => undefined,
    handleAction: () => app.rerender(<Text>after</Text>),
  })
}

type MovingScreen = ReturnType<typeof movingScreen>

/**
 * Start the screenshot browser before the test points TMPDIR at its root.
 * Playwright keeps its launch directories under os.tmpdir() until the browser
 * closes, and unmount() does not wait for that, so they stay out of the root
 * afterEach removes. Chromium's font cache follows XDG_CACHE_HOME, so it lands
 * in the root instead of the test HOME.
 */
async function startScreenshotBrowser(screen: MovingScreen, root: string): Promise<void> {
  vi.stubEnv("XDG_CACHE_HOME", join(root, "cache"))
  await screen.screenshot()
}

/** Run the cursor move under withDiagnostics and return the stability diagnostic it throws. */
async function cursorMoveDiagnostic(
  screen: MovingScreen,
  options: DiagnosticOptions,
): Promise<Error> {
  const driver = withDiagnostics(screen, {
    checkIncremental: false,
    checkReplay: false,
    checkLayout: false,
    ...options,
  })
  const error = await (driver.cmd.cursor_down as Command)().then(
    () => undefined,
    (e: unknown) => e,
  )
  if (!(error instanceof Error)) {
    throw new Error("the cursor move did not fail its stability check")
  }
  expect(error.message).toContain(
    "SILVERY_DIAGNOSTIC: Content changed after cursor move cursor_down",
  )
  return error
}

describe("withDiagnostics failure screenshots", () => {
  test("captureOnFailure stays off by default: a failure writes no screenshot", async () => {
    const root = callerTmpRoot()
    vi.stubEnv("TMPDIR", root)
    using screen = movingScreen()
    const error = await cursorMoveDiagnostic(screen, {})
    expect(error.message).not.toContain("Screenshot saved")
    expect(existsSync(join(root, "silvery-diagnostics"))).toBe(false)
  })

  test.skipIf(!declaredBrowserEnv)(
    "with no screenshotDir, the screenshot lands in silvery-diagnostics under the caller's TMPDIR",
    async () => {
      const root = callerTmpRoot()
      using screen = movingScreen()
      await startScreenshotBrowser(screen, root)
      vi.stubEnv("TMPDIR", root)
      const expected = join(root, "silvery-diagnostics", SCREENSHOT)
      const error = await cursorMoveDiagnostic(screen, { captureOnFailure: true })
      expect(error.message).toContain(`Screenshot saved: ${expected}`)
      expect(readFileSync(expected).subarray(1, 4).toString()).toBe("PNG")
    },
  )

  test.skipIf(!declaredBrowserEnv)("an explicit screenshotDir still wins over TMPDIR", async () => {
    const root = callerTmpRoot()
    using screen = movingScreen()
    await startScreenshotBrowser(screen, root)
    vi.stubEnv("TMPDIR", root)
    const explicitDir = join(root, "explicit-shots")
    const expected = join(explicitDir, SCREENSHOT)
    const error = await cursorMoveDiagnostic(screen, {
      captureOnFailure: true,
      screenshotDir: explicitDir,
    })
    expect(error.message).toContain(`Screenshot saved: ${expected}`)
    expect(existsSync(expected)).toBe(true)
    expect(existsSync(join(root, "silvery-diagnostics"))).toBe(false)
  })
})
