/**
 * TierBar — bottom bar, tier toggle + focus indicator + view-mode + key legend.
 *
 * Tiers: truecolor (1), 256 (2), ansi16 (3), mono (4). The tier state is
 * owned by App; the bar is a dumb renderer.
 *
 * View modes (full storybook): components (default), contrast audit, author
 * grid. All reachable from the bottom bar via `c` / `a` / `v` (back to
 * components). Additional demo sections (intent / urgency) appear inline
 * in the components view — no mode toggle needed.
 */

import React from "react"
import { Box, Text, Muted, Kbd } from "silvery"

export type Tier = "truecolor" | "256" | "ansi16" | "mono"
export type ViewMode = "components" | "contrast" | "author"

export const TIER_ORDER: readonly Tier[] = ["truecolor", "256", "ansi16", "mono"]

export const TIER_LABEL: Record<Tier, string> = {
  truecolor: "truecolor",
  "256": "256",
  ansi16: "ansi16",
  mono: "mono",
}

const VIEW_LABEL: Record<ViewMode, string> = {
  components: "components",
  contrast: "contrast audit",
  author: "scheme author",
}

const FOCUS_LABEL: Record<"schemes" | "tokens", string> = {
  schemes: "left · schemes",
  tokens: "right · tokens",
}

export interface TierBarProps {
  tier: Tier
  focus: "schemes" | "tokens"
  view: ViewMode
}

export function TierBar({ tier, focus, view }: TierBarProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box paddingX={1} gap={1}>
        <Muted>tier</Muted>
        {TIER_ORDER.map((t, i) => (
          <React.Fragment key={t}>
            <Text color={t === tier ? "$accent" : undefined} bold={t === tier} inverse={t === tier}>
              {` ${i + 1} ${TIER_LABEL[t]} `}
            </Text>
          </React.Fragment>
        ))}
        <Muted>·</Muted>
        <Muted>view</Muted>
        <Text color="$warning" bold={view !== "components"}>
          {VIEW_LABEL[view]}
        </Text>
        <Muted>·</Muted>
        <Muted>focus</Muted>
        <Text color="$info" bold>
          {FOCUS_LABEL[focus]}
        </Text>
      </Box>
      <Box paddingX={1} gap={1} flexWrap="wrap">
        <Muted>
          <Kbd>h/l</Kbd> pane
        </Muted>
        <Muted>
          <Kbd>j/k</Kbd> move
        </Muted>
        <Muted>
          <Kbd>Enter</Kbd> open
        </Muted>
        <Muted>
          <Kbd>1-4</Kbd> tier
        </Muted>
        <Muted>·</Muted>
        <Muted>
          <Kbd>v</Kbd> components
        </Muted>
        <Muted>
          <Kbd>c</Kbd> contrast
        </Muted>
        <Muted>
          <Kbd>a</Kbd> author
        </Muted>
        <Muted>
          <Kbd>?</Kbd> help
        </Muted>
        <Muted>
          <Kbd>q</Kbd> quit
        </Muted>
      </Box>
    </Box>
  )
}
