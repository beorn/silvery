/**
 * wrapGenerator - Consume a generator while showing progress
 */

import type { ProgressGenerator } from "../types.js";
import { ProgressBar } from "../cli/progress-bar";
import { CURSOR_HIDE, CURSOR_SHOW, write, isTTY } from "../cli/ansi";

/**
 * Consume a progress generator while displaying progress
 *
 * @example
 * ```ts
 * // Wrap existing generator (like evaluateAllRules())
 * await wrapGenerator(evaluateAllRules(), "Evaluating rules");
 *
 * // With custom format
 * await wrapGenerator(
 *   processItems(),
 *   ({ current, total }) => `Processing: ${current}/${total}`
 * );
 *
 * // Get the generator's return value
 * const result = await wrapGenerator(generatorWithReturn(), "Processing");
 * ```
 */
export async function wrapGenerator<T>(
  generator: ProgressGenerator<T>,
  textOrFormat: string | ((progress: { current: number; total: number }) => string),
  options: { clearOnComplete?: boolean } = {},
): Promise<T> {
  const stream = process.stdout;
  const isTty = isTTY(stream);

  const isCustomFormat = typeof textOrFormat === "function";
  const label = isCustomFormat ? "" : textOrFormat;

  const bar = new ProgressBar({
    format: label ? `${label} [:bar] :current/:total :percent` : ":bar :current/:total :percent",
    hideCursor: true,
  });

  if (isTty) {
    write(CURSOR_HIDE, stream);
  }

  let started = false;
  let result: IteratorResult<{ current: number; total: number }, T>;

  try {
    // Consume the generator
    while (true) {
      result = generator.next();

      if (result.done) {
        break;
      }

      const { current, total } = result.value;

      if (!started) {
        bar.start(current, total);
        started = true;
      } else {
        bar.update(current);
      }
    }

    // Stop bar
    if (started) {
      bar.stop(options.clearOnComplete);
    }
    if (isTty) {
      write(CURSOR_SHOW, stream);
    }

    return result.value;
  } catch (error) {
    if (started) {
      bar.stop();
    }
    if (isTty) {
      write(CURSOR_SHOW, stream);
    }
    throw error;
  }
}

/**
 * Create an async iterable wrapper that shows progress
 *
 * @example
 * ```ts
 * const items = [1, 2, 3, 4, 5];
 * for await (const item of withIterableProgress(items, "Processing")) {
 *   await processItem(item);
 * }
 * ```
 */
export async function* withIterableProgress<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
  label: string,
  options: { clearOnComplete?: boolean } = {},
): AsyncGenerator<T, void, unknown> {
  const stream = process.stdout;
  const isTty = isTTY(stream);

  // Try to get length if array
  const items = Array.isArray(iterable) ? iterable : null;
  const total = items?.length ?? 0;

  const bar = new ProgressBar({
    format: `${label} [:bar] :current/:total :percent`,
    total,
    hideCursor: true,
  });

  if (isTty) {
    write(CURSOR_HIDE, stream);
  }

  let current = 0;
  bar.start(0, total);

  try {
    for await (const item of iterable as AsyncIterable<T>) {
      yield item;
      current++;
      bar.update(current);
    }

    bar.stop(options.clearOnComplete);
    if (isTty) {
      write(CURSOR_SHOW, stream);
    }
  } catch (error) {
    bar.stop();
    if (isTty) {
      write(CURSOR_SHOW, stream);
    }
    throw error;
  }
}
