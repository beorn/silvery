/**
 * Mixed style proxy — combines a Style instance with additional properties.
 *
 * Used by ag-term to create a Term that is both a style chain (term.bold.red('text'))
 * and a terminal interface (term.write(), term.cols, etc.).
 */

import type { Style } from "./types.ts"

/** Methods on Style that take arguments and return a new Style chain. */
const STYLE_METHODS = new Set(["hex", "bgHex", "rgb", "bgRgb", "ansi256", "bgAnsi256"])

/**
 * Create a proxy that wraps a style instance with additional properties.
 *
 * The proxy makes the result:
 * - Callable: result('text') applies current styles
 * - Chainable: result.bold.red('text') chains styles
 * - Extended: result.anyExtraProp accesses extra properties
 *
 * Extra properties take priority over style properties on name collision.
 */
export function createMixedStyle<T extends object>(style: Style, extra: T): Style & T {
  return createChainProxy(style, extra) as Style & T
}

/**
 * Internal recursive proxy builder for style chain + extra properties.
 */
function createChainProxy<T extends object>(currentStyle: Style, extra: T): Style & T {
  const handler: ProxyHandler<(...args: unknown[]) => string> = {
    apply(_target, _thisArg, args) {
      if (args.length === 1 && typeof args[0] === "string") {
        return (currentStyle as unknown as (s: string) => string)(args[0])
      }
      if (args.length > 0 && Array.isArray(args[0]) && "raw" in args[0]) {
        return (currentStyle as unknown as (s: TemplateStringsArray, ...v: unknown[]) => string)(
          args[0] as TemplateStringsArray,
          ...args.slice(1),
        )
      }
      return (currentStyle as unknown as (s: string) => string)(String(args[0] ?? ""))
    },

    get(_target, prop) {
      if (prop in extra) {
        const value = (extra as Record<string | symbol, unknown>)[prop]
        if (typeof value === "function") return value
        return value
      }

      if (typeof prop === "symbol") {
        if (prop === Symbol.dispose) {
          return (extra as Record<symbol, unknown>)[Symbol.dispose]
        }
        return undefined
      }

      if (STYLE_METHODS.has(prop)) {
        const method = currentStyle[prop as keyof Style]
        if (typeof method === "function") {
          return (...args: unknown[]) => {
            const newStyle = (method as Function).apply(currentStyle, args) as Style
            return createChainProxy(newStyle, extra)
          }
        }
      }

      const styleProp = currentStyle[prop as keyof Style]
      if (styleProp !== undefined) {
        if (typeof styleProp === "function" || typeof styleProp === "object") {
          return createChainProxy(styleProp as Style, extra)
        }
        return styleProp
      }

      return undefined
    },

    has(_target, prop) {
      if (prop in extra) return true
      if (typeof prop === "string" && prop in currentStyle) return true
      return false
    },
  }

  const proxyTarget = function () {} as unknown as (...args: unknown[]) => string
  return new Proxy(proxyTarget, handler) as unknown as Style & T
}
