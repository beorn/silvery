import React from "react";
import { Box, Text, reconcile, measurePhase, layoutPhase, contentPhase } from "inkx";
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

// Build the component tree
const root = reconcile(null, <TestColumn />);

// Run layout phases
measurePhase(root);
layoutPhase(root, { width: 30, height: 10 });

// Get the buffer
const buffer = contentPhase(root);

console.log('Buffer analysis:');
console.log('  Width: ' + buffer.width);
console.log('  Height: ' + buffer.height);

// Check row 1 (first content row) and row 2 (second content row)
console.log('\nRow 1 cells (positions 19-25):');
for (let x = 19; x <= 25; x++) {
  const cell = buffer.getCell(x, 1);
  const code = cell.char.codePointAt(0) || 0;
  console.log('  x=' + x + ': "' + cell.char + '" (U+' + code.toString(16).toUpperCase().padStart(4, '0') + ')');
}

console.log('\nRow 2 cells (positions 19-25):');
for (let x = 19; x <= 25; x++) {
  const cell = buffer.getCell(x, 2);
  const code = cell.char.codePointAt(0) || 0;
  console.log('  x=' + x + ': "' + cell.char + '" (U+' + code.toString(16).toUpperCase().padStart(4, '0') + ')');
}

// Find the right border position
console.log('\nFinding right border (│) position:');
for (let row = 0; row < 4; row++) {
  for (let x = 20; x <= 25; x++) {
    const cell = buffer.getCell(x, row);
    if (cell.char === '│') {
      console.log('  Row ' + row + ': │ at x=' + x);
      break;
    }
  }
}
