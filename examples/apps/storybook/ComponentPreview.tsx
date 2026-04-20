/**
 * ComponentPreview — middle pane.
 *
 * Live preview of silvery's canonical components under the currently selected
 * scheme. Everything here reads semantic $tokens; no hex values in JSX.
 *
 * MVP set: typography ramp, semantic color row, badges, surface stack,
 * alert-like inline boxes for each tone, a SelectList, a TextInput preview,
 * a ModalDialog preview (inline-flattened so it composes in a pane).
 *
 * All components sit inside an outer `<ThemeProvider theme={legacyTheme}>`
 * at the App root — swapping schemes there re-renders the whole tree.
 */

import React, { useState } from "react"
import {
  Box,
  Text,
  Muted,
  Small,
  Strong,
  Kbd,
  Divider,
  H1,
  H2,
  H3,
  P,
  Badge,
  SelectList,
  Spinner,
  ProgressBar,
  type SelectOption,
} from "silvery"
import { IntentDemo } from "./IntentDemo.tsx"

// Sample data kept tiny so the pane always fits.
const SELECT_ITEMS: SelectOption[] = [
  { label: "TypeScript", value: "ts" },
  { label: "Rust", value: "rs" },
  { label: "Python", value: "py" },
  { label: "Elixir", value: "ex" },
]

/** A readonly TextInput-look-alike (same pattern the old storybook used). */
function TextInputPreview({
  label,
  value,
  placeholder,
  focused,
}: {
  label: string
  value: string
  placeholder?: string
  focused?: boolean
}) {
  const hasValue = value.length > 0
  return (
    <Box flexDirection="column" gap={0}>
      <Muted>{label}</Muted>
      <Box
        borderStyle="single"
        borderColor={focused ? "$accent" : "$border"}
        paddingX={1}
        width={36}
      >
        {hasValue ? (
          <Text>
            <Text>{value}</Text>
            {focused ? <Text inverse> </Text> : null}
          </Text>
        ) : focused ? (
          <Text>
            <Text inverse> </Text>
            <Text color="$muted">{placeholder ? placeholder.slice(1) : ""}</Text>
          </Text>
        ) : (
          <Text color="$muted">{placeholder ?? ""}</Text>
        )}
      </Box>
    </Box>
  )
}

/** A single Alert-like inline box. Uses semantic tokens for bg + on-bg text. */
function AlertBox({
  tone,
  icon,
  title,
  body,
}: {
  tone: "error" | "warning" | "success" | "info" | "accent"
  icon: string
  title: string
  body: string
}) {
  const bgToken = `$${tone}`
  const fgToken = `$${tone}fg` // legacy `fg-on-*` alias in @silvery/ansi
  return (
    <Box borderStyle="single" borderColor={bgToken} paddingX={1} flexDirection="column" width={46}>
      <Box gap={1}>
        <Text color={bgToken} bold>
          {icon}
        </Text>
        <Strong>{title}</Strong>
      </Box>
      <Small>
        <Muted>{body}</Muted>
      </Small>
      <Box marginTop={0}>
        <Box backgroundColor={bgToken} paddingX={1}>
          <Text color={fgToken}>on-{tone} surface</Text>
        </Box>
      </Box>
    </Box>
  )
}

/** A mini "modal dialog" rendered inline — not a floating overlay. */
function ModalPreview() {
  return (
    <Box
      borderStyle="double"
      borderColor="$accent"
      paddingX={2}
      paddingY={1}
      width={52}
      flexDirection="column"
      gap={0}
    >
      <Box gap={1}>
        <Text color="$accent" bold>
          ◆
        </Text>
        <Strong>Confirm destructive action</Strong>
      </Box>
      <Muted>Delete 3 items — this cannot be undone.</Muted>
      <Divider />
      <Box gap={1}>
        <Box backgroundColor="$error" paddingX={1}>
          <Text color="$errorfg" bold>
            {" "}
            Delete{" "}
          </Text>
        </Box>
        <Box borderStyle="single" borderColor="$border" paddingX={1}>
          <Text>Cancel</Text>
        </Box>
      </Box>
    </Box>
  )
}

export interface ComponentPreviewProps {
  schemeName: string
  mode: "light" | "dark"
}

