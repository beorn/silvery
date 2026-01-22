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

console.log('Raw output character count: ' + output.length);
console.log('Number of lines: ' + lines.length);

// Analyze line 1 (first content line)
console.log('\n=== Line 1 analysis ===');
const raw1 = lines[1];
const plain1 = stripAnsi(raw1);
console.log('Raw length: ' + raw1.length);
console.log('Plain length: ' + plain1.length);
console.log('Plain string-width: ' + stringWidth(plain1));

// Show every character in plain1
console.log('\nAll characters in plain line 1:');
for (let i = 0; i < plain1.length; i++) {
  const char = plain1[i];
  const code = char.codePointAt(0) || 0;
  const w = stringWidth(char);
  const hex = code.toString(16).toUpperCase().padStart(4, '0');
  console.log('  ' + i.toString().padStart(2) + ': U+' + hex + ' ' + (code >= 32 ? '"' + char + '"' : '(ctrl)') + ' w=' + w);
}

// Same for line 2
console.log('\n=== Line 2 analysis ===');
const raw2 = lines[2];
const plain2 = stripAnsi(raw2);
console.log('Raw length: ' + raw2.length);
console.log('Plain length: ' + plain2.length);
console.log('Plain string-width: ' + stringWidth(plain2));

console.log('\nLast 5 characters in plain line 2:');
for (let i = plain2.length - 5; i < plain2.length; i++) {
  const char = plain2[i];
  const code = char.codePointAt(0) || 0;
  const w = stringWidth(char);
  const hex = code.toString(16).toUpperCase().padStart(4, '0');
  console.log('  ' + i.toString().padStart(2) + ': U+' + hex + ' ' + (code >= 32 ? '"' + char + '"' : '(ctrl)') + ' w=' + w);
}
