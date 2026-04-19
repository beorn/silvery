/**
 * Test renderer helper — wraps silvery's ink compat render() with act().
 *
 * Equivalent to ink's test/helpers/test-renderer.ts.
 * Provides renderAsync() which creates a fake stdout, renders with act(),
 * and returns an instance with getOutput() and rerenderAsync().
 */
import { act } from "react"
import { render } from "../../../../packages/ink/src/ink"
import createStdout from "./create-stdout"

type TestRenderOptions = {
  columns?: number
  isScreenReaderEnabled?: boolean
}

type TestInstance = {
  stdout: ReturnType<typeof createStdout>
  getOutput: () => string
  rerender: (node: React.ReactNode) => void
  rerenderAsync: (node: React.ReactNode) => Promise<void>
  unmount: () => void
  waitUntilExit: () => Promise<void>
}

/**
 * Render helper that supports concurrent mode with act() wrapping.
 */
export async function renderAsync(
  node: React.ReactNode,
  options: TestRenderOptions = {},
): Promise<TestInstance> {
  const stdout = createStdout(options.columns ?? 100)

  let instance: ReturnType<typeof render>

  await act(async () => {
    instance = render(node, {
      stdout,
      debug: true,
      concurrent: true,
      isScreenReaderEnabled: options.isScreenReaderEnabled,
    })
  })

  const inst = instance!
  return {
    stdout,
    getOutput: () => stdout.get(),
    rerender: (node: React.ReactNode) => inst.rerender(node),
    unmount: () => inst.unmount(),
    waitUntilExit: () => inst.waitUntilExit(),
    async rerenderAsync(newNode: React.ReactNode) {
      await act(async () => {
        inst.rerender(newNode)
      })
    },
  }
}
