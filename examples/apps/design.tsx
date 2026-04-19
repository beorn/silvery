/**
 * Design — Silvery Design System Workbench
 *
 * The formula explorer for silvery's derivation system.
 *
 *   ANSI 22 palette  →  [derivation formula + global configs]  →  33 design tokens
 *
 * What this tool shows:
 * - Every token with its derivation formula, rationale, and live contrast ratio
 * - Live global config controls (contrast, saturation) that re-derive the theme
 * - Palette picker (detected terminal + all builtin palettes)
 * - Component showcase in the current theme
 * - ANSI 16 degradation preview (which slot each token collapses to)
 *
 * Run: bunx silvery design  (or: bun examples/apps/design.tsx)
 */

import type { JSX } from "react"
import React, { useState, useMemo } from "react"
import {
  render,
  Box,
  Text,
  Muted,
  H1,
  H2,
  H3,
  Strong,
  Small,
  Lead,
  Code,
  Divider,
  ProgressBar,
  Spinner,
  Badge,
  Toggle,
  Link,
  useInput,
  useApp,
  createTerm,
  detectTheme,
  getThemeByName,
  type Key,
  type Theme,
} from "silvery"
import {
  builtinPalettes,
  checkContrast,
  deriveTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  type ColorScheme,
  type ThemeAdjustment,
} from "@silvery/theme"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Design Workbench",
  description: "Formula + tokens + components — explore the derivation system live",
  demo: true,
  features: ["deriveTheme", "contrast", "palettes", "formula rationale", "ANSI 16 preview"],
}

// ============================================================================
// Types
// ============================================================================

interface GlobalConfig {
  contrast: "native" | "comfortable" | "high"
  saturation: "native" | "boost" | "max"
}

interface PaletteEntry {
  name: string
  palette: ColorScheme | null // null = detected terminal theme (no palette)
  preBuiltTheme?: Theme // for detected / ansi16 themes without a palette
}

// ============================================================================
// Formula rationale — one row per derived token
// ============================================================================

interface TokenSpec {
  token: string
  formula: string
  rationale: string
  category: "neutral" | "surface" | "accent" | "status" | "structural" | "input"
}

const TOKEN_SPECS: TokenSpec[] = [
  // Neutrals
  {
    token: "bg",
    formula: "palette.background",
    rationale: "The canvas. Inherits directly from user's terminal.",
    category: "neutral",
  },
  {
    token: "fg",
    formula: "palette.foreground, ensured AA on popoverbg",
    rationale: "Body text. Readable on every surface level.",
    category: "neutral",
  },
  {
    token: "muted",
    formula: "blend(fg, bg, 40%), ensured AA on mutedbg",
    rationale: "Secondary info. Distinct from body but still readable.",
    category: "neutral",
  },
  {
    token: "disabledfg",
    formula: "blend(fg, bg, 50%), ensured DIM(3.0)",
    rationale: "Clearly inert but not invisible.",
    category: "neutral",
  },

  // Surfaces
  {
    token: "surfacebg",
    formula: "blend(bg, fg, 5%)",
    rationale: "Subtle lift from pure bg — perceptible hierarchy without distraction.",
    category: "surface",
  },
  {
    token: "popoverbg",
    formula: "blend(bg, fg, 8%)",
    rationale: "More lift than surfacebg — modals sit above surfaces.",
    category: "surface",
  },
  {
    token: "mutedbg",
    formula: "blend(bg, fg, 4%)",
    rationale: "Slightly less than surfacebg — used for inline code + muted blocks.",
    category: "surface",
  },
  {
    token: "inversebg",
    formula: "blend(fg, bg, 10%)",
    rationale: "Dark inverse that echoes the surface family — for inverted strips (status bar).",
    category: "surface",
  },

  // Accent / primary family
  {
    token: "primary",
    formula: "dark ? yellow : blue, ensured AA",
    rationale: "Warm emphasis on dark, trust-blue on light. Both universally read as 'the color'.",
    category: "accent",
  },
  {
    token: "accent",
    formula: "complement(primary), ensured AA",
    rationale: "Opposite hue — maximum variety with zero configuration.",
    category: "accent",
  },
  {
    token: "secondary",
    formula: "blend(primary, accent, 35%), ensured AA",
    rationale: "Bridges primary and accent — a third color that harmonizes with both.",
    category: "accent",
  },
  {
    token: "info",
    formula: "blend(fg, accent, 50%), ensured AA",
    rationale: "De-saturated accent — informational, less attention-grabbing.",
    category: "accent",
  },
  {
    token: "link",
    formula: "dark ? brightBlue : blue, ensured AA",
    rationale: "Convention. Blue = clickable since 1993.",
    category: "accent",
  },

  // Status
  {
    token: "error",
    formula: "palette.red, ensured AA",
    rationale: "Inherits user's red. Always red across every palette.",
    category: "status",
  },
  {
    token: "warning",
    formula: "palette.yellow, ensured AA",
    rationale: "Inherits user's yellow. Caution is universal.",
    category: "status",
  },
  {
    token: "success",
    formula: "palette.green, ensured AA",
    rationale: "Inherits user's green. Completion is universal.",
    category: "status",
  },

  // Structural
  {
    token: "border",
    formula: "blend(bg, fg, 15%), ensured FAINT(1.5)",
    rationale: "Visible line without shouting. Default box-drawing color.",
    category: "structural",
  },
  {
    token: "inputborder",
    formula: "blend(bg, fg, 25%), ensured CONTROL(3.0)",
    rationale: "More present than border — interactive elements need to announce themselves.",
    category: "input",
  },
  {
    token: "focusborder",
    formula: "= link",
    rationale: "Focus ring matches link color — both signal 'actionable'.",
    category: "input",
  },
]

