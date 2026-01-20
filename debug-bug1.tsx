import { createTestRenderer, stripAnsi } from "./src/testing/index.tsx";
import React, { useState } from "react";
import { Box, Text, useInput, type Key } from "./src/index.js";

// Simplified Kanban for testing
function SimpleKanban() {
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [selectedCard, setSelectedCard] = useState(0);

  useInput((input: string, key: Key) => {
    if (key.leftArrow || input === "h") {
      setSelectedColumn((prev) => Math.max(0, prev - 1));
      setSelectedCard(0);
    }
    if (key.rightArrow || input === "l") {
      setSelectedColumn((prev) => Math.min(2, prev + 1));
      setSelectedCard(0);
    }
  });

  const columns = ["To Do", "In Progress", "Done"];

  return (
    <Box flexDirection="row" gap={1}>
      {columns.map((title, colIdx) => (
        <Box
          key={colIdx}
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor={selectedColumn === colIdx ? "cyan" : "gray"}
        >
          {/* Column header - Bug: bg color should show on full header row */}
          <Box
            backgroundColor={selectedColumn === colIdx ? "cyan" : undefined}
            paddingX={1}
          >
            <Text bold color={selectedColumn === colIdx ? "black" : "white"}>
              {title}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

const render = createTestRenderer({ columns: 80, rows: 10 });
const { lastFrame } = render(<SimpleKanban />);
const frame = lastFrame() ?? "";

console.log("=== Raw output ===");
console.log(frame);

console.log("\n=== Escaped ===");
console.log(frame.replace(/\x1b\[/g, 'ESC['));

// Find the "To Do" line and analyze it
const lines = frame.split('\n');
console.log("\n=== Line-by-line analysis ===");
lines.forEach((line, i) => {
  if (line.includes('To Do') || line.includes('In Progress') || line.includes('Done')) {
    console.log(`Line ${i}: ${line.replace(/\x1b\[/g, 'ESC[')}`);
  }
});
