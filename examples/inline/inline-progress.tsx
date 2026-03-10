#!/usr/bin/env tsx
/**
 * Example: Inline Progress Indicator
 *
 * Demonstrates the new inline mode for progress bars and status indicators.
 * Unlike fullscreen mode, inline mode renders from the current cursor position
 * and updates in place using relative cursor positioning.
 */

import React, { useState, useEffect } from "react";
import { render, Box, Text, useApp, createTerm } from "../../src/index.js";
import type { ExampleMeta } from "../_banner.js";

export const meta: ExampleMeta = {
  name: "Inline Progress",
  description: "Inline progress bar updating in place",
  features: ["render() inline mode", "setInterval updates"],
};

function InlineProgress() {
  const { exit } = useApp();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Starting...");

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 10;
        if (next >= 100) {
          setStatus("Complete!");
          clearInterval(timer);
          return 100;
        }
        setStatus(`Processing... ${next}%`);
        return next;
      });
    }, 500);

    return () => clearInterval(timer);
  }, []);

  // Exit cleanly after showing "Complete!" for a moment
  useEffect(() => {
    if (progress < 100) return;
    const timeout = setTimeout(() => exit(), 300);
    return () => clearTimeout(timeout);
  }, [progress, exit]);

  const barWidth = 40;
  const filled = Math.floor((progress / 100) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

  return (
    <Box flexDirection="column">
      <Text>{status}</Text>
      <Text>
        [{bar}] {progress}%
      </Text>
    </Box>
  );
}

async function main() {
  console.log("This is regular console output before the progress bar.\n");

  using term = createTerm();
  const { waitUntilExit } = await render(<InlineProgress />, term, {
    mode: "inline",
    exitOnCtrlC: true,
  });

  await waitUntilExit();

  console.log("\nProgress complete! This is output after the progress bar.");
}

if (import.meta.main) {
  main().catch(console.error);
}