// ============================================================================
// Config tables (mode → magic numbers)
// ============================================================================

const CONTRAST_TARGETS: Record<
  GlobalConfig["contrast"],
  { body: number; dim: number; faint: number; control: number }
> = {
  native: { body: 4.5, dim: 3.0, faint: 1.5, control: 3.0 },
  comfortable: { body: 5.5, dim: 3.5, faint: 2.0, control: 3.5 },
  high: { body: 7.0, dim: 4.5, faint: 3.0, control: 4.5 },
}

// ============================================================================
// Stage 1 — Palette completion modes (spec → ANSI 22)
// ============================================================================

interface SpecMode {
  name: string
  input: string
  formula: string
  rationale: string
}

const SPEC_MODES: SpecMode[] = [
  {
    name: "inherit-all",
    input: "{}",
    formula: "detectTheme()",
    rationale:
      "No opinion — be the user's terminal. km's default; every slot from the shell palette.",
  },
  {
    name: "brand + inherit",
    input: "{ primary }",
    formula: "{ ...detectTheme(), primary }",
    rationale:
      "Minimal brand touch. Status, neutrals, ANSI 16 all inherit. Respects the user's shell.",
  },
  {
    name: "brand-pair + inherit",
    input: "{ primary, accent }",
    formula: "{ ...detectTheme(), primary, accent }",
    rationale: "Two-color brand. Status + neutrals still inherit.",
  },
  {
    name: "brand-derived",
    input: "{ primary }",
    formula: "{ neutrals from detect(), ANSI 16 = hueRotate(primary, offsets) }",
    rationale:
      "Brand owns the mood. Even red/yellow/green shift to harmonize around the brand hue.",
  },
  {
    name: "semantic override",
    input: "{ red?, green?, yellow?, ... }",
    formula: "{ ...detectTheme(), ...overrides }",
    rationale: "Tweak specific semantics (softer red, warmer green) without changing the feel.",
  },
  {
    name: "full spec",
    input: "{ all 22 colors }",
    formula: "pass through",
    rationale: "For screenshots/marketing where user's terminal must not leak through.",
  },
]

// ============================================================================
// Main component
// ============================================================================

type Section = "spec" | "formula" | "palettes" | "components" | "ansi16"

const SECTIONS: Section[] = ["spec", "formula", "palettes", "components", "ansi16"]

const SECTION_LABELS: Record<Section, string> = {
  spec: "Spec (Stage 1)",
  formula: "Formula (Stage 2)",
  palettes: "Palettes",
  components: "Components",
  ansi16: "ANSI 16",
}

