import React from "react";
import { createTestRenderer, stripAnsi } from "../src/testing/index.js";
import { Box, Text } from "../src/index.js";

// Test what happens with leading space
const render = createTestRenderer({ rows: 3, cols: 20 });

// Test 1: Simple text with leading space
console.log("=== Test 1: Simple text with leading space ===");
const { lastFrame: lf1 } = render(
  <Text> Normal item</Text>,
);
console.log("Frame:", JSON.stringify(lf1()));

// Test 2: Inside a box
console.log("\n=== Test 2: Inside a box ===");
const { lastFrame: lf2 } = render(
  <Box>
    <Text> Normal item</Text>
  </Box>,
);
console.log("Frame:", JSON.stringify(lf2()));

// Test 3: With column layout
console.log("\n=== Test 3: With column layout ===");
const { lastFrame: lf3 } = render(
  <Box flexDirection="column">
    <Text>First</Text>
    <Text> Normal item</Text>
  </Box>,
);
console.log("Frame:", JSON.stringify(lf3()));
