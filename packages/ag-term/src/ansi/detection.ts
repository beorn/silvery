// Post km-silvery.plateau-delete-legacy-shims (H6 /big review 2026-04-23):
// `detectColor` and `detectTerminalCaps` are removed — callers consume
// `term.caps` / `term.profile` when a Term is in scope, or call
// `createTerminalProfile()` / `probeTerminalProfile()` one-shot. The other
// narrowly-scoped probes (cursor, input, unicode, extended underline) keep
// their dedicated shims: each answers a single yes/no that the broader
// profile factory doesn't subsume.
export {
  detectCursor,
  detectInput,
  detectUnicode,
  detectExtendedUnderline,
  defaultCaps,
  createTerminalProfile,
  probeTerminalProfile,
} from "@silvery/ansi"
export type {
  TerminalCaps,
  TerminalProfile,
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
