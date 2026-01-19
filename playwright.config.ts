import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  snapshotDir: "./e2e/snapshots",
  fullyParallel: false, // Run sequentially - ttyd can only run one app at a time
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  timeout: 30000, // 30 seconds per test
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
