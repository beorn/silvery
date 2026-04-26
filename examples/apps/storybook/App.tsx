/**
 * Sterling Storybook — interactive design-system explorer.
 *
 * MVP scope (sterling-storybook-mvp):
 *   1. 3-pane layout — SchemeList | ComponentPreview | TokenTree
 *   2. Scheme swap — `h` / `l` (or ←/→) switch focus between panes;
 *      j/k (or ↑/↓) moves cursor in the focused pane; selecting a scheme
 *      re-themes the whole middle pane live via a root <ThemeProvider>.
 *   3. Canonical component set in the middle pane.
 *   4. Collapsible token tree in the right pane — each leaf shows path +
 *      hex swatch + hex value.
 *   5. Token click → DerivationPanel appended under the tree, showing the
 *      rule from theme.derivationTrace.
 *   6. Tier toggle (1/2/3/4) — truecolor, 256, ansi16, mono.
 *
 * Full (sterling-storybook-full — this file's extension):
 *   1. OKLCH derivation visualizer (extends DerivationPanel)
 *   2. WCAG contrast audit pane (view mode — `c`)
 *   3. Intent vs role demo (section inside COMPONENTS)
 *   4. Urgency-is-not-a-token demo (section inside COMPONENTS)
 *   5. Scheme authoring 22-color input grid (view mode — `a`)
 *
 * View modes toggle the middle pane only. Left (schemes) + right (tokens)
 * stay up regardless — author edits re-derive the Theme live, so the right
 * pane shows the consequences slot-by-slot; contrast pane audits the same
 * derivation.
 *
 * Out of scope (deferred to a separate bead):
 *   - Cross-target preview (web/RN alongside terminal)
 *   - Preservative vs generative mode toggle
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Box,
  Divider,
  Muted,
  Strong,
  Text,
  ThemeProvider,
  useApp,
  useInput,
  type Key,
} from "silvery"
import { builtinPalettes, sterling, type SterlingTheme } from "@silvery/theme"
import { deriveTheme as legacyDeriveTheme } from "@silvery/ansi"
import type { ColorScheme, Theme as LegacyTheme } from "@silvery/ansi"

import { SchemeList } from "./SchemeList.tsx"
import { ComponentPreview } from "./ComponentPreview.tsx"
import { TokenTree, flattenTokens, type FlatTokenEntry } from "./TokenTree.tsx"
import { DerivationPanel } from "./DerivationPanel.tsx"
import { TierBar, TIER_ORDER, type Tier, type ViewMode } from "./TierBar.tsx"
import { ContrastAudit } from "./ContrastAudit.tsx"
import { SchemeAuthor } from "./SchemeAuthor.tsx"
import { PaletteGallery } from "./PaletteGallery.tsx"
import { quantizeLegacyTheme, quantizeSterlingTheme } from "./shared/quantize.ts"

// ────────────────────────────────────────────────────────────────────────────
// Scheme list — sort dark-first, then alpha, for a predictable browser order.
// ────────────────────────────────────────────────────────────────────────────

function orderedSchemes(): string[] {
  const names = Object.keys(builtinPalettes)
  names.sort((a, b) => {
    const sa = builtinPalettes[a as keyof typeof builtinPalettes]
    const sb = builtinPalettes[b as keyof typeof builtinPalettes]
    const da = sa?.dark !== false
    const db = sb?.dark !== false
    if (da !== db) return da ? -1 : 1
    return a.localeCompare(b)
  })
  return names
}

// ────────────────────────────────────────────────────────────────────────────
// Theme builders
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the legacy Theme that drives the middle pane (<ThemeProvider theme=>).
 * silvery/ui components consume the legacy token names today; Sterling lives
 * alongside and drives the token tree + derivation panel + contrast audit.
 */
function buildLegacyTheme(palette: ColorScheme, tier: Tier): LegacyTheme {
  // Derive at truecolor and preview-quantize — the output phase would
  // quantize again at a real TTY, but our in-process preview bypasses that,
  // so we mirror the quantization here.
  const base = legacyDeriveTheme(palette, "truecolor")
  return quantizeLegacyTheme(base, tier)
}

/**
 * Build the Sterling Theme. Always derived with { trace: true } so
 * DerivationPanel + ContrastAudit have data.
 */
function buildSterlingTheme(palette: ColorScheme): SterlingTheme {
  return sterling.deriveFromScheme(palette, { trace: true, contrast: "auto-lift" })
}

// ────────────────────────────────────────────────────────────────────────────
// App
// ────────────────────────────────────────────────────────────────────────────

type Focus = "schemes" | "tokens"

