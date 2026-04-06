export {
  detectCursor,
  detectInput,
  detectColor,
  detectUnicode,
  detectExtendedUnderline,
  detectTerminalCaps,
  defaultCaps,
} from "@silvery/ansi"
export type { TerminalCaps } from "@silvery/ansi"

export {
  createColorSchemeDetector,
  parseColorSchemeResponse,
  ENABLE_COLOR_SCHEME_REPORTING,
  DISABLE_COLOR_SCHEME_REPORTING,
} from "@silvery/ansi"
export type { ColorSchemeDetector, ColorSchemeDetectorOptions, ColorScheme } from "@silvery/ansi"
