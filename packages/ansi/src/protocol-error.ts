/**
 * ProtocolError — structured error for terminal protocol parse failures.
 *
 * Used by parsers to signal that input WAS identified as belonging to this
 * protocol (prefix/marker matched) but is malformed in a way the parser
 * cannot recover from (missing terminator, invalid base64, missing required
 * field, etc.).
 *
 * Distinct from a `null` return:
 *
 * - `null` = "no input matched, but input was valid" — the parser does not
 *   recognize this input as belonging to its protocol family at all (no
 *   prefix, no marker). Used by discriminator chains to mean "next parser
 *   please."
 *
 * - `throw ProtocolError` = "this WAS for us but is broken" — the parser
 *   committed to the protocol (prefix matched), then the body failed
 *   validation. Callers should log and continue, NOT crash.
 *
 * Carries structured context so callers can route, dedupe, and log
 * without re-parsing the raw bytes:
 *
 * - `parser` — name of the parser that threw (e.g. "parseClipboardResponse")
 * - `input` — raw input bytes (truncated for safety; full length retained
 *   in `inputLength`)
 * - `reason` — short human-readable description of why-invalid
 *
 * Acceptance for bead `@km/silvery/15127-custom-protocol-implementation/
 * protocol-loud-errors`: parsers must fail loudly on protocol violation
 * instead of silently dropping malformed input.
 *
 * @module
 */

/** Maximum chars of raw input retained on the error (rest is truncated). */
const INPUT_TRUNCATE_LENGTH = 256

/**
 * Structured context attached to a ProtocolError.
 *
 * Truncates `input` to avoid retaining huge payloads on the error object
 * (clipboard responses can be tens of KB). `inputLength` carries the
 * original full length so callers can still tell "the input was huge."
 */
export interface ProtocolErrorContext {
  /** Name of the parser that threw — e.g. "parseClipboardResponse" */
  parser: string
  /** Raw input that failed to parse, possibly truncated */
  input: string
  /** Full length of the original input (before any truncation) */
  inputLength: number
  /** Short human-readable reason why-invalid */
  reason: string
}

/**
 * Thrown by protocol parsers when input is identified as belonging to the
 * protocol but is malformed.
 *
 * Callers (dispatch boundaries in `runtime/input-owner.ts`, `renderer.ts`,
 * and similar) should catch ProtocolError, log via the appropriate logger,
 * and continue — never let a protocol parse error crash the app.
 */
export class ProtocolError extends Error {
  override readonly name = "ProtocolError" as const
  readonly parser: string
  readonly input: string
  readonly inputLength: number
  readonly reason: string

  constructor(opts: { parser: string; input: string; reason: string }) {
    const inputLength = opts.input.length
    const truncated =
      inputLength > INPUT_TRUNCATE_LENGTH
        ? `${opts.input.slice(0, INPUT_TRUNCATE_LENGTH)}…<${inputLength - INPUT_TRUNCATE_LENGTH} more chars>`
        : opts.input
    super(`${opts.parser}: ${opts.reason} (input=${JSON.stringify(truncated)})`)
    this.parser = opts.parser
    this.input = truncated
    this.inputLength = inputLength
    this.reason = opts.reason
  }
}

/** Narrowing helper — true if `err` is a ProtocolError. */
export function isProtocolError(err: unknown): err is ProtocolError {
  return err instanceof ProtocolError
}
