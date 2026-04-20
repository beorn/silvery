/**
 * IntentDemo — intent vs role demo section.
 *
 * Feature 3/5 of the full storybook. Rendered as a section inside the
 * COMPONENTS middle pane. Documents Sterling decision D1:
 *
 *   error         = status semantic  (tone="error" — "this IS an error")
 *   destructive   = action intent    (tone="destructive" — "this does harm")
 *
 * At the Theme layer, `destructive` has no token of its own — it ALIASES to
 * the `error` palette. That's the whole point: intent is a component-level
 * concept; the Theme stays status-only.
 *
 * Three buttons:
 *   [Error tone]    tone="error"         → error.bg / error.fgOn   (status)
 *   [Delete]        tone="destructive"   → same pixels, different intent
 *   [Delete]        tone="error"  ⚠      → BAD — linted anti-pattern
 */

import React from "react"
import { Box, Text, Muted, Divider, Strong, Small } from "silvery"

/**
 * Inline "button" — no silvery Button here because `Button` doesn't ship a
 * `tone` prop (status→component design gap, flagged to the caller). Drawing
 * the button shape directly keeps this demo self-contained + style-accurate.
 */
function ToneButton({
  label,
  tone,
  muted,
}: {
  label: string
  tone: "error" | "destructive" | "primary"
  /** When true, render with lower emphasis (for anti-pattern). */
  muted?: boolean
}): React.ReactElement {
  // "destructive" is an INTENT alias — the Theme has no destructive token.
  // At the component layer we translate the intent to the status token.
  const bgToken = tone === "destructive" ? "$error" : tone === "primary" ? "$accent" : "$error"
  const fgToken =
    tone === "destructive" ? "$errorfg" : tone === "primary" ? "$accentfg" : "$errorfg"

  return (
    <Box backgroundColor={bgToken} paddingX={2}>
      <Text color={fgToken} bold={!muted} dim={muted}>
        {" "}
        {label}{" "}
      </Text>
    </Box>
  )
}

function IntentRow({
  button,
  code,
  annotation,
  annotationTone = "muted",
  warning,
}: {
  button: React.ReactElement
  code: string
  annotation: string
  annotationTone?: "muted" | "error" | "success"
  warning?: string
}): React.ReactElement {
  const annColor =
    annotationTone === "error" ? "$error" : annotationTone === "success" ? "$success" : undefined
  return (
    <Box flexDirection="column" gap={0}>
      <Box gap={2}>
        {button}
        <Text>
          <Muted>→ </Muted>
          <Text color={annColor}>{annotation}</Text>
        </Text>
      </Box>
      <Small>
        <Muted>{code}</Muted>
      </Small>
      {warning ? (
        <Box gap={1}>
          <Text color="$warning">⚠</Text>
          <Small>
            <Text color="$warning">{warning}</Text>
          </Small>
        </Box>
      ) : null}
    </Box>
  )
}

export function IntentDemo(): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        <Text color="$accent" bold>
          ◆
        </Text>
        <Strong>Intent vs role</Strong>
        <Muted>· D1 from the Sterling preflight</Muted>
      </Box>
      <Small>
        <Muted>
          `error` is STATUS — "this is an error". `destructive` is INTENT — "this does harm".
          Theme owns status tokens; component layer owns intent. destructive aliases to error
          pixels by default; no `destructive` Theme field.
        </Muted>
      </Small>

      <Divider />

      <Box flexDirection="column" gap={1}>
        <IntentRow
          button={<ToneButton label="Error tone" tone="error" />}
          code='<Button tone="error">Error tone</Button>'
          annotation="status — displays an error state"
          annotationTone="success"
        />
        <IntentRow
          button={<ToneButton label="Delete" tone="destructive" />}
          code='<Button tone="destructive">Delete</Button>'
          annotation="intent — same pixels, different meaning"
          annotationTone="success"
        />
        <IntentRow
          button={<ToneButton label="Delete" tone="error" muted />}
          code='<Button tone="error">Delete</Button>'
          annotation="BAD — action labelled with status tone"
          annotationTone="error"
          warning='use tone="destructive" for actions; reserve "error" for status'
        />
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="$accent"
        paddingX={1}
        gap={0}
        marginTop={0}
      >
        <Box gap={1}>
          <Text color="$accent" bold>
            D1
          </Text>
          <Strong>destructive is intent at the component layer, not a Theme field</Strong>
        </Box>
        <Small>
          <Muted>
            Component libraries classify actions; the Theme classifies surfaces. Aliasing
            destructive → error keeps the Theme minimal (no action taxonomy leaking into
            color tokens) while letting component APIs speak intent.
          </Muted>
        </Small>
      </Box>
    </Box>
  )
}
