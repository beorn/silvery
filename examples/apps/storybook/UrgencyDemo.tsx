/**
 * UrgencyDemo — urgency-is-not-a-token demo section.
 *
 * Feature 4/5 of the full storybook. Rendered as a section inside the
 * COMPONENTS middle pane. Same tone="error" on three different components,
 * three different urgency levels:
 *
 *   <InlineAlert tone="error" />    LOW urgency — passive in-flow message
 *   <Banner tone="error" />         MEDIUM — dismissible top-of-page call
 *   <Alert tone="error" />          HIGH — blocking modal that interrupts flow
 *
 * Zero `priority` / `urgency` / `severity` prop involved. Urgency is carried
 * by component CHOICE + position + content, never by a Theme token.
 *
 * This demo eats its own dog food: uses the real silvery components shipped
 * in `km-silvery.ui-alert-primitives`, not locally drawn approximations.
 */

import React from "react"
import { Box, Text, Muted, Divider, Strong, Small, Kbd, InlineAlert, Banner, Alert, Button } from "silvery"

function UrgencyRow({
  level,
  levelLabel,
  component,
  annotation,
}: {
  level: "low" | "medium" | "high"
  levelLabel: string
  component: React.ReactElement
  annotation: string
}): React.ReactElement {
  const levelColor =
    level === "high" ? "$fg-error" : level === "medium" ? "$fg-warning" : "$fg-info"
  return (
    <Box flexDirection="column" gap={0}>
      <Box gap={1}>
        <Text color={levelColor} bold>
          ●
        </Text>
        <Strong>{levelLabel}</Strong>
        <Muted>·</Muted>
        <Muted>{annotation}</Muted>
      </Box>
      <Box paddingX={2} marginTop={0}>
        {component}
      </Box>
    </Box>
  )
}

export function UrgencyDemo(): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        <Text color="$fg-accent" bold>
          ◆
        </Text>
        <Strong>Urgency is not a token</Strong>
      </Box>
      <Small>
        <Muted>
          Same color. Three urgency levels. Zero `priority` / `severity` prop. Component
          choice + position + content carry urgency — not token vocabulary.
        </Muted>
      </Small>

      <Divider />

      <Box flexDirection="column" gap={1}>
        <UrgencyRow
          level="low"
          levelLabel="low"
          annotation="in-flow · passive"
          component={<InlineAlert tone="error">Type-check failed in src/app.ts</InlineAlert>}
        />

        <UrgencyRow
          level="medium"
          levelLabel="medium"
          annotation="above-the-fold · dismissible"
          component={
            <Banner tone="error" onDismiss={() => {}} width={60}>
              Connection lost — retrying…
            </Banner>
          }
        />

        <UrgencyRow
          level="high"
          levelLabel="high"
          annotation="blocking · interrupts flow"
          component={
            <Alert tone="error" open onClose={() => {}} width={60}>
              <Alert.Title>Delete workspace?</Alert.Title>
              <Alert.Body>This removes 3 projects and cannot be undone.</Alert.Body>
              <Alert.Actions>
                <Button label="Delete" tone="destructive" onPress={() => {}} />
                <Button label="Cancel" tone="accent" onPress={() => {}} />
              </Alert.Actions>
            </Alert>
          }
        />
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="$fg-accent"
        paddingX={1}
        marginTop={0}
      >
        <Box gap={1}>
          <Text color="$fg-accent" bold>
            ◆
          </Text>
          <Strong>No `priority` prop needed</Strong>
        </Box>
        <Small>
          <Muted>
            A system that shipped `priority="high"` would reinvent urgency in the token
            vocabulary. Sterling keeps tokens status-only — components carry urgency by
            their <Kbd>shape</Kbd> and <Kbd>placement</Kbd>.
          </Muted>
        </Small>
      </Box>
    </Box>
  )
}
