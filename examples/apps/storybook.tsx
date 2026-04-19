/**
 * Design System Storybook
 *
 * Interactive dogfood for the silvery design system.
 *
 *   - Scheme browser — navigate all 84 bundled palettes
 *   - Swatches — 22 input slots + 33 derived Theme tokens with hex values
 *   - Components — every canonical silvery component under the active theme
 *   - Compare — split view showing two schemes side-by-side
 *   - Audit — validateThemeInvariants(wcag=true), fingerprintMatch, contrast adjustments
 *   - Tier toggle — truecolor / 256 / ansi16 / mono (pre-quantized, zero-latency)
 *
 * Bead: km-silvery.theme-storybook
 *
 * Run:
 *   bun examples/apps/storybook.tsx
 */

import React, { useMemo, useState } from "react"
import {
  Box,
  Text,
  Muted,
  Small,
  Kbd,
  Divider,
  ThemeProvider,
  render,
  createTerm,
  useInput,
  useApp,
  H1,
  H2,
  type Key,
} from "silvery"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"
import type { Panel, Tier } from "./storybook/types"
import { PANEL_LABEL, TIER_LABEL } from "./storybook/types"
import { buildEntries } from "./storybook/data"
import { SchemeBrowser } from "./storybook/scheme-browser"
import { SlotSwatches, TokenSwatches } from "./storybook/swatches"
import { ComponentShowcase } from "./storybook/components-showcase"
import { AuditPanel } from "./storybook/audit"
import { CompareView } from "./storybook/compare"
import { buildTierView } from "./storybook/tier"

export const meta: ExampleMeta = {
  name: "Design System Storybook",
  description: "84 schemes, 22 slots, 33 tokens, 4 tiers — interactive dogfood",
  demo: true,
  features: [
    "builtinPalettes",
    "deriveTheme",
    "validateThemeInvariants",
    "fingerprintMatch",
    "deriveMonochromeTheme",
    "ThemeProvider",
  ],
}

// ----------------------------------------------------------------------------
// Panel router
// ----------------------------------------------------------------------------

const PANEL_ORDER: Panel[] = ["browser", "swatches", "components", "compare", "audit"]
const TIER_ORDER: Tier[] = ["truecolor", "256", "ansi16", "mono"]

function NavBar({ panel }: { panel: Panel }) {
  return (
    <Box paddingX={1} gap={1}>
      {PANEL_ORDER.map((p, i) => {
        const active = p === panel
        return (
          <React.Fragment key={p}>
            <Text color={active ? "$primary" : undefined} bold={active} inverse={active}>
              {` ${i + 1} ${PANEL_LABEL[p]} `}
            </Text>
          </React.Fragment>
        )
      })}
    </Box>
  )
}

function StatusBar({
  panel,
  tier,
  schemeName,
  secondaryName,
  dark,
}: {
  panel: Panel
  tier: Tier
  schemeName: string
  secondaryName?: string
  dark: boolean
}) {
  return (
    <Box paddingX={1} gap={1}>
      <Muted>scheme</Muted>
      <Text bold color="$primary">
        {schemeName}
      </Text>
      {secondaryName ? (
        <>
          <Muted>vs</Muted>
          <Text bold color="$accent">
            {secondaryName}
          </Text>
        </>
      ) : null}
      <Text>·</Text>
      <Muted>{dark ? "dark" : "light"}</Muted>
      <Text>·</Text>
      <Muted>tier</Muted>
      <Text bold color="$success">
        {TIER_LABEL[tier]}
      </Text>
      <Text>·</Text>
      <Muted>panel</Muted>
      <Text bold color="$info">
        {PANEL_LABEL[panel]}
      </Text>
    </Box>
  )
}

/**
 * One-line banner describing how the user's actual terminal scheme was
 * detected. Always rendered so the feature is discoverable even when
 * detection failed or returned nothing.
 */
function DetectedLine({ detected }: { detected?: DetectedInfo | null }) {
  if (!detected) {
    return (
      <Box paddingX={1} gap={1}>
        <Muted>detected</Muted>
        <Muted>(detection unavailable)</Muted>
      </Box>
    )
  }
  const confidencePct = Math.round(detected.confidence * 100)
  return (
    <Box paddingX={1} gap={1}>
      <Muted>detected</Muted>
      {detected.source === "fingerprint" && detected.matchedName ? (
        <>
          <Text bold color="$accent">
            {detected.matchedName}
          </Text>
          <Muted>
            ({detected.source} · {confidencePct}%)
          </Muted>
        </>
      ) : detected.source === "probed" ? (
        <>
          <Muted>probed OSC palette — no catalog match</Muted>
        </>
      ) : detected.source === "override" ? (
        <>
          <Muted>override ({detected.matchedName ?? "custom"})</Muted>
        </>
      ) : (
        <>
          <Muted>fallback ({detected.matchedName ?? "default"})</Muted>
        </>
      )}
    </Box>
  )
}

