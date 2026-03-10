/**
 * Pure diff function for silvery-loop.
 *
 * Takes prev and next buffers, returns minimal ANSI patch.
 * This is an internal function used by the runtime.
 */

import { outputPhase } from "../pipeline";
import type { Buffer } from "./types";

/**
 * Diff mode for ANSI output.
 */
export type DiffMode = "fullscreen" | "inline";

/**
 * Compute the minimal ANSI diff between two buffers.
 *
 * @param prev Previous buffer (null on first render)
 * @param next Current buffer
 * @param mode Render mode (fullscreen or inline)
 * @returns ANSI escape sequence string to transform prev into next
 *
 * @example
 * ```typescript
 * import { diff, layout } from '@silvery/term/runtime'
 *
 * const prev = layout(<Text>Hello</Text>, dims)
 * const next = layout(<Text>World</Text>, dims)
 * const patch = diff(prev, next)
 * process.stdout.write(patch)
 * ```
 */
export function diff(
  prev: Buffer | null,
  next: Buffer,
  mode: DiffMode = "fullscreen",
  scrollbackOffset = 0,
  termRows?: number,
): string {
  const prevBuffer = prev?._buffer ?? null;
  const nextBuffer = next._buffer;

  return outputPhase(prevBuffer, nextBuffer, mode, scrollbackOffset, termRows);
}

/**
 * Render a buffer to ANSI string (no diff, full render).
 *
 * @param buffer Buffer to render
 * @param mode Render mode (fullscreen or inline)
 * @returns Full ANSI output
 */
export function render(buffer: Buffer, mode: DiffMode = "fullscreen"): string {
  return outputPhase(null, buffer._buffer, mode);
}