function DesignWorkbench({ entries }: { entries: PaletteEntry[] }) {
  const { exit } = useApp()
  const [section, setSection] = useState<Section>("spec")
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [config, setConfig] = useState<GlobalConfig>({ contrast: "native", saturation: "native" })

  const currentEntry = entries[paletteIndex]!
  const theme = useMemo(() => {
    if (currentEntry.preBuiltTheme) return currentEntry.preBuiltTheme
    if (!currentEntry.palette) return ansi16DarkTheme
    // Note: contrast adjustments not yet wired through deriveTheme config —
    // this still uses the hardcoded constants until Phase 2 lands.
    return deriveTheme(currentEntry.palette, "truecolor")
  }, [currentEntry, config.contrast])

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
      return
    }
    // Section cycling
    if (key.tab) {
      const idx = SECTIONS.indexOf(section)
      setSection(SECTIONS[(idx + 1) % SECTIONS.length]!)
      return
    }
    // Palette navigation
    if (key.downArrow || input === "j") {
      setPaletteIndex((i) => Math.min(i + 1, entries.length - 1))
    }
    if (key.upArrow || input === "k") {
      setPaletteIndex((i) => Math.max(i - 1, 0))
    }
    // Section shortcut keys
    if (input === "1") setSection("spec")
    if (input === "2") setSection("formula")
    if (input === "3") setSection("palettes")
    if (input === "4") setSection("components")
    if (input === "5") setSection("ansi16")
    // Config shortcuts
    if (input === "c") {
      const modes: GlobalConfig["contrast"][] = ["native", "comfortable", "high"]
      const idx = modes.indexOf(config.contrast)
      setConfig({ ...config, contrast: modes[(idx + 1) % modes.length]! })
    }
  })

  return (
    <Box flexDirection="column" height="100%">
      {/* Top bar: section tabs + palette + config */}
      <TopBar section={section} paletteName={currentEntry.name} config={config} />
      <Divider />

      {/* Main content */}
      <Box flexGrow={1} overflow="hidden">
        {section === "spec" && <SpecView />}
        {section === "formula" && <FormulaView theme={theme} config={config} />}
        {section === "palettes" && (
          <PalettesView entries={entries} selectedIndex={paletteIndex} theme={theme} />
        )}
        {section === "components" && <ComponentsView />}
        {section === "ansi16" && <Ansi16View theme={theme} palette={currentEntry.palette} />}
      </Box>

      {/* Footer hints */}
      <Divider />
      <Box paddingX={1} gap={2}>
        <Muted>1-5 or Tab sections</Muted>
        <Muted>j/k palette</Muted>
        <Muted>c contrast</Muted>
        <Muted>q/Esc quit</Muted>
      </Box>
    </Box>
  )
}

// ============================================================================
// Top bar
// ============================================================================

function TopBar({
  section,
  paletteName,
  config,
}: {
  section: Section
  paletteName: string
  config: GlobalConfig
}) {
  return (
    <Box paddingX={1} gap={2}>
      {SECTIONS.map((s, i) => (
        <Text key={s} color={s === section ? "$primary" : "$muted"} bold={s === section}>
          {i + 1}. {SECTION_LABELS[s]}
        </Text>
      ))}
      <Box flexGrow={1} />
      <Muted>palette:</Muted>
      <Strong>{paletteName}</Strong>
      <Muted>contrast:</Muted>
      <Strong>{config.contrast}</Strong>
    </Box>
  )
}

// ============================================================================
// Spec view — Stage 1 palette completion modes
// ============================================================================