function Legend({ panel }: { panel: Panel }) {
  return (
    <Box paddingX={1} gap={1} flexWrap="wrap">
      <Muted>
        <Kbd>1..5</Kbd> panel
      </Muted>
      <Muted>
        <Kbd>j/k</Kbd> scheme
      </Muted>
      <Muted>
        <Kbd>t</Kbd> tier
      </Muted>
      {panel === "compare" ? (
        <>
          <Muted>
            <Kbd>h/l</Kbd> switch pane
          </Muted>
          <Muted>
            <Kbd>J/K</Kbd> ±10
          </Muted>
        </>
      ) : (
        <>
          <Muted>
            <Kbd>h/l</Kbd> prev/next panel
          </Muted>
          <Muted>
            <Kbd>c</Kbd> compare
          </Muted>
        </>
      )}
      <Muted>
        <Kbd>g/G</Kbd> top/bottom
      </Muted>
      <Muted>
        <Kbd>q</Kbd> quit
      </Muted>
    </Box>
  )
}

// ----------------------------------------------------------------------------
// Main app
// ----------------------------------------------------------------------------

/** Detected scheme metadata (subset of DetectSchemeResult — just what the UI needs). */
export interface DetectedInfo {
  source: "probed" | "fingerprint" | "fallback" | "override" | "bg-mode"
  confidence: number
  matchedName?: string
}

interface StorybookProps {
  entries: ReturnType<typeof buildEntries>
  /** Optional — if null, detection was skipped or failed; banner omits the line. */
  detected?: DetectedInfo | null
}

export function Storybook({ entries, detected }: StorybookProps) {
  const { exit } = useApp()
  const [panel, setPanel] = useState<Panel>("browser")
  const [tier, setTier] = useState<Tier>("truecolor")
  // Auto-select the detected catalog match on first render, so the storybook
  // opens on the user's actual terminal scheme. Falls back to index 0 when
  // detection failed or matched nothing.
  const initialIdx = useMemo(() => {
    const name = detected?.matchedName
    if (!name) return 0
    const i = entries.findIndex((e) => e.name === name)
    return i >= 0 ? i : 0
  }, [detected?.matchedName, entries])
  const [primaryIdx, setPrimaryIdx] = useState(initialIdx)
  const [secondaryIdx, setSecondaryIdx] = useState(
    Math.min(initialIdx === 0 ? 1 : 0, entries.length - 1),
  )
  const [activePane, setActivePane] = useState<"left" | "right">("left")

  const primary = entries[primaryIdx]!
  const secondary = entries[secondaryIdx]!

  // Pre-compute the tier view for the active primary scheme. The compare
  // panel uses each entry's own truecolor theme via ThemeProvider — tier
  // toggling intentionally does not apply in compare mode.
  const primaryTierView = useMemo(
    () => buildTierView(primary.palette, tier),
    [primary.palette, tier],
  )

  function stepScheme(delta: number) {
    const update = (i: number) => Math.max(0, Math.min(entries.length - 1, i + delta))
    if (panel === "compare" && activePane === "right") {
      setSecondaryIdx(update)
    } else {
      setPrimaryIdx(update)
    }
  }

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
      return
    }
    if (input === "1") return setPanel("browser")
    if (input === "2") return setPanel("swatches")
    if (input === "3") return setPanel("components")
    if (input === "4") return setPanel("compare")
    if (input === "5") return setPanel("audit")
    if (input === "c") return setPanel(panel === "compare" ? "browser" : "compare")
    if (input === "t") {
      const next = TIER_ORDER[(TIER_ORDER.indexOf(tier) + 1) % TIER_ORDER.length]!
      return setTier(next)
    }
    if (input === "T") {
      const idx = TIER_ORDER.indexOf(tier)
      const prev = TIER_ORDER[(idx - 1 + TIER_ORDER.length) % TIER_ORDER.length]!
      return setTier(prev)
    }
    if (input === "j" || key.downArrow) return stepScheme(1)
    if (input === "k" || key.upArrow) return stepScheme(-1)
    if (input === "J") return stepScheme(10)
    if (input === "K") return stepScheme(-10)
    if (input === "g") {
      if (panel === "compare" && activePane === "right") return setSecondaryIdx(0)
      return setPrimaryIdx(0)
    }
    if (input === "G") {
      if (panel === "compare" && activePane === "right") return setSecondaryIdx(entries.length - 1)
      return setPrimaryIdx(entries.length - 1)
    }
    if (panel === "compare") {
      // In compare mode h/l switch the active pane (compare's own semantics).
      if (input === "h") return setActivePane("left")
      if (input === "l") return setActivePane("right")
    } else {
      // Outside compare, h/l cycle panels (prev/next).
      if (input === "h") {
        const idx = PANEL_ORDER.indexOf(panel)
        return setPanel(PANEL_ORDER[(idx - 1 + PANEL_ORDER.length) % PANEL_ORDER.length]!)
      }
      if (input === "l") {
        const idx = PANEL_ORDER.indexOf(panel)
        return setPanel(PANEL_ORDER[(idx + 1) % PANEL_ORDER.length]!)
      }
    }
  })

  return (
    <Box flexDirection="column" height="100%" padding={1}>
      {/* Detected-scheme banner — topmost, outside the flexGrow area so the
          viewport can't hide it behind a shifted scheme list. Always visible. */}
      <DetectedLine detected={detected} />
      <NavBar panel={panel} />
      <Divider />
      <Box flexGrow={1} flexDirection="row" gap={1} overflow="hidden">
        {panel === "compare" ? (
          <CompareView left={primary} right={secondary} activePane={activePane} />
        ) : (
          <>
            <SchemeBrowser
              entries={entries}
              selectedIndex={primaryIdx}
              secondaryIndex={panel === "browser" ? undefined : undefined}
            />
            <PanelBody panel={panel} primary={primary} tier={tier} tierView={primaryTierView} />
          </>
        )}
      </Box>
      <Divider />
      <StatusBar
        panel={panel}
        tier={tier}
        schemeName={primary.name}
        secondaryName={panel === "compare" ? secondary.name : undefined}
        dark={primary.dark}
      />
      <Legend panel={panel} />
    </Box>
  )
}

