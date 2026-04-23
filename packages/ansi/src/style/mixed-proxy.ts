/**
 * Mixed style proxy — combines a Style instance with additional properties.
 *
 * Used by ag-term to create a Term that is both a style chain (term.bold.red('text'))
 * and a terminal interface (term.write(), etc.).
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
      // Forward all args to the Style proxy — it handles multi-arg, template literals, etc.
      return (currentStyle as unknown as (...a: unknown[]) => string)(...args)
    },

    get(_target, prop) {
      if (prop in extra) {
        const value = (extra as Record<string | symbol, unknown>)[prop]
        if (typeof value === "function") return value
        return value
      }

      if (typeof prop === "symbol") {
        // Symbol-keyed lookups always go to `extra` (the Term's underlying
        // object). Handles Symbol.dispose as well as silvery's own private
        // symbols (STDIN_SYMBOL / STDOUT_SYMBOL from term-internal.ts).
        // The previous branch that special-cased only Symbol.dispose
        // prevented getInternalStreams(term) from reading the hidden streams.
        return (extra as Record<symbol, unknown>)[prop]
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

    set(_target, prop, value) {
      ;(extra as Record<string | symbol, unknown>)[prop] = value
      return true
    },

    defineProperty(_target, prop, descriptor) {
      Object.defineProperty(extra, prop, descriptor)
      return true
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