function SpecView() {
  return (
    <Box flexDirection="column" flexGrow={1} overflow="scroll" paddingX={1}>
      <H2>Stage 1 — Palette Completion</H2>
      <Muted>
        Input spec → ANSI 22 palette. Six modes, each with its own formula and rationale.
      </Muted>
      <Box height={1} />

      {SPEC_MODES.map((m) => (
        <Box key={m.name} flexDirection="column" marginBottom={1} paddingX={1}>
          <Box gap={1}>
            <Box width={22}>
              <Text bold color="$primary">
                {m.name}
              </Text>
            </Box>
            <Box width={28}>
              <Code>{m.input}</Code>
            </Box>
            <Box flexGrow={1}>
              <Muted>{m.formula}</Muted>
            </Box>
          </Box>
          <Box paddingLeft={22}>
            <Small>{m.rationale}</Small>
          </Box>
        </Box>
      ))}

      <Box height={1} />
      <H3>Stage 1 today</H3>
      <Box paddingX={1} flexDirection="column">
        <Text>
          Only <Code>inherit-all</Code> and <Code>full spec</Code> are implemented.{" "}
          <Muted>(via detectTheme() and builtinPalettes)</Muted>
        </Text>
        <Text>
          Phase 2: implement <Code>PaletteSpec</Code> + <Code>completePalette(spec)</Code> for the
          other modes.
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Formula view — the heart of the workbench
// ============================================================================

function FormulaView({ theme, config }: { theme: Theme; config: GlobalConfig }) {
  const targets = CONTRAST_TARGETS[config.contrast]

  // Group tokens by category
  const categories: TokenSpec["category"][] = [
    "neutral",
    "surface",
    "accent",
    "status",
    "structural",
    "input",
  ]

  return (
    <Box flexDirection="column" flexGrow={1} overflow="scroll" paddingX={1}>
      <H2>Derivation Formula</H2>
      <Muted>Each token is derived from the 22-color palette. Formulas below.</Muted>
      <Box height={1} />

      {categories.map((cat) => (
        <Box key={cat} flexDirection="column" marginBottom={1}>
          <H3>{cat.toUpperCase()}</H3>
          {TOKEN_SPECS.filter((t) => t.category === cat).map((spec) => (
            <TokenRow key={spec.token} spec={spec} theme={theme} targets={targets} />
          ))}
        </Box>
      ))}
    </Box>
  )
}

function TokenRow({
  spec,
  theme,
  targets,
}: {
  spec: TokenSpec
  theme: Theme
  targets: { body: number; dim: number; faint: number; control: number }
}) {
  const color = (theme as unknown as Record<string, string | undefined>)[spec.token]
  const bgColor = theme.bg
  const result = color && bgColor ? checkContrast(color, bgColor) : null

  // Pick target based on category
  const targetRatio =
    spec.category === "structural"
      ? targets.faint
      : spec.category === "input"
        ? targets.control
        : spec.category === "neutral" && spec.token === "disabledfg"
          ? targets.dim
          : targets.body

  const passesTarget = result ? result.ratio >= targetRatio : true

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1}>
        {/* Swatch + hex */}
        <Box width={14}>
          <Text color={color ?? "$muted"} bold>
            {spec.token.padEnd(12)}
          </Text>
        </Box>
        <Box width={10}>
          <Code>{color ?? "—"}</Code>
        </Box>
        {/* Contrast readout */}
        <Box width={20}>
          {result ? (
            <Text color={passesTarget ? "$success" : "$error"}>
              {result.ratio.toFixed(2)}:1 vs bg (target {targetRatio})
            </Text>
          ) : (
            <Muted>—</Muted>
          )}
        </Box>
        {/* Formula */}
        <Box flexGrow={1}>
          <Muted>{spec.formula}</Muted>
        </Box>
      </Box>
      <Box paddingLeft={14}>
        <Small>{spec.rationale}</Small>
      </Box>
    </Box>
  )
}

// ============================================================================
// Palettes view
// ============================================================================

function MiniSwatch({ palette }: { palette: ColorScheme }) {
  return (
    <Text>
      <Text color={palette.red}>{"█"}</Text>
      <Text color={palette.yellow}>{"█"}</Text>
      <Text color={palette.green}>{"█"}</Text>
      <Text color={palette.blue}>{"█"}</Text>
    </Text>
  )
}