export function ComponentPreview({ schemeName, mode }: ComponentPreviewProps): React.ReactElement {
  const [selectIdx, setSelectIdx] = useState(0)

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="$border"
      overflow="scroll"
    >
      <Box paddingX={1} gap={1}>
        <Text bold color="$accent">
          COMPONENTS
        </Text>
        <Muted>·</Muted>
        <Muted>{schemeName}</Muted>
        <Muted>·</Muted>
        <Muted>{mode}</Muted>
      </Box>
      <Divider />
      <Box flexDirection="column" paddingX={1} gap={1}>
        {/* Typography ramp */}
        <H1>Sterling Storybook</H1>
        <H2>Semantic tokens, one theme</H2>
        <H3>Heading three</H3>
        <P>
          A paragraph of body text under the active scheme. Inline{" "}
          <Text color="$accent">accent</Text>, <Text color="$info">info</Text>,{" "}
          <Text color="$success">success</Text>, <Text color="$warning">warning</Text>, and{" "}
          <Text color="$error">error</Text>.
        </P>
        <Muted>Muted secondary text</Muted>

        <Divider />

        {/* Badges */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>BADGES</Muted>
          </Small>
          <Box gap={1} flexWrap="wrap">
            <Badge label="default" variant="default" />
            <Badge label="primary" variant="primary" />
            <Badge label="success" variant="success" />
            <Badge label="warning" variant="warning" />
            <Badge label="error" variant="error" />
          </Box>
        </Box>

        <Divider />

        {/* Alert tones */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>ALERTS</Muted>
          </Small>
          <Box flexDirection="column" gap={1}>
            <AlertBox
              tone="error"
              icon="✗"
              title="Build failed"
              body="Type-check caught 2 errors in src/app.ts"
            />
            <AlertBox
              tone="warning"
              icon="⚠"
              title="Deprecated API"
              body="useInput(...) deprecated — migrate to useKey"
            />
            <AlertBox tone="success" icon="✓" title="Tests passed" body="143 specs green in 2.4s" />
            <AlertBox tone="info" icon="ℹ" title="Tip" body="Press ? for keyboard shortcuts" />
            <AlertBox
              tone="accent"
              icon="◆"
              title="Accent surface"
              body="Primary call-to-action surface"
            />
          </Box>
        </Box>

        <Divider />

        {/* Surface hierarchy */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>SURFACES</Muted>
          </Small>
          <Box gap={0} flexDirection="column">
            <Box backgroundColor="$bg" paddingX={2}>
              <Text>surface.default ($bg)</Text>
            </Box>
            <Box backgroundColor="$bg-surface-subtle" paddingX={2}>
              <Text>surface.subtle</Text>
            </Box>
            <Box backgroundColor="$bg-surface-hover" paddingX={2}>
              <Text>surface.hover</Text>
            </Box>
            <Box backgroundColor="$mutedbg" paddingX={2}>
              <Text>muted.bg</Text>
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* Input + list */}
        <Box flexDirection="column" gap={1}>
          <Small>
            <Muted>INPUT · LIST</Muted>
          </Small>
          <TextInputPreview
            label="Search"
            value=""
            placeholder="Type to filter..."
            focused={true}
          />
          <TextInputPreview label="Project" value="km-tui" focused={false} />
          <Box borderStyle="single" borderColor="$border" paddingX={1} width={36}>
            <SelectList
              items={SELECT_ITEMS}
              highlightedIndex={selectIdx}
              onHighlight={setSelectIdx}
              isActive={false}
              indicator="▸ "
            />
          </Box>
        </Box>

        <Divider />

        {/* Indicators */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>INDICATORS</Muted>
          </Small>
          <Box gap={2}>
            <Box gap={1}>
              <Spinner />
              <Text>Loading…</Text>
            </Box>
            <Box gap={1}>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <Muted>open palette</Muted>
            </Box>
          </Box>
          <Box width={40}>
            <ProgressBar value={0.68} />
          </Box>
        </Box>

        <Divider />

        {/* Modal preview */}
        <Box flexDirection="column" gap={0}>
          <Small>
            <Muted>MODAL DIALOG</Muted>
          </Small>
          <ModalPreview />
        </Box>

        <Divider />

        {/* Feature 3 — Intent vs role (Sterling preflight decision D1) */}
        <IntentDemo />
      </Box>
    </Box>
  )
}
