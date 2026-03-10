/**
 * withSpinner - Wrap promises with an animated spinner
 */

import type { WithSpinnerOptions } from "../types.js";
import { Spinner } from "../cli/spinner";

/**
 * Wrap a promise with an animated spinner
 *
 * @example
 * ```ts
 * // Simple usage
 * const data = await withSpinner(fetchData(), "Loading data...");
 *
 * // With options
 * const result = await withSpinner(
 *   processFiles(),
 *   "Processing...",
 *   { style: "arc", clearOnComplete: true }
 * );
 *
 * // With dynamic text
 * const result = await withSpinner(
 *   longOperation(),
 *   (elapsed) => `Processing... (${elapsed}s)`
 * );
 * ```
 */
export async function withSpinner<T>(
  promise: Promise<T> | (() => T | Promise<T>),
  text: string | ((elapsedSeconds: number) => string),
  options: WithSpinnerOptions = {},
): Promise<T> {
  const spinner = new Spinner({
    text: typeof text === "string" ? text : text(0),
    style: options.style,
    color: options.color,
  });

  let timer: ReturnType<typeof setInterval> | null = null;
  const startTime = Date.now();

  spinner.start();

  // Update text if dynamic
  if (typeof text === "function") {
    timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      spinner.currentText = text(elapsed);
    }, 1000);
  }

  try {
    const result = await (typeof promise === "function" ? promise() : promise);

    if (timer) clearInterval(timer);

    if (options.clearOnComplete) {
      spinner.stop();
    } else {
      spinner.succeed();
    }

    return result;
  } catch (error) {
    if (timer) clearInterval(timer);
    spinner.fail(error instanceof Error ? error.message : "Failed");
    throw error;
  }
}

/**
 * Attach a spinner to a promise for manual control
 * Returns [result, spinner] tuple for custom control
 *
 * @example
 * ```ts
 * const [promise, spinner] = attachSpinner(fetchData(), "Loading...");
 * spinner.text = "Still loading...";
 * const result = await promise;
 * spinner.succeed("Loaded!");
 * ```
 */
export function attachSpinner<T>(
  promise: Promise<T>,
  text: string,
  options: WithSpinnerOptions = {},
): [Promise<T>, Spinner] {
  const spinner = new Spinner({
    text,
    style: options.style,
    color: options.color,
  });

  spinner.start();

  async function wrapPromise(): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : "Failed");
      throw error;
    }
  }

  return [wrapPromise(), spinner];
}
