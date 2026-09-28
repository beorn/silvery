/**
 * @failure  isTTY reports a non-TTY stream as a TTY because an environment override (FORCE_TTY=1) wins over the
 *           stream, so ANSI control output reaches pipes and files.
 * @level    l1 — pure function over a stand-in stream
 * @consumer vendor/silvery/packages/ag-react/src/ui/wrappers (with-select, with-text-input, wrap-generator)
 * @testonly none
 * @reach none
 *
 * isTTY answers from the stream alone. It used to return true for any stream
 * when FORCE_TTY=1, an undocumented override no caller used (E-1, 25632,
 * @cto ruling on eee820a6); a non-TTY must never report as a TTY.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { isTTY } from "../../packages/ag-react/src/ui/cli/ansi"

const stream = (tty: boolean | undefined) => ({ isTTY: tty }) as unknown as NodeJS.WriteStream

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("isTTY", () => {
  test("follows the stream's isTTY", () => {
    expect(isTTY(stream(true))).toBe(true)
    expect(isTTY(stream(false))).toBe(false)
    expect(isTTY(stream(undefined))).toBe(false)
  })

  test("FORCE_TTY=1 does not make a non-TTY stream a TTY", () => {
    vi.stubEnv("FORCE_TTY", "1")
    expect(isTTY(stream(false))).toBe(false)
  })
})
