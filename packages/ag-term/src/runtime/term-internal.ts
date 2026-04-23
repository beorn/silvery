/**
 * Internal accessor for raw stdin/stdout on a Term.
 *
 * The public `Term` interface (`../ansi/term.ts`) deliberately omits
 * `stdin` / `stdout`: direct stream access is the leak vector that produced
 * the `wasRaw` race class. Sub-owners (`term.input`, `term.output`,
 * `term.modes`, etc.) are the supported surface for every consumer.
 *
 * At runtime, the raw streams are stored on the term's underlying object
 * under two non-enumerable `Symbol` keys so external `as any` casts cannot
 * reach them — only code that imports `STDIN_SYMBOL` / `STDOUT_SYMBOL` from
 * this module can read them, and the module's import is restricted to
 * silvery's own runtime/ and ansi/ directories by the ownership lint
 * (`packages/km-infra/scripts/check-stdin-ownership.sh` in km).
 *
 * BUT: silvery's own `run()` adapter still has to thread raw streams into the
 * legacy `createApp.run()` option bag (`stdin: ReadStream`, `stdout: WriteStream`)
 * for the emulator + real-terminal paths. Until createApp grows a Term-aware
 * overload, this internal accessor is the single legitimate bridge.
 */

import type { Term } from "../ansi/term"

/** Private symbol key for the raw stdin stream on a term's underlying object. */
export const STDIN_SYMBOL: unique symbol = Symbol.for("silvery.internal.stdin")
/** Private symbol key for the raw stdout stream on a term's underlying object. */
export const STDOUT_SYMBOL: unique symbol = Symbol.for("silvery.internal.stdout")

/**
 * Internal shape — silvery runtime adapters only. Every Term factory in
 * `term.ts` (createNodeTerm, createHeadlessTerm, createBackendTerm) attaches
 * these symbol-keyed fields on the underlying termBase object; they're
 * absent from the public `Term` interface AND from enumerable property
 * inspection so user code can't reach them via `(term as any).stdin`.
 */
export interface TermInternalStreams {
  readonly stdin: NodeJS.ReadStream
  readonly stdout: NodeJS.WriteStream
}

/**
 * Read the raw stdin/stdout streams a Term wraps. ONLY for silvery runtime
 * adapters that bridge to legacy stream-based APIs (createApp.run()'s option
 * bag). User code MUST go through sub-owners — see the Term interface.
 *
 * Each factory attaches the streams under `STDIN_SYMBOL` / `STDOUT_SYMBOL`
 * as non-enumerable own properties on the underlying object.
 */
export function getInternalStreams(term: Term): TermInternalStreams {
  const obj = term as unknown as Record<symbol, unknown>
  return {
    stdin: obj[STDIN_SYMBOL] as NodeJS.ReadStream,
    stdout: obj[STDOUT_SYMBOL] as NodeJS.WriteStream,
  }
}
