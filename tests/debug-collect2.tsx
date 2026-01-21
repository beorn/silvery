import React from "react";
import { createTestRenderer } from "../src/testing/index.js";
import { Text } from "../src/index.js";

// Add logging to trace the issue
console.log("Creating renderer...");
const render = createTestRenderer({ rows: 1, cols: 20 });

console.log("Rendering <Text> Normal item</Text>...");
const { lastFrame } = render(
  <Text> Normal item</Text>,
);

const frame = lastFrame();
console.log("lastFrame():", JSON.stringify(frame));

// Check visible characters after ANSI codes
if (frame) {
  // Find first non-ANSI character
  const visibleStart = frame.indexOf("m") + 1; // After first ANSI code
  console.log("Characters after first ANSI code:");
  console.log("  '" + frame.slice(visibleStart, visibleStart + 15) + "'");
}
