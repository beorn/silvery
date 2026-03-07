/**
 * React DevTools integration for hightea.
 *
 * Provides optional connection to React DevTools standalone app for
 * debugging TUI component trees. Requires `react-devtools-core` to be
 * installed (optional peer dependency).
 *
 * Usage:
 *   1. Install: `bun add -d react-devtools-core`
 *   2. Run devtools: `npx react-devtools`
 *   3. Launch app with: `DEBUG_DEVTOOLS=1 bun run app.ts`
 *
 * Or call `connectDevTools()` manually from your app code.
 *
 * @module
 */

import { reconciler } from "./reconciler.js"

let connected = false

/**
 * Connect to React DevTools standalone app.
 *
 * This lazy-loads `react-devtools-core` so it has zero impact on
 * production bundles. The connection is established via WebSocket
 * to the devtools electron app (default: ws://localhost:8097).
 *
 * Safe to call multiple times -- subsequent calls are no-ops.
 *
 * @example
 * ```ts
 * import { connectDevTools } from '@hightea/term';
 * await connectDevTools();
 * // Now open React DevTools standalone to inspect the component tree
 * ```
 */
export async function connectDevTools(): Promise<boolean> {
  if (connected) return true

  try {
    // Polyfill WebSocket for Node.js environments (required by react-devtools-core)
    if (typeof globalThis.WebSocket === "undefined") {
      try {
        // @ts-expect-error -- ws is an optional peer dependency
        const ws = await import("ws")
        globalThis.WebSocket = ws.default ?? ws
      } catch {
        // ws not available -- devtools won't be able to connect
        console.warn(
          "hightea devtools: WebSocket polyfill (ws) not available. " + "Install ws for DevTools support: bun add -d ws",
        )
        return false
      }
    }

    // Ensure window/self exist for react-devtools-core internals
    if (typeof globalThis.window === "undefined") {
      // @ts-expect-error -- polyfill for devtools
      globalThis.window = globalThis
    }

    // Configure component filters to hide hightea internals from the DevTools tree.
    // Filter types from react-devtools-shared/src/types.js:
    //   1 = ComponentFilterElementType, value 7 = HostComponent
    //   2 = ComponentFilterDisplayName (regex on displayName)
    if (!globalThis.__REACT_DEVTOOLS_COMPONENT_FILTERS__) {
      globalThis.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = [
        { type: 1, value: 7, isEnabled: true },
        { type: 2, value: "HighteaApp", isEnabled: true, isValid: true },
      ]
    }

    // @ts-expect-error -- react-devtools-core has no type declarations
    const devtools = await import("react-devtools-core")
    devtools.initialize()
    devtools.connectToDevTools()

    // Inject renderer info so DevTools can identify hightea.
    // rendererPackageName and rendererVersion are read from the host config
    // passed to Reconciler() -- see reconciler/host-config.ts.
    reconciler.injectIntoDevTools()

    connected = true
    return true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `hightea devtools: Failed to connect to React DevTools. ` +
        `Install react-devtools-core: bun add -d react-devtools-core\n` +
        `  Error: ${message}`,
    )
    return false
  }
}

/**
 * Check if DevTools are currently connected.
 */
export function isDevToolsConnected(): boolean {
  return connected
}

/**
 * Auto-connect to DevTools if DEBUG_DEVTOOLS=1 environment variable is set.
 * Called internally during render initialization.
 */
export async function autoConnectDevTools(): Promise<void> {
  if (process.env.DEBUG_DEVTOOLS === "1" || process.env.DEBUG_DEVTOOLS === "true") {
    await connectDevTools()
  }
}

// Global type augmentation for devtools polyfills
declare global {
  var __REACT_DEVTOOLS_COMPONENT_FILTERS__: Array<{
    type: number
    value: number | string
    isEnabled: boolean
    isValid?: boolean
  }>
}
