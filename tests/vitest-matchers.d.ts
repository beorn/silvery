import "vitest"

interface SilveryRetryOptions {
  timeout?: number
}

declare module "vitest" {
  interface Assertion<R extends void | Promise<void> = void, T = unknown> {
    /**
     * vitest's OWN snapshot matchers, re-declared.
     *
     * They are not ours and we would rather not restate them. vitest declares
     * them by augmenting `@vitest/expect`'s `Assertion`, but `vitest` only
     * RE-EXPORTS that type, so a `declare module "vitest" { interface Assertion }`
     * anywhere in the program mints a fresh, unmerged interface — and the call
     * sites resolve against that one, which carries the custom matchers and none
     * of the built-ins.
     *
     * termless does exactly that, in its `src/jest-matchers.ts`, which reaches
     * our program transitively through our own sources — no import of termless
     * by the failing test is needed. Isolated, it is sufficient on its own, and
     * re-pointing THIS file at `@vitest/expect` does not help.
     *
     * `@termless/test/matchers` is NOT the culprit, despite being the obvious
     * suspect: its `"vitest"` block declares `Matchers` only, which merges
     * harmlessly. It is what supplies the `Did you mean 'toMatchSvgSnapshot'?`
     * suggestion on the resulting error, which is exactly what makes it look
     * guilty. Without it the same defect reports a bare TS2339.
     *
     * Delete these two lines once termless's `src/jest-matchers.ts` stops
     * declaring `Assertion` inside `declare module "vitest"`;
     * `tests/examples/dashboard.test.tsx` and
     * `tests/features/selection-cell-semantics.test.tsx` are the call sites that
     * will tell you immediately.
     *
     * vitest 5 update (29257): expect is bundled and vitest declares `Assertion`
     * itself, so augmenting `"vitest"` merges instead of minting a fresh
     * interface, and termless no longer declares `Assertion` in `"vitest"` — the
     * hazard above is gone. Kept for now; its removal is a separate cleanup.
     */
    toMatchSnapshot(snapshot?: unknown, hint?: string): void
    toMatchInlineSnapshot(properties?: unknown, snapshot?: string, hint?: string): void

    toContainText(text: string, options?: SilveryRetryOptions): void
    toHaveText(text: string, options?: SilveryRetryOptions): void
    toMatchLines(lines: string[], options?: SilveryRetryOptions): void
    toContainOutput(text: string, options?: SilveryRetryOptions): void
    toHaveAttrs(attrs: Record<string, unknown>): void
    toBeBold(): void
    toBeItalic(): void
    toBeUnderline(): void
    toBeInverse(): void
    toHaveFg(color: unknown): void
    toHaveBg(color: unknown): void
    toBeInMode(mode: string): void
    toHaveCursor(
      props: { x?: number; y?: number; visible?: boolean; style?: string },
      options?: SilveryRetryOptions,
    ): void
  }

  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toContainText(text: string, options?: SilveryRetryOptions): void
    toHaveText(text: string, options?: SilveryRetryOptions): void
    toMatchLines(lines: string[], options?: SilveryRetryOptions): void
    toContainOutput(text: string, options?: SilveryRetryOptions): void
    toHaveAttrs(attrs: Record<string, unknown>): void
    toBeBold(): void
    toBeItalic(): void
    toBeUnderline(): void
    toBeInverse(): void
    toHaveFg(color: unknown): void
    toHaveBg(color: unknown): void
    toBeInMode(mode: string): void
    toHaveCursor(
      props: { x?: number; y?: number; visible?: boolean; style?: string },
      options?: SilveryRetryOptions,
    ): void
  }
}
