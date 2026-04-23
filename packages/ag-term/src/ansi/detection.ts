export {
  detectCursor,
  detectInput,
  detectColor,
  detectUnicode,
  detectExtendedUnderline,
  detectTerminalCaps,
  defaultCaps,
  createTerminalProfile,
} from "@silvery/ansi"
export type {
  TerminalCaps,
  TerminalProfile,
  TerminalProfileSource,
  TerminalProfileStdout,
  CreateTerminalProfileOptions,
} from "@silvery/ansi"

export {
  createBgModeDetector,
  parseBgModeResponse,
  ENABLE_BG_MODE_REPORTING,
  DISABLE_BG_MODE_REPORTING,
} from "@silvery/ansi"
export type { BgModeDetector, BgModeDetectorOptions, BgMode } from "@silvery/ansi"
