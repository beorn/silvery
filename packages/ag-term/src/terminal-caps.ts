/**
 * Terminal capabilities — types + default fixture.
 *
 * Post km-silvery.plateau-delete-legacy-shims (H6 /big review 2026-04-23):
 * `detectTerminalCaps` is deleted. Use `createTerminalProfile()` or
 * `probeTerminalProfile()` from `@silvery/ansi` for the canonical detection
 * entry point; consume `term.caps` / `term.profile` when a Term is in scope.
 */

export { defaultCaps, type TerminalCaps } from "./ansi/detection"
export {
  createTerminalProfile,
  probeTerminalProfile,
  type TerminalProfile,
  type TerminalProfileSource,
  type CreateTerminalProfileOptions,
  type ProbeTerminalProfileOptions,
} from "@silvery/ansi"
