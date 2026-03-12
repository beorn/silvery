/**
 * pipe() — Compose app plugins left-to-right.
 *
 * The foundational composition function for silvery's plugin system.
 * Each plugin is a function `(app) => enhancedApp` that takes an app object
 * and returns an enhanced version with additional capabilities.
 *
 * Plugins compose left-to-right: `pipe(base, p1, p2)` = `p2(p1(base))`
 *
 * @example
 * ```tsx
 * import { pipe, createApp, withReact, withTerminal, withFocus, withDomEvents } from '@silvery/tea'
 *
 * const app = pipe(
 *   createApp(store),
 *   withReact(<Board />),
 *   withTerminal(process),
 *   withFocus(),
 *   withDomEvents(),
 * )
 * await app.run()
 * ```
 *
 * @example Typed plugin
 * ```tsx
 * type MyPlugin = (app: App) => App & { custom: () => void }
 *
 * const withCustom: MyPlugin = (app) => ({
 *   ...app,
 *   custom: () => console.log('hello'),
 * })
 *
 * const enhanced = pipe(baseApp, withCustom)
 * enhanced.custom() // typed!
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A plugin function that enhances an app.
 *
 * Takes an app of type A and returns an enhanced app of type B.
 * The plugin can add new methods, override existing ones, or
 * wrap behavior via closures.
 */
export type AppPlugin<A, B> = (app: A) => B

// =============================================================================
// Implementation
// =============================================================================

/**
 * Compose app plugins left-to-right.
 *
 * `pipe(base, p1, p2, p3)` is equivalent to `p3(p2(p1(base)))`.
 *
 * Each plugin receives the result of the previous plugin, allowing
 * progressive enhancement of the app object.
 *
 * Type inference works through the chain: if p1 adds `.cmd` and p2
 * requires it, TypeScript catches the error at the call site.
 */
export function pipe<A>(base: A): A
export function pipe<A, B>(base: A, p1: AppPlugin<A, B>): B
export function pipe<A, B, C>(base: A, p1: AppPlugin<A, B>, p2: AppPlugin<B, C>): C
export function pipe<A, B, C, D>(base: A, p1: AppPlugin<A, B>, p2: AppPlugin<B, C>, p3: AppPlugin<C, D>): D
export function pipe<A, B, C, D, E>(
  base: A,
  p1: AppPlugin<A, B>,
  p2: AppPlugin<B, C>,
  p3: AppPlugin<C, D>,
  p4: AppPlugin<D, E>,
): E
export function pipe<A, B, C, D, E, F>(
  base: A,
  p1: AppPlugin<A, B>,
  p2: AppPlugin<B, C>,
  p3: AppPlugin<C, D>,
  p4: AppPlugin<D, E>,
  p5: AppPlugin<E, F>,
): F
export function pipe<A, B, C, D, E, F, G>(
  base: A,
  p1: AppPlugin<A, B>,
  p2: AppPlugin<B, C>,
  p3: AppPlugin<C, D>,
  p4: AppPlugin<D, E>,
  p5: AppPlugin<E, F>,
  p6: AppPlugin<F, G>,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  base: A,
  p1: AppPlugin<A, B>,
  p2: AppPlugin<B, C>,
  p3: AppPlugin<C, D>,
  p4: AppPlugin<D, E>,
  p5: AppPlugin<E, F>,
  p6: AppPlugin<F, G>,
  p7: AppPlugin<G, H>,
): H
export function pipe(base: unknown, ...plugins: AppPlugin<unknown, unknown>[]): unknown {
  let result = base
  for (const plugin of plugins) {
    result = plugin(result)
  }
  return result
}
