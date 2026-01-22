import React from "react";
import { Box, Text } from "inkx";
import { createTestRenderer } from "inkx/testing";
import stringWidth from "string-width";

// Simulate a column with a card
function TestColumn() {
  return (
    <Box flexDirection="column" width={23}>
      <Box borderStyle="round" paddingLeft={1}>
        <Text wrap="wrap">· ☑ Setup project structure</Text>
      </Box>
    </Box>
  );
}

const render = createTestRenderer({ columns: 30, rows: 10 });
const { lastFrame } = render(<TestColumn />);
const output = lastFrame() || "";

// Strip ANSI codes
const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;:]*m/g, '');

const lines = output.split('\n');

console.log('Border position analysis:');
lines.forEach((line, i) => {
  const plain = stripAnsi(line);
  const chars = [...plain];
  // Find all │ positions (excluding \r)
  const pipePositions: number[] = [];
  for (let j = 0; j < chars.length; j++) {
    if (chars[j] === '│') pipePositions.push(j);
  }
  if (pipePositions.length > 0) {
    console.log('  Line ' + i + ': │ at positions ' + JSON.stringify(pipePositions) + ' (chars=' + chars.filter(c => c.codePointAt(0) !== 0x0D).length + ')');
  }
});

// Check top and bottom borders
console.log('\nCorner positions:');
lines.forEach((line, i) => {
  const plain = stripAnsi(line);
  const chars = [...plain];
  for (let j = 0; j < chars.length; j++) {
    const c = chars[j];
    if (c === '╭' || c === '╮' || c === '╰' || c === '╯') {
      console.log('  Line ' + i + ': ' + c + ' at position ' + j);
    }
  }
});
