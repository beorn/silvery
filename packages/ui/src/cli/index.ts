/**
 * CLI progress indicators - direct stdout usage (no React)
 *
 * @example
 * ```ts
 * import { Spinner, ProgressBar, MultiProgress } from "@hightea/ui/cli";
 *
 * // Quick spinner
 * const stop = Spinner.start("Loading...");
 * await work();
 * stop();
 *
 * // Spinner with result
 * const spinner = new Spinner("Processing...");
 * spinner.start();
 * spinner.succeed("Done!");
 *
 * // Progress bar
 * const bar = new ProgressBar({ total: 100 });
 * bar.start();
 * bar.update(50);
 * bar.stop();
 *
 * // Multiple tasks
 * const multi = new MultiProgress();
 * const task1 = multi.add("Download", { type: "bar", total: 100 });
 * const task2 = multi.add("Process", { type: "spinner" });
 * multi.start();
 * task1.start();
 * task1.update(50);
 * task1.complete();
 * multi.stop();
 * ```
 */

export { Spinner, SPINNER_FRAMES, createSpinner, type CallableSpinner } from "./spinner.js"
export { ProgressBar } from "./progress-bar.js"
export { MultiProgress, type TaskHandle } from "./multi-progress.js"
export * from "./ansi.js"
