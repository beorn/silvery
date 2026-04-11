/**
 * SelectList — Keyboard-navigable single-select
 *
 * Navigate with j/k or arrows, confirm with Enter.
 * Disabled items are automatically skipped.
 *
 * Usage: bun examples/components/select-list.tsx
 */

import React, { useState } from "react"
import { Box, Text, SelectList } from "silvery"
import { run, useInput } from "silvery/runtime"

const languages = [
  { label: "TypeScript", value: "ts" },
  { label: "Rust", value: "rs" },
  { label: "Go", value: "go" },
  { label: "Python", value: "py" },
  { label: "COBOL", value: "cob", disabled: true },
  { label: "Elixir", value: "ex" },
]

function SelectListDemo() {
  const [selected, setSelected] = useState<string | null>(null)

  useInput((_, key) => {
    if (key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>Pick a language:</Text>
      <Box borderStyle="round" borderColor="$border" paddingX={1}>
        <SelectList items={languages} onSelect={(opt) => setSelected(opt.value)} />
      </Box>
      {selected && <Text color="$success">Selected: {selected}</Text>}
      <Text color="$muted">j/k: navigate Enter: select Esc: quit</Text>
    </Box>
  )
}

export const meta = {
  name: "Select List",
  description: "Keyboard-navigable single-select list",
}

export async function main() {
  const handle = await run(<SelectListDemo />)
  await handle.waitUntilExit()
}

if (import.meta.main) {
  await main()
}
