/**
 * Audit panel — invariant + fingerprint diagnostics for the active scheme.
 *
 *   - validateThemeInvariants({ wcag: true }) — WCAG contrast + selection/cursor
 *     visibility. Confirms every bundled scheme passes.
 *   - fingerprintMatch — feed the scheme's own probed slots back and verify the
 *     scheme can identify itself with high confidence.
 */

import React from "react"
import { Box, Text, Muted, H2, H3, Badge, Divider, Small } from "silvery"
import {
  validateThemeInvariants,
  fingerprintMatch,
  type InvariantResult,
  type FingerprintMatch,
} from "@silvery/ansi"
import { builtinPalettes, type ColorScheme } from "@silvery/theme"
import type { Theme, ThemeAdjustment } from "@silvery/ansi"
import type { MonochromeAttrs } from "@silvery/ansi"

interface Props {
  name: string
  palette: ColorScheme
  theme: Theme
  adjustments: ThemeAdjustment[]
  monoAttrs?: MonochromeAttrs | null
}

const CATALOG: readonly ColorScheme[] = Object.values(builtinPalettes)

export function AuditPanel({ name, palette, theme, adjustments, monoAttrs }: Props) {
  const invariants = validateThemeInvariants(theme, { wcag: true })
  const match = fingerprintMatch(palette, CATALOG)

  return (
    <Box flexDirection="column" gap={1}>
      <H2>Audit: {name}</H2>
      <InvariantSummary result={invariants} />
      <Divider />
      <FingerprintSummary match={match} expected={name} />
      <Divider />
      <AdjustmentSummary adjustments={adjustments} />
      {monoAttrs ? <MonoAttrSummary attrs={monoAttrs} /> : null}
    </Box>
  )
}

function InvariantSummary({ result }: { result: InvariantResult }) {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H3>validateThemeInvariants (wcag=true, visibility=default)</H3>
      {result.ok ? (
        <Box gap={1}>
          <Badge label="PASS" variant="success" />
          <Muted>All WCAG ratios and visibility ΔE/ΔL invariants hold.</Muted>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box gap={1}>
            <Badge label="FAIL" variant="error" />
            <Muted>{result.violations.length} violation(s)</Muted>
          </Box>
          {result.violations.map((v, i) => (
            <Box key={i} flexDirection="column" paddingX={1}>
              <Text>
                <Text bold color="$error">
                  {v.rule}
                </Text>
                <Muted> ({v.tokens.join(", ")})</Muted>
              </Text>
              <Muted>
                {"  "}
                got {v.actual.toFixed(2)} &lt; required {v.required.toFixed(2)}
              </Muted>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function FingerprintSummary({
  match,
  expected,
}: {
  match: FingerprintMatch | null
  expected: string
}) {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H3>fingerprintMatch (probed = active scheme's own slots)</H3>
      {match === null ? (
        <Box gap={1}>
          <Badge label="NO MATCH" variant="warning" />
          <Muted>No catalog scheme passes both ΔE thresholds.</Muted>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box gap={1}>
            <Badge
              label={match.scheme.name === expected ? "SELF-MATCH" : "MATCH"}
              variant={match.scheme.name === expected ? "success" : "primary"}
            />
            <Text>
              <Muted>matched: </Muted>
              <Text bold>{match.scheme.name ?? "(unnamed)"}</Text>
            </Text>
          </Box>
          <Muted>
            {"  "}
            confidence {(match.confidence * 100).toFixed(1)}% · ΣΔE {match.sumDeltaE.toFixed(2)} ·
            maxΔE {match.maxDeltaE.toFixed(2)} · {match.slotsCompared} slots
          </Muted>
        </Box>
      )}
    </Box>
  )
}

function AdjustmentSummary({ adjustments }: { adjustments: ThemeAdjustment[] }) {
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <H3>deriveTheme adjustments ({adjustments.length})</H3>
      {adjustments.length === 0 ? (
        <Muted>No tokens needed contrast correction.</Muted>
      ) : (
        <Box flexDirection="column">
          {adjustments.slice(0, 8).map((a, i) => (
            <Box key={i} gap={1}>
              <Text bold>{a.token.padEnd(12)}</Text>
              <Text color={a.from}>{"██"}</Text>
              <Muted>→</Muted>
              <Text color={a.to}>{"██"}</Text>
              <Muted>
                {a.ratioBefore.toFixed(2)} → {a.ratioAfter.toFixed(2)} (≥{a.target})
              </Muted>
            </Box>
          ))}
          {adjustments.length > 8 ? (
            <Small>
              <Muted>… and {adjustments.length - 8} more</Muted>
            </Small>
          ) : null}
        </Box>
      )}
    </Box>
  )
}

function MonoAttrSummary({ attrs }: { attrs: MonochromeAttrs }) {
  const entries = Object.entries(attrs).filter(([, v]) => Array.isArray(v) && v.length > 0)
  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <Divider />
      <H3>deriveMonochromeTheme ({entries.length} attrs)</H3>
      <Box flexWrap="wrap" gap={1}>
        {entries.map(([k, v]) => (
          <Box key={k} borderStyle="round" paddingX={1}>
            <Text bold>{k}</Text>
            <Muted> = {(v as readonly string[]).join("+")}</Muted>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
