/**
 * Shared types for the Design System Storybook.
 */

import type { ColorScheme } from "@silvery/theme"
import type { Theme, ThemeAdjustment } from "@silvery/ansi"

/** A tier controls which color backend is used to render the preview. */
export type Tier = "truecolor" | "256" | "ansi16" | "mono"

export interface StorybookEntry {
  /** Scheme key from builtinPalettes (also used as display name). */
  name: string
  /** Raw ColorScheme (22 input slots). */
  palette: ColorScheme
  /** Truecolor-derived theme for preview rendering. */
  theme: Theme
  /** ansi16-derived theme (paired with tier toggle). */
  themeAnsi16: Theme
  /** Contrast adjustments made by deriveTheme. */
  adjustments: ThemeAdjustment[]
  /** Dark vs light. */
  dark: boolean
}

export type Panel = "browser" | "swatches" | "components" | "compare" | "audit"

/** Panel labels used in the nav bar. */
export const PANEL_LABEL: Record<Panel, string> = {
  browser: "Schemes",
  swatches: "Swatches",
  components: "Components",
  compare: "Compare",
  audit: "Audit",
}

/** Tier labels used in the status bar. */
export const TIER_LABEL: Record<Tier, string> = {
  truecolor: "truecolor (24-bit)",
  "256": "256-color",
  ansi16: "ansi16 (4-bit)",
  mono: "monochrome (attrs)",
}