function PalettesView({
  entries,
  selectedIndex,
  theme,
}: {
  entries: PaletteEntry[]
  selectedIndex: number
  theme: Theme
}) {
  return (
    <Box flexDirection="row" flexGrow={1} gap={1}>
      {/* List */}
      <Box flexDirection="column" width={30} overflow="scroll" scrollTo={selectedIndex}>
        {entries.map((e, i) => (
          <Box key={e.name} gap={1}>
            <Text inverse={i === selectedIndex}>
              {i === selectedIndex ? "▸" : " "} {e.name.padEnd(18)}
            </Text>
            {e.palette ? <MiniSwatch palette={e.palette} /> : <Muted>—</Muted>}
          </Box>
        ))}
      </Box>
      {/* Preview (truecolor theme) */}
      <Box flexGrow={1} flexDirection="column" overflow="scroll" paddingX={1}>
        <H2>{entries[selectedIndex]?.name}</H2>
        <Muted>
          bg {theme.bg} · fg {theme.fg}
        </Muted>
        <Box height={1} />
        {/* Show each accent/status color */}
        <Box flexDirection="column" gap={0}>
          {[
            "primary",
            "accent",
            "secondary",
            "info",
            "success",
            "warning",
            "error",
            "muted",
            "link",
          ].map((t) => {
            const c = (theme as unknown as Record<string, string | undefined>)[t]
            return (
              <Box key={t} gap={1}>
                <Box width={12}>
                  <Text color={c}>{t}</Text>
                </Box>
                <Code>{c ?? "—"}</Code>
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Components view
// ============================================================================

function ComponentsView() {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="scroll" gap={1}>
      <H2>Component Showcase</H2>
      <Muted>Components consume tokens — changing the palette above updates everything here.</Muted>

      <Box flexDirection="column">
        <H3>Typography</H3>
        <Box flexDirection="column" paddingLeft={1}>
          <H1>H1 Page Title</H1>
          <H2>H2 Section</H2>
          <H3>H3 Subsection</H3>
          <Lead>Lead — introductory italic text</Lead>
          <Text>Body paragraph text</Text>
          <Muted>Muted — secondary info</Muted>
          <Small>Small — fine print</Small>
          <Text>
            <Strong>Strong</Strong> · <Code>inline code</Code> ·{" "}
            <Link href="https://silvery.dev">a link</Link>
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <H3>Badges + Progress</H3>
        <Box flexDirection="column" paddingLeft={1} gap={1}>
          <Box gap={1}>
            <Badge label="default" variant="default" />
            <Badge label="primary" variant="primary" />
            <Badge label="success" variant="success" />
            <Badge label="warning" variant="warning" />
            <Badge label="error" variant="error" />
          </Box>
          <Box gap={2}>
            <Box width={16}>
              <ProgressBar value={0.65} />
            </Box>
            <Spinner />
            <Toggle value={true} onChange={() => {}} label="Enabled" />
            <Toggle value={false} onChange={() => {}} label="Disabled" />
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column">
        <H3>Surfaces</H3>
        <Box flexDirection="column" paddingLeft={1} gap={1}>
          <Box backgroundColor="$surfacebg" paddingX={1} paddingY={1}>
            <Text color="$surface">Surface — blend(bg, fg, 5%)</Text>
          </Box>
          <Box backgroundColor="$popoverbg" paddingX={1} paddingY={1}>
            <Text color="$popover">Popover — blend(bg, fg, 8%)</Text>
          </Box>
          <Box backgroundColor="$inversebg" paddingX={1} paddingY={1}>
            <Text color="$inverse">Inverse — status bar family</Text>
          </Box>
          <Box borderStyle="single" borderColor="$border" paddingX={1}>
            <Text>Box with $border — blend 15% ensured FAINT</Text>
          </Box>
          <Box borderStyle="single" borderColor="$inputborder" paddingX={1}>
            <Text>Box with $inputborder — blend 25% ensured CONTROL</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// ANSI 16 degradation view
// ============================================================================

function Ansi16View({ theme, palette }: { theme: Theme; palette: ColorScheme | null }) {
  if (!palette) {
    return (
      <Box padding={1}>
        <Muted>ANSI 16 preview requires a palette — pick one from the Palettes tab.</Muted>
      </Box>
    )
  }

  const ansiSlots: Array<[string, string]> = [
    ["black", palette.black],
    ["red", palette.red],
    ["green", palette.green],
    ["yellow", palette.yellow],
    ["blue", palette.blue],
    ["magenta", palette.magenta],
    ["cyan", palette.cyan],
    ["white", palette.white],
    ["brightBlack", palette.brightBlack],
    ["brightRed", palette.brightRed],
    ["brightGreen", palette.brightGreen],
    ["brightYellow", palette.brightYellow],
    ["brightBlue", palette.brightBlue],
    ["brightMagenta", palette.brightMagenta],
    ["brightCyan", palette.brightCyan],
    ["brightWhite", palette.brightWhite],
  ]

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="scroll" gap={1}>
      <H2>ANSI 16 Degradation Preview</H2>
      <Muted>
        When the terminal only supports 16 colors, truecolor tokens collapse to the nearest slot.
      </Muted>
      <Small>
        Collisions (multiple tokens mapping to the same slot) are accepted as graceful degradation.
      </Small>

      <Box flexDirection="column">
        <H3>The 16 slots</H3>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {ansiSlots.map(([name, hex]) => (
            <Box key={name} gap={1}>
              <Text color={hex}>{"██"}</Text>
              <Muted>{name}</Muted>
            </Box>
          ))}
        </Box>
      </Box>

      <Box flexDirection="column">
        <H3>Collision preview (TODO)</H3>
        <Muted>Phase 2 will show: each token → nearest ANSI slot → flag collisions.</Muted>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main entry
// ============================================================================

export async function main(): Promise<void> {
  // Detect terminal palette BEFORE entering alternate screen
  const detectedTheme = await detectTheme()

  const entries: PaletteEntry[] = [
    { name: "Detected", palette: null, preBuiltTheme: detectedTheme },
    { name: "ANSI 16 Dark", palette: null, preBuiltTheme: ansi16DarkTheme },
    { name: "ANSI 16 Light", palette: null, preBuiltTheme: ansi16LightTheme },
    ...Object.entries(builtinPalettes).map(([name, palette]) => ({ name, palette })),
  ]

  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="1-4 sections · j/k palette · c contrast · q quit">
      <DesignWorkbench entries={entries} />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

// Run directly: `bun examples/apps/design.tsx`
if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
