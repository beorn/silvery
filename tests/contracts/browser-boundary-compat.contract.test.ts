/**
 * @failure Browser adapter installation diverges from the existing public singleton or terminal fallback.
 * @level l1
 * @consumer Canvas/DOM renderers and terminal callers
 * @testonly none
 */
import { describe, expect, test, vi } from "vitest"

describe("browser boundary compatibility", () => {
  test("browser adapter installation and the public path share one singleton", async () => {
    vi.resetModules()
    const publicAdapter = await import("../../packages/ag-term/src/render-adapter")
    const browserRenderer = await import("../../packages/ag-term/src/browser-renderer")
    const first = {
      name: "first",
      measurer: {
        measureText: () => ({ width: 0, height: 0 }),
        getLineHeight: () => 1,
      },
      createBuffer: () => ({
        width: 0,
        height: 0,
        fillRect: () => {},
        drawText: () => {},
        drawChar: () => {},
        inBounds: () => false,
      }),
      flush: () => undefined,
      getBorderChars: () => ({
        topLeft: "",
        topRight: "",
        bottomLeft: "",
        bottomRight: "",
        horizontal: "",
        vertical: "",
      }),
    }
    const second = { ...first, name: "second" }

    publicAdapter.setRenderAdapter(first)
    expect(publicAdapter.getRenderAdapter()).toBe(first)

    browserRenderer.initBrowserRenderer({ createAdapter: () => second }, {})
    expect(publicAdapter.getRenderAdapter()).toBe(second)
  })

  test("the existing public wrapper still lazily initializes the terminal adapter", async () => {
    vi.resetModules()
    const publicAdapter = await import("../../packages/ag-term/src/render-adapter")

    expect(publicAdapter.hasRenderAdapter()).toBe(false)
    await publicAdapter.ensureRenderAdapterInitialized()
    expect(publicAdapter.getRenderAdapter().name).toBe("terminal")
  })

  test("the ANSI barrel preserves the background-override symbols", async () => {
    const barrel = await import("../../packages/ag-term/src/ansi/index")
    const lightModule = await import("../../packages/ag-term/src/ansi/background-override")

    expect(barrel.BG_OVERRIDE_CODE).toBe(lightModule.BG_OVERRIDE_CODE)
    expect(barrel.bgOverride).toBe(lightModule.bgOverride)
    expect(barrel.bgOverride("content")).toBe("\x1b[9999mcontent")
  })
})
