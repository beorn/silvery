// Post km-silvery.plateau-delete-legacy-shims (H6 /big review 2026-04-23):
// `detectColor` and `detectTerminalCaps` are removed — callers consume
// `term.caps` / `term.profile` when a Term is in scope, or call
// `createTerminalProfile()` / `probeTerminalProfile()` one-shot.
//
// Post km-silvery.unicode-plateau Phase 1 (2026-04-23): `detectUnicode` and
// `detectExtendedUnderline` are removed too — their logic moved into the
// profile factory. Consumers read `caps.unicode` / `caps.underlineStyles`
// / `caps.underlineColor` directly. The only narrowly-scoped probes that
// survive are cursor + input, which answer TTY-stream yes/no questions the
// profile can't subsume.
export {
  detectCursor,
  detectInput,
  defaultCaps,
  createTerminalProfile,
  probeTerminalProfile,
} from "@silvery/ansi"
export type {
  TerminalCaps,
  TerminalProfile,
  ColorProvenance,
  TerminalProfileSource,
  TerminalProfileStdout,
  CreateTerminalProfileOptions,
  ProbeTerminalProfileOptions,
} from "@silvery/ansi"

export {
  createBgModeDetector,
  parseBgModeResponse,
  ENABLE_BG_MODE_REPORTING,
  DISABLE_BG_MODE_REPORTING,
} from "@silvery/ansi"
export type { BgModeDetector, BgModeDetectorOptions, BgMode } from "@silvery/ansi"
