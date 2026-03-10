/**
 * TextArea Example
 *
 * A simple note editor demonstrating:
 * - Multi-line text input with word wrapping
 * - Cursor movement (arrow keys, Home/End, Ctrl+A/E)
 * - Kill operations (Ctrl+K, Ctrl+U)
 * - Scrolling within the textarea (PageUp/PageDown)
 * - Submit with Ctrl+Enter
 */

import React, { useState } from "react";
import {
  render,
  Box,
  Text,
  TextArea,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "../../src/index.js";
import { ExampleBanner, type ExampleMeta } from "../_banner.js";

export const meta: ExampleMeta = {
  name: "TextArea",
  description: "Multi-line text input with word wrap, scrolling, and kill operations",
  features: ["TextArea", "useContentRect()", "Ctrl+Enter submit"],
};

export function NoteEditor(): JSX.Element {
  const { exit } = useApp();
  const [notes, setNotes] = useState<string[]>([]);
  const [value, setValue] = useState("");

  useInput((input: string, key: Key) => {
    if (key.escape) {
      exit();
    }
  });

  function handleSubmit(text: string) {
    if (text.trim()) {
      setNotes((prev) => [...prev, text.trim()]);
      setValue("");
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      {notes.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {notes.map((note, i) => (
            <Box key={i} borderStyle="round" borderColor="gray" paddingX={1}>
              <Text>
                <Text bold color="green">
                  #{i + 1}
                </Text>{" "}
                {note}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box borderStyle="single" borderColor="cyan" flexDirection="column">
        <Box paddingX={1}>
          <Text bold color="cyan">
            New Note
          </Text>
        </Box>
        <Box paddingX={1}>
          <TextArea
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            height={6}
            placeholder="Start typing..."
          />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dim>
          {notes.length} note{notes.length !== 1 ? "s" : ""} submitted
        </Text>
      </Box>
    </Box>
  );
}

async function main() {
  using term = createTerm();
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="Ctrl+Enter submit  Esc quit">
      <NoteEditor />
    </ExampleBanner>,
    term,
  );
  await waitUntilExit();
}

if (import.meta.main) {
  main().catch(console.error);
}
