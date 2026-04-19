/**
 * Smoke test for silvery.dev — verifies pages load and demos render.
 *
 * Requires: `bun run docs:dev` on localhost:5173 (or set SITE_URL).
 * Run: `bunx playwright test tests/site-smoke.test.ts`
 * Prod: `SITE_URL=https://silvery.dev bunx playwright test ...`
 */
import { test, expect, type Page } from "@playwright/test"

const BASE = process.env.SITE_URL ?? "http://localhost:5173"

// -- Page inventory (from docs/.vitepress/config.ts) -------------------------

const DOC_PAGES = [
  "/getting-started/quick-start",
  "/getting-started/migrate-from-ink",
  "/guide/the-silvery-way",
  "/guide/layouts",
  "/guide/styling",
  "/guide/silvery-vs-ink",
  "/guides/components",
  "/guides/theming",
  "/reference/components-hooks",
  "/reference/packages",
  "/roadmap",
  "/blog/",
]

const SCREENSHOT_PAGES = [
  { path: "/examples/live-demo", img: "dashboard" },
  { path: "/examples/components", img: "components" },
  { path: "/examples/layout", img: "dashboard" },
  { path: "/examples/forms", img: "components" },
  { path: "/examples/tables", img: "dashboard" },
  { path: "/examples/scrollback", img: "dashboard" },
]

const IFRAME_DEMOS = [
  { path: "/", selector: "iframe.viewer-iframe", name: "homepage viewer" },
  { path: "/examples/", selector: "iframe.gallery-iframe", name: "showcase gallery" },
  { path: "/examples/ai-chat", selector: "iframe.live-demo-iframe", name: "AI chat demo" },
]

const SHOWCASE_DEMOS: Record<string, string> = {
  dashboard: "Dashboard",
  kanban: "Kanban Board",
  components: "Components",
  "dev-tools": "Dev Tools",
  textarea: "Text Editor",
}

const STATIC_HTMLS = [
  { path: "/examples/xterm.html", container: "#terminal" },
  { path: "/examples/showcase.html", container: "#terminal" },
  { path: "/examples/canvas.html", container: "#canvas" },
  { path: "/examples/dom.html", container: "#app" },
  { path: "/examples/viewer.html", container: "#viewer-root" },
]

// -- Helpers -----------------------------------------------------------------

function filterNoise(errors: string[]) {
  return errors.filter((e) => !e.includes("ResizeObserver") && !e.includes("favicon"))
}

async function visit(page: Page, path: string) {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text())
  })
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  })
  return { response, errors }
}

// -- Tests -------------------------------------------------------------------

test.describe("silvery.dev smoke tests", () => {
  test.describe.configure({ timeout: 60_000 })

  for (const path of DOC_PAGES) {
    test(`doc: ${path}`, async ({ page }) => {
      const { response, errors } = await visit(page, path)
      expect(response?.status()).toBeLessThan(400)
      await page.waitForSelector(".VPContent", { timeout: 10_000 })
      const text = await page.locator(".VPContent").textContent()
      expect(text?.trim().length).toBeGreaterThan(50)
      expect(filterNoise(errors)).toEqual([])
    })
  }

  for (const { path, img } of SCREENSHOT_PAGES) {
    test(`screenshot: ${path}`, async ({ page }) => {
      const { response, errors } = await visit(page, path)
      expect(response?.status()).toBeLessThan(400)
      const el = page.locator(`.demo-screenshot-img[src*="${img}"]`)
      await expect(el).toBeVisible({ timeout: 10_000 })
      const loaded = await el.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)
      expect(loaded).toBe(true)
      expect(filterNoise(errors)).toEqual([])
    })
  }

  for (const { path, selector, name } of IFRAME_DEMOS) {
    test(`iframe: ${name}`, async ({ page }) => {
      const { response } = await visit(page, path)
      expect(response?.status()).toBeLessThan(400)
      const iframe = page.locator(selector).first()
      await expect(iframe).toBeAttached({ timeout: 15_000 })
      expect(await iframe.getAttribute("src")).toBeTruthy()
      const inner = page
        .frameLocator(selector)
        .first()
        .locator("#terminal, #viewer-root, #app")
        .first()
      await expect(inner).toBeAttached({ timeout: 15_000 })
    })
  }

  test("showcase gallery: all demos selectable", async ({ page }) => {
    await page.goto(`${BASE}/examples/`, { waitUntil: "networkidle", timeout: 30_000 })
    for (const [id, label] of Object.entries(SHOWCASE_DEMOS)) {
      const btn = page.locator(`.gallery-item:has-text("${label}")`)
      if ((await btn.count()) === 0) continue
      await btn.click()
      await page.waitForTimeout(500)
      const src = await page.locator("iframe.gallery-iframe").first().getAttribute("src")
      expect(src).toContain(`demo=${id}`)
    }
  })

  test("theme explorer: interactive", async ({ page }) => {
    const { response } = await visit(page, "/themes")
    expect(response?.status()).toBeLessThan(400)
    await page.waitForSelector("button", { timeout: 10_000 })
    const buttons = page.locator("button")
    expect(await buttons.count()).toBeGreaterThan(0)
    await buttons.first().click()
    await page.waitForSelector("button", { timeout: 5_000 })
  })

  test("homepage: hero and features", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30_000 })
    await expect(page.locator(".VPHero .name")).toContainText("Silvery")
    expect(await page.locator(".VPFeature").count()).toBeGreaterThanOrEqual(6)
    await expect(page.locator('a:has-text("Get Started")')).toBeVisible()
  })

  for (const { path, container } of STATIC_HTMLS) {
    test(`html: ${path}`, async ({ page }) => {
      const res = await page.goto(`${BASE}${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      })
      expect(res?.status()).toBeLessThan(400)
      await expect(page.locator(container)).toBeAttached({ timeout: 5_000 })
    })
  }

  test("no broken internal links (homepage)", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30_000 })
    const links = await page.locator('a[href^="/"]').all()
    const hrefs = new Set<string>()
    for (const link of links) {
      const href = await link.getAttribute("href")
      if (href && !href.includes("#")) hrefs.add(href)
    }
    for (const href of Array.from(hrefs).slice(0, 10)) {
      const res = await page.goto(`${BASE}${href}`, {
        waitUntil: "domcontentloaded",
        timeout: 10_000,
      })
      expect(res?.status(), `broken: ${href}`).toBeLessThan(400)
    }
  })
})
