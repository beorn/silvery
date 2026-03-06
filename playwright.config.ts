import { defineConfig, devices } from "@playwright/test"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  timeout: 30000,
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "e2e",
      testDir: "./e2e",
      snapshotDir: "./e2e/snapshots",
      fullyParallel: false, // Run sequentially - ttyd can only run one app at a time
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "showcase",
      testDir: "./tests/web",
      fullyParallel: true,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4173",
      },
    },
  ],
  webServer: {
    command: `bun --eval "Bun.serve({ port: 4173, fetch(req) { const url = new URL(req.url); let path = url.pathname === '/' ? '/examples/showcase.html' : url.pathname; const pub = '${join(__dirname, "docs/site/public")}'; const root = '${__dirname}'; const file = Bun.file(pub + path); if (file.size > 0) return new Response(file); return new Response(Bun.file(root + path)); } })"`,
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