export function App(): React.ReactElement {
  const { exit } = useApp()
  const schemes = useMemo(orderedSchemes, [])
  const [schemeIdx, setSchemeIdx] = useState(0)
  const [tier, setTier] = useState<Tier>("truecolor")
  const [focus, setFocus] = useState<Focus>("schemes")
  const [tokenCursor, setTokenCursor] = useState(0)
  const [openedToken, setOpenedToken] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>("components")
  /**
   * Author working scheme — when non-null, overrides the built-in palette.
   * Cleared on scheme cycle. Feeds every downstream derivation so the rest
   * of the storybook reflects edits live.
   */
  const [authorScheme, setAuthorScheme] = useState<ColorScheme | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  /**
   * When true, the entire screen is the palette gallery — full-screen QA
   * view of all 84 palettes. Toggled with `p`. Tri-pane state is preserved
   * underneath; closing the gallery returns to the same scheme/token cursor.
   */
  const [showGallery, setShowGallery] = useState(false)

  const schemeName = schemes[schemeIdx]!
  const basePalette = useMemo(() => {
    const p = builtinPalettes[schemeName as keyof typeof builtinPalettes]
    if (!p) throw new Error(`Unknown scheme: ${schemeName}`)
    return p
  }, [schemeName])

  // When author has a working scheme, use it everywhere. Otherwise use the
  // catalog palette unchanged.
  const livePalette: ColorScheme = authorScheme ?? basePalette

  const sterlingThemeBase = useMemo(() => buildSterlingTheme(livePalette), [livePalette])
  const sterlingTheme = useMemo(
    () => quantizeSterlingTheme(sterlingThemeBase, tier),
    [sterlingThemeBase, tier],
  )
  const legacyTheme = useMemo(() => buildLegacyTheme(livePalette, tier), [livePalette, tier])
  const flatTokens: FlatTokenEntry[] = useMemo(() => flattenTokens(sterlingTheme), [sterlingTheme])

  // Clamp the token cursor when the flat list shrinks (paranoid defence).
  useEffect(() => {
    if (tokenCursor >= flatTokens.length) setTokenCursor(Math.max(0, flatTokens.length - 1))
  }, [flatTokens.length, tokenCursor])

  const stepScheme = useCallback(
    (delta: number) => {
      setSchemeIdx((i) => Math.max(0, Math.min(schemes.length - 1, i + delta)))
      // Close any open token — its hex is stale after scheme swap.
      setOpenedToken(null)
      // Drop any author overrides — cycling resets to the catalog palette.
      setAuthorScheme(null)
    },
    [schemes.length],
  )

  const stepToken = useCallback(
    (delta: number) => {
      setTokenCursor((i) => Math.max(0, Math.min(flatTokens.length - 1, i + delta)))
    },
    [flatTokens.length],
  )

  const isAuthoring = view === "author"

  // App-level keybindings. When the author pane is active, navigation keys
  // (j/k/h/l, Enter) are claimed by the SchemeAuthor's own useInput; this
  // hook still handles global keys (view toggles, tier, quit, help).
  useInput((input: string, key: Key) => {
    if (showHelp) {
      // Any key dismisses the help overlay.
      setShowHelp(false)
      return
    }

    // GLOBAL keys — always active, including in gallery mode. q/Ctrl+C
    // quits, ? opens help, 1-4/t cycle tier even from the gallery so users
    // can re-quantize palettes mid-browse.
    if (input === "q" || (key.ctrl && input === "c")) {
      exit()
      return
    }
    if (input === "?") {
      setShowHelp(true)
      return
    }
    if (input === "1") return setTier("truecolor")
    if (input === "2") return setTier("256")
    if (input === "3") return setTier("ansi16")
    if (input === "4") return setTier("mono")
    if (input === "t") {
      const idx = TIER_ORDER.indexOf(tier)
      setTier(TIER_ORDER[(idx + 1) % TIER_ORDER.length]!)
      return
    }

    // p enters gallery from the tri-pane. Gallery's own useInput owns p
    // for the return trip (see PaletteGallery.tsx).
    if (input === "p" && !showGallery) {
      setShowGallery(true)
      return
    }

    // Navigation + view toggles — gallery owns its own; tri-pane owns the rest.
    if (showGallery) return

    // View mode toggles — work from any focus, any view.
    if (input === "v") return setView("components")
    if (input === "c") return setView("contrast")
    if (input === "a") return setView("author")

    if (key.escape) {
      if (openedToken) {
        setOpenedToken(null)
        return
      }
      if (view !== "components") {
        setView("components")
        return
      }
      exit()
      return
    }

    // Navigation keys — the author pane owns these when active.
    if (isAuthoring) return

    if (input === "h" || key.leftArrow) return setFocus("schemes")
    if (input === "l" || key.rightArrow) return setFocus("tokens")

    if (focus === "schemes") {
      if (input === "j" || key.downArrow) return stepScheme(1)
      if (input === "k" || key.upArrow) return stepScheme(-1)
      if (input === "J") return stepScheme(10)
      if (input === "K") return stepScheme(-10)
      if (input === "g") return setSchemeIdx(0)
      if (input === "G") return setSchemeIdx(schemes.length - 1)
    } else {
      if (input === "j" || key.downArrow) return stepToken(1)
      if (input === "k" || key.upArrow) return stepToken(-1)
      if (input === "J") return stepToken(10)
      if (input === "K") return stepToken(-10)
      if (input === "g") return setTokenCursor(0)
      if (input === "G") return setTokenCursor(flatTokens.length - 1)
      if (key.return) {
        const t = flatTokens[tokenCursor]
        if (t) setOpenedToken(t.path)
        return
      }
    }
  })

  const header = (
    <Box paddingX={1} gap={1}>
      <Text color="$fg-accent">▸ silvery</Text>
      <Strong>Sterling Storybook</Strong>
      <Muted>— interactive design-system explorer</Muted>
      <Muted>·</Muted>
      <Text bold color="$fg-accent">
        {schemeName}
        {authorScheme ? "*" : ""}
      </Text>
      <Muted>({sterlingTheme.mode})</Muted>
    </Box>
  )

  // Middle pane — swap by view mode. Left + right panes stay mounted in
  // all modes, so scheme/token state is preserved across toggles.
  const middle = useMemo(() => {
    if (view === "contrast") {
      return <ContrastAudit theme={sterlingThemeBase} schemeName={schemeName} />
    }
    if (view === "author") {
      return (
        <SchemeAuthor
          seed={basePalette}
          schemeName={schemeName}
          onUpdate={(next) => setAuthorScheme(next)}
        />
      )
    }
    return <ComponentPreview schemeName={schemeName} mode={sterlingTheme.mode} />
  }, [view, sterlingThemeBase, sterlingTheme.mode, schemeName, basePalette])

  if (showGallery) {
    return (
      <ThemeProvider theme={legacyTheme}>
        <Box flexDirection="column" height="100%" padding={0}>
          <PaletteGallery
            schemes={schemes}
            builtinPalettes={builtinPalettes as Record<string, ColorScheme>}
            activeIndex={schemeIdx}
            tier={tier}
            onSelect={(i) => setSchemeIdx(i)}
            onExit={() => setShowGallery(false)}
          />
        </Box>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={legacyTheme}>
      <Box flexDirection="column" height="100%" padding={0}>
        {header}
        <Divider />
        <Box flexGrow={1} flexDirection="row" gap={0} overflow="hidden">
          <SchemeList
            schemes={schemes}
            selectedIndex={schemeIdx}
            onSelect={setSchemeIdx}
            focused={focus === "schemes"}
          />
          {middle}
          <Box flexDirection="column" userSelect="contain">
            <TokenTree
              theme={sterlingTheme}
              cursorIndex={tokenCursor}
              openedPath={openedToken}
              focused={focus === "tokens"}
            />
            <DerivationPanel theme={sterlingThemeBase} openedPath={openedToken} tier={tier} />
          </Box>
        </Box>
        <Divider />
        <TierBar tier={tier} focus={focus} view={view} />
        {showHelp ? <HelpOverlay /> : null}
      </Box>
    </ThemeProvider>
  )
}

/**
 * Compact help overlay — any keypress dismisses. Rendered at the root so
 * it overlays the full storybook with the current theme applied.
 */
function HelpOverlay(): React.ReactElement {
  return (
    <Box
      borderStyle="double"
      borderColor="$fg-accent"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      marginTop={0}
    >
      <Strong>Sterling Storybook — keyboard</Strong>
      <Divider />
      <Box flexDirection="column" gap={0}>
        <Text>
          <Text bold color="$fg-accent">
            h / l
          </Text>{" "}
          <Muted>— switch pane (schemes ↔ tokens)</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            j / k
          </Text>{" "}
          <Muted>— move cursor in focused pane (J/K = ±10)</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            Enter
          </Text>{" "}
          <Muted>— open token (derivation panel) or edit author slot</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            Esc
          </Text>{" "}
          <Muted>— close derivation / exit view mode / cancel edit</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            1–4 / t
          </Text>{" "}
          <Muted>— color tier (truecolor / 256 / ansi16 / mono)</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            v
          </Text>{" "}
          <Muted>— components view</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            c
          </Text>{" "}
          <Muted>— contrast-audit view (WCAG AA/AAA)</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            a
          </Text>{" "}
          <Muted>— scheme-author view (22-color input grid)</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            p
          </Text>{" "}
          <Muted>— fullscreen palette gallery (all 84 schemes at a glance)</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            x
          </Text>{" "}
          <Muted>— (author view) export ColorScheme JSON, OSC 52 to clipboard</Muted>
        </Text>
        <Text>
          <Text bold color="$fg-accent">
            q / Ctrl+C
          </Text>{" "}
          <Muted>— quit</Muted>
        </Text>
      </Box>
      <Divider />
      <Muted>press any key to dismiss</Muted>
    </Box>
  )
}
