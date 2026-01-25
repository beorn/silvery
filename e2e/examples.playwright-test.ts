/**
 * Visual Regression Tests for Inkx Examples
 *
 * Uses ttyd + Playwright to render TUI apps and capture screenshots.
 * Compares against baseline snapshots to detect visual regressions.
 */

import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";

const TTYD_PORT = 7681;
const TTYD_URL = `http://localhost:${TTYD_PORT}`;
const STARTUP_DELAY = 2000; // ms to wait for ttyd + app to render
const EXAMPLES_DIR = new URL("../examples", import.meta.url).pathname;

let ttydProcess: ChildProcess | null = null;

async function startTtyd(exampleName: string): Promise<void> {
  // Kill any existing ttyd
  try {
    spawn("pkill", ["-f", "ttyd"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    // Ignore if no ttyd running
  }

  const examplePath = `${EXAMPLES_DIR}/${exampleName}/index.tsx`;
  ttydProcess = spawn(
    "ttyd",
    ["-W", "-p", String(TTYD_PORT), "bun", "run", examplePath],
    {
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "1" },
    },
  );

  // Wait for ttyd to start and app to render
  await new Promise((r) => setTimeout(r, STARTUP_DELAY));
}

async function stopTtyd(): Promise<void> {
  if (ttydProcess) {
    ttydProcess.kill("SIGTERM");
    ttydProcess = null;
    await new Promise((r) => setTimeout(r, 500));
  }
}

test.describe("Inkx Examples Visual Tests", () => {
  test.afterEach(async () => {
    await stopTtyd();
  });

  test.describe("Dashboard Example", () => {
    test("renders three panes with borders", async ({ page }) => {
      await startTtyd("dashboard");
      await page.goto(TTYD_URL);
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(1000); // Additional render time

      // Capture screenshot
      const screenshot = await page.screenshot();
      expect(screenshot).toMatchSnapshot("dashboard.png", {
        maxDiffPixelRatio: 0.05, // Allow 5% pixel difference
      });
    });
  });

  test.describe("Task List Example", () => {
    test("renders list with checkboxes", async ({ page }) => {
      await startTtyd("task-list");
      await page.goto(TTYD_URL);
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(1000);

      const screenshot = await page.screenshot();
      expect(screenshot).toMatchSnapshot("task-list.png", {
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Kanban Example", () => {
    test("renders three columns with cards", async ({ page }) => {
      await startTtyd("kanban");
      await page.goto(TTYD_URL);
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(1000);

      const screenshot = await page.screenshot();
      expect(screenshot).toMatchSnapshot("kanban.png", {
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Scroll Example", () => {
    test("renders scroll container with indicators", async ({ page }) => {
      await startTtyd("scroll");
      await page.goto(TTYD_URL);
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(1000);

      const screenshot = await page.screenshot();
      expect(screenshot).toMatchSnapshot("scroll.png", {
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});