// ----------------------------------------------------------------------------
// Right-hand panel body (everything except compare)
// ----------------------------------------------------------------------------

interface PanelBodyProps {
  panel: Exclude<Panel, "compare">
  primary: ReturnType<typeof buildEntries>[number]
  tier: Tier
  tierView: ReturnType<typeof buildTierView>
}

function PanelBody({ panel, primary, tier, tierView }: PanelBodyProps) {
  // In mono tier, skip ThemeProvider so Text renders with the terminal's
  // native fg/bg — the real "no color" experience. For every other tier we
  // use the pre-quantized theme so swatches look right at that capability.
  const body = (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" overflow="scroll">
      <Box paddingX={1} flexDirection="column">
        <Box gap={1}>
          <H1>{primary.name}</H1>
          <Muted>{primary.dark ? "(dark)" : "(light)"}</Muted>
        </Box>
        <Small>
          <Muted>{tierView.description}</Muted>
        </Small>
      </Box>
      <Divider />
      {panel === "browser" ? (
        <OverviewPanel primary={primary} tier={tier} />
      ) : panel === "swatches" ? (
        <Box flexDirection="column">
          <SlotSwatches palette={primary.palette} />
          <Divider />
          <TokenSwatches theme={tierView.theme} />
        </Box>
      ) : panel === "components" ? (
        <ComponentShowcase interactive={false} />
      ) : panel === "audit" ? (
        <AuditPanel
          name={primary.name}
          palette={primary.palette}
          theme={primary.theme}
          adjustments={primary.adjustments}
          monoAttrs={tier === "mono" ? tierView.monoAttrs : null}
        />
      ) : null}
    </Box>
  )

  if (tierView.monochrome) {
    // Mono tier: don't wrap in ThemeProvider so all `$tokens` fall back to
    // defaults (no color). Real silvery apps would additionally consult
    // deriveMonochromeTheme to apply attrs — the audit panel exposes that map.
    return body
  }
  return (
    <ThemeProvider theme={tierView.theme}>
      <Box theme={tierView.theme} flexGrow={1} flexDirection="column">
        {body}
      </Box>
    </ThemeProvider>
  )
}

