/**
 * @fakes @silvery/ag-term
 *
 * A real headless {@link Term} for tests that read only `caps` and `size`:
 * built through the runtime's own `createTerm({ cols, rows, caps })`, so every
 * field is the real type — a member added to `Term` fails to compile here
 * rather than reaching a test as `undefined`, and no cast stands in for the
 * contract.
 *
 * `caps` is a {@link Partial} `<TerminalCaps>` overlay on the headless defaults
 * (mono colour, no input); name only the flags the test's subject reads.
 */
import type { TerminalCaps } from "@silvery/ansi"
import { createTerm, type Term } from "../ansi/term.ts"

export type FakeTermOptions = {
  /** Columns. Default 80. */
  readonly cols?: number
  /** Rows. Default 24. */
  readonly rows?: number
  /** Overlay on the headless defaults; only the flags a test reads need naming. */
  readonly caps?: Partial<TerminalCaps>
}

export function createFakeTerm(options: FakeTermOptions = {}): Term {
  return createTerm({ cols: options.cols ?? 80, rows: options.rows ?? 24, caps: options.caps })
}
