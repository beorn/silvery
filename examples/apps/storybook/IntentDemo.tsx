/**
 * IntentDemo — intent vs role demo section.
 *
 * Feature 3/5 of the full storybook. Rendered as a section inside the
 * COMPONENTS middle pane. Documents Sterling decision D1:
 *
 *   error         = status semantic  (variant="error" — "this IS an error")
 *   destructive   = action intent    (variant="destructive" — "this does harm")
 *
 * At the Theme layer, `destructive` has no token of its own — it ALIASES to
 * the `error` palette. That's the whole point: intent is a component-level
 * concept; the Theme stays status-only.
 *
 * Three buttons:
 *   [Error tone]    variant="error"         → error.bg / error.fgOn   (status)
 *   [Delete]        variant="destructive"   → same pixels, different intent
 *   [Delete]        variant="error"  ⚠      → BAD — linted anti-pattern
 *
 * This demo eats its own dog food: uses the real silvery `<Button>` with
 * the `tone` prop shipped in `km-silvery.ui-button-tone`, not a locally
 * drawn copy.
 */

import React from "react"
import { Box, Text, Muted, Divider, Strong, Small, Button } from "silvery"

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
    annotationTone === "error"
      ? "$fg-error"
      : annotationTone === "success"
        ? "$fg-success"
        : undefined
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
          <Text color="$fg-warning">⚠</Text>
          <Small>
            <Text color="$fg-warning">{warning}</Text>
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
        <Text color="$fg-accent" bold>
          ◆
        </Text>
        <Strong>Intent vs role</Strong>
        <Muted>· D1 from the Sterling preflight</Muted>
      </Box>
      <Small>
        <Muted>
          `error` is STATUS — "this is an error". `destructive` is INTENT — "this does harm". Theme
          owns status tokens; component layer owns intent. destructive aliases to error pixels by
          default; no `destructive` Theme field.
        </Muted>
      </Small>

      <Divider />

      <Box flexDirection="column" gap={1}>
        <IntentRow
          button={<Button label="Error tone" variant="error" onPress={() => {}} />}
          code='<Button variant="error">Error tone</Button>'
          annotation="status — displays an error state"
          annotationTone="success"
        />
        <IntentRow
          button={<Button label="Delete" variant="destructive" onPress={() => {}} />}
          code='<Button variant="destructive">Delete</Button>'
          annotation="intent — same pixels, different meaning"
          annotationTone="success"
        />
        <IntentRow
          button={<Button label="Delete" variant="error" onPress={() => {}} />}
          code='<Button variant="error">Delete</Button>'
          annotation="BAD — action labelled with status tone"
          annotationTone="error"
          warning='use variant="destructive" for actions; reserve "error" for status'
        />
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="$fg-accent"
        paddingX={1}
        gap={0}
        marginTop={0}
      >
        <Box gap={1}>
          <Text color="$fg-accent" bold>
            D1
          </Text>
          <Strong>destructive is intent at the component layer, not a Theme field</Strong>
        </Box>
        <Small>
          <Muted>
            Component libraries classify actions; the Theme classifies surfaces. Aliasing
            destructive → error keeps the Theme minimal (no action taxonomy leaking into color
            tokens) while letting component APIs speak intent.
          </Muted>
        </Small>
      </Box>
    </Box>
  )
}