// ----------------------------------------------------------------------------
// Overview (shown on "browser" panel) — quick at-a-glance summary
// ----------------------------------------------------------------------------

function OverviewPanel({
  primary,
  tier,
}: {
  primary: ReturnType<typeof buildEntries>[number]
  tier: Tier
}) {
  const adjCount = primary.adjustments.length
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <H2>Overview</H2>
      <Box gap={1} flexWrap="wrap">
        <Small>
          <Muted>name </Muted>
          <Text bold>{primary.name}</Text>
        </Small>
        <Small>
          <Muted>mode </Muted>
          <Text>{primary.dark ? "dark" : "light"}</Text>
        </Small>
        <Small>
          <Muted>tier </Muted>
          <Text>{tier}</Text>
        </Small>
        <Small>
          <Muted>contrast adj </Muted>
          <Text>{adjCount}</Text>
        </Small>
      </Box>

      <H2>ANSI 16</H2>
      <Box paddingX={1} gap={1}>
        <AnsiRow palette={primary.palette} bright={false} />
        <AnsiRow palette={primary.palette} bright={true} />
      </Box>

      <H2>Semantic preview</H2>
      <Box flexDirection="column" paddingX={1}>
        <Box gap={1}>
          <Text color="$primary">● primary</Text>
          <Text color="$accent">◆ accent</Text>
          <Text color="$success">✓ success</Text>
          <Text color="$warning">⚠ warning</Text>
          <Text color="$error">✗ error</Text>
          <Text color="$info">ℹ info</Text>
          <Text color="$muted">○ muted</Text>
        </Box>
        <Box gap={1} marginTop={1}>
          <Box backgroundColor="$primary" paddingX={1}>
            <Text color="$primaryfg">primary surface</Text>
          </Box>
          <Box backgroundColor="$error" paddingX={1}>
            <Text color="$errorfg">error surface</Text>
          </Box>
          <Box backgroundColor="$success" paddingX={1}>
            <Text color="$successfg">success surface</Text>
          </Box>
          <Box backgroundColor="$selectionbg" paddingX={1}>
            <Text color="$selection">selection</Text>
          </Box>
          <Box backgroundColor="$popoverbg" paddingX={1}>
            <Text color="$popover">popover</Text>
          </Box>
        </Box>
      </Box>

      <Small>
        <Muted>Press </Muted>
        <Kbd>2</Kbd>
        <Muted> for full swatches, </Muted>
        <Kbd>3</Kbd>
        <Muted> for components, </Muted>
        <Kbd>4</Kbd>
        <Muted> for compare, </Muted>
        <Kbd>5</Kbd>
        <Muted> for audit.</Muted>
      </Small>
    </Box>
  )
}

function AnsiRow({
  palette,
  bright,
}: {
  palette: import("@silvery/theme").ColorScheme
  bright: boolean
}) {
  const keys: (keyof import("@silvery/theme").ColorScheme)[] = bright
    ? [
        "brightBlack",
        "brightRed",
        "brightGreen",
        "brightYellow",
        "brightBlue",
        "brightMagenta",
        "brightCyan",
        "brightWhite",
      ]
    : ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"]
  // Render each slot as a colored cell with a thin `▏` separator in $border
  // between neighbors. Keeps near-white / near-bg swatches visible as distinct
  // cells (e.g. monokai-pro's brightGreen ≈ #c4e890 is near-white — without
  // the separator, the 8-15 row looks like it has blank gaps).
  return (
    <Box gap={0}>
      <Muted>{bright ? "8-15 " : "0-7  "}</Muted>
      {keys.map((k, i) => (
        <React.Fragment key={k as string}>
          {i > 0 ? <Text color="$border">▏</Text> : null}
          <Text color={palette[k] as string}>██</Text>
        </React.Fragment>
      ))}
    </Box>
  )
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

export async function main() {
  const entries = buildEntries()

  // Detect the user's actual terminal scheme so the storybook can show what
  // their real environment resolves to (and optionally start the cursor on
  // the matched catalog entry for a familiar first-render).
  const { builtinPalettes } = await import("@silvery/theme")
  const { detectScheme } = await import("@silvery/ansi")
  const detected = await detectScheme({
    catalog: Object.values(builtinPalettes),
  }).catch(() => null)

  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="1-5 panels · j/k scheme · t tier · c compare · q quit">
      <Storybook entries={entries} detected={detected} />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

// Auto-run when invoked directly (bun examples/apps/storybook.tsx)
if (import.meta.main) {
  await main()
}
