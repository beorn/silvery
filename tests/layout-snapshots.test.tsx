/**
 * Layout Snapshot Tests
 *
 * Rendered output snapshots at the inkx level using renderString().
 * These catch geometry/rendering drift by locking down the visual output
 * of common card and board structures.
 *
 * Run: bun vitest run vendor/beorn-inkx/tests/layout-snapshots.test.tsx
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, renderString } from "../src"

describe("Layout Snapshots: card structures", () => {
  test("bordered card with wrapping text", async () => {
    const output = await renderString(
      <Box width={40} flexDirection="column">
        <Box borderStyle="round" paddingRight={1}>
          <Box flexDirection="row">
            <Box width={3} flexShrink={0}>
              <Text>{"* "}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">Long text that should wrap to multiple lines here</Text>
            </Box>
          </Box>
        </Box>
      </Box>,
      { plain: true, width: 40 },
    )
    expect(output).toMatchInlineSnapshot(`
      "╭──────────────────────────────────────╮
      │*  Long text that should wrap to      │
      │   multiple lines here                │
      ╰──────────────────────────────────────╯"
    `)
  })

  test("two-column board at 80 cols", async () => {
    const Card = ({ title }: { title: string }) => (
      <Box borderStyle="round" paddingRight={1}>
        <Box flexDirection="row">
          <Box width={3} flexShrink={0}>
            <Text>{"- "}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="wrap">{title}</Text>
          </Box>
        </Box>
      </Box>
    )

    const output = await renderString(
      <Box width={80} flexDirection="row">
        <Box flexGrow={1} flexDirection="column">
          <Card title="First task in column one" />
          <Card title="Second task with a longer title that wraps" />
          <Card title="Third" />
          <Card title="Fourth card entry" />
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Card title="Column two first item" />
          <Card title="Another task here in column two" />
        </Box>
      </Box>,
      { plain: true, width: 80 },
    )
    expect(output).toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────╮╭───────────────────────────────
      │-  First task in column one                   ││-  Column two first item
      ╰──────────────────────────────────────────────╯╰───────────────────────────────
      ╭──────────────────────────────────────────────╮╭───────────────────────────────
      │-  Second task with a longer title that wraps ││-  Another task here in column
      ╰──────────────────────────────────────────────╯╰───────────────────────────────
      ╭──────────────────────────────────────────────╮
      │-  Third                                      │
      ╰──────────────────────────────────────────────╯
      ╭──────────────────────────────────────────────╮
      │-  Fourth card entry                          │
      ╰──────────────────────────────────────────────╯"
    `)
  })
})

describe("Layout Snapshots: re-render after state change", () => {
  test("two-column board: re-render with different prop", async () => {
    const Board = ({ selected }: { selected: number }) => (
      <Box width={80} flexDirection="row">
        <Box flexGrow={1} flexDirection="column">
          <Box borderStyle={selected === 0 ? "bold" : "round"} paddingRight={1}>
            <Text>Column 1 Card</Text>
          </Box>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Box borderStyle={selected === 1 ? "bold" : "round"} paddingRight={1}>
            <Text>Column 2 Card</Text>
          </Box>
        </Box>
      </Box>
    )

    const output1 = await renderString(<Board selected={0} />, {
      plain: true,
      width: 80,
    })
    const output2 = await renderString(<Board selected={1} />, {
      plain: true,
      width: 80,
    })

    // Both renders should be valid — snapshot each
    expect(output1).toMatchInlineSnapshot(`
      "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓╭──────────────────────────────────────╮
      ┃Column 1 Card                         ┃│Column 2 Card                         │
      ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛╰──────────────────────────────────────╯"
    `)
    expect(output2).toMatchInlineSnapshot(`
      "╭──────────────────────────────────────╮┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      │Column 1 Card                         │┃Column 2 Card                         ┃
      ╰──────────────────────────────────────╯┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛"
    `)

    // The two outputs should differ (different border style)
    expect(output1).not.toBe(output2)
  })
})

describe("Layout Snapshots: width sweep", () => {
  const WrappingCard = () => (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingRight={1}>
        <Box flexDirection="row">
          <Box width={3} flexShrink={0}>
            <Text>{"* "}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="wrap">Context: Found in inbox old DMV notices from 2019 that need filing</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )

  test("width 40", async () => {
    const output = await renderString(<WrappingCard />, {
      plain: true,
      width: 40,
    })
    expect(output).toMatchInlineSnapshot(`
      "╭──────────────────────────────────────╮
      │*  Context: Found in inbox old DMV    │
      │   notices from 2019 that need filing │
      ╰──────────────────────────────────────╯"
    `)
  })

  test("width 60", async () => {
    const output = await renderString(<WrappingCard />, {
      plain: true,
      width: 60,
    })
    expect(output).toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────────────────╮
      │*  Context: Found in inbox old DMV notices from 2019 that │
      │   need filing                                            │
      ╰──────────────────────────────────────────────────────────╯"
    `)
  })

  test("width 80", async () => {
    const output = await renderString(<WrappingCard />, {
      plain: true,
      width: 80,
    })
    expect(output).toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────────────────────────────────────╮
      │*  Context: Found in inbox old DMV notices from 2019 that need filing         │
      ╰──────────────────────────────────────────────────────────────────────────────╯"
    `)
  })

  test("width 100", async () => {
    const output = await renderString(<WrappingCard />, {
      plain: true,
      width: 100,
    })
    expect(output).toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
      │*  Context: Found in inbox old DMV notices from 2019 that need filing                             │
      ╰──────────────────────────────────────────────────────────────────────────────────────────────────╯"
    `)
  })
})
