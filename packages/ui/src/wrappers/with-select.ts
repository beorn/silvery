/**
 * withSelect - Interactive CLI selection list
 */

import chalk from "chalk";
import type { SelectOption, WithSelectOptions } from "../types.js";
import {
  CURSOR_HIDE,
  CURSOR_SHOW,
  CURSOR_TO_START,
  CLEAR_LINE_END,
  cursorUp,
  write,
  isTTY,
} from "../cli/ansi";

/**
 * Display an interactive selection list in the terminal
 *
 * @example
 * ```ts
 * // Simple usage
 * const color = await withSelect("Choose a color:", [
 *   { label: "Red", value: "red" },
 *   { label: "Green", value: "green" },
 *   { label: "Blue", value: "blue" },
 * ]);
 *
 * // With options
 * const result = await withSelect(
 *   "Select item:",
 *   options,
 *   { initial: 2, maxVisible: 5 }
 * );
 * ```
 */
export async function withSelect<T>(
  prompt: string,
  options: SelectOption<T>[],
  selectOptions: WithSelectOptions = {},
): Promise<T> {
  const { initial = 0, maxVisible = 10 } = selectOptions;
  const stream = process.stdout;
  const stdin = process.stdin;

  if (!isTTY(stream) || !stdin.isTTY) {
    // Non-interactive mode: return first option or initial
    return options[initial]?.value ?? options[0]!.value;
  }

  return new Promise((resolve, reject) => {
    let highlightIndex = Math.min(Math.max(0, initial), options.length - 1);
    let linesRendered = 0;

    // Enable raw mode for character-by-character input
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    // Hide cursor
    write(CURSOR_HIDE, stream);

    function render() {
      // Clear previously rendered lines
      if (linesRendered > 0) {
        write(cursorUp(linesRendered), stream);
      }

      // Calculate scroll window
      const scrollOffset = Math.max(
        0,
        Math.min(highlightIndex - Math.floor(maxVisible / 2), options.length - maxVisible),
      );
      const visibleCount = Math.min(maxVisible, options.length);
      const visibleOptions = options.slice(scrollOffset, scrollOffset + visibleCount);
      const hasMoreAbove = scrollOffset > 0;
      const hasMoreBelow = scrollOffset + visibleCount < options.length;

      // Render prompt
      write(`${CURSOR_TO_START}${chalk.bold(prompt)}${CLEAR_LINE_END}\n`, stream);

      let lines = 1;

      // Render scroll indicator (above)
      if (hasMoreAbove) {
        write(`${CURSOR_TO_START}  ${chalk.dim("...")}${CLEAR_LINE_END}\n`, stream);
        lines++;
      }

      // Render options
      for (let i = 0; i < visibleOptions.length; i++) {
        const option = visibleOptions[i];
        const actualIndex = scrollOffset + i;
        const isHighlighted = actualIndex === highlightIndex;

        const indicator = isHighlighted ? chalk.cyan(">") : " ";
        const label = isHighlighted ? chalk.cyan(option!.label) : option!.label;

        write(`${CURSOR_TO_START}${indicator} ${label}${CLEAR_LINE_END}\n`, stream);
        lines++;
      }

      // Render scroll indicator (below)
      if (hasMoreBelow) {
        write(`${CURSOR_TO_START}  ${chalk.dim("...")}${CLEAR_LINE_END}\n`, stream);
        lines++;
      }

      linesRendered = lines;
    }

    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onKeypress);
      write(CURSOR_SHOW, stream);
    }

    function onKeypress(key: string) {
      // Handle key sequences
      const keyCode = key.charCodeAt(0);

      // Ctrl+C
      if (key === "\x03") {
        cleanup();
        reject(new Error("User cancelled"));
        return;
      }

      // Enter/Return
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(options[highlightIndex]!.value);
        return;
      }

      // Escape
      if (key === "\x1b" && key.length === 1) {
        cleanup();
        reject(new Error("User cancelled"));
        return;
      }

      // Arrow keys (escape sequences)
      if (key.startsWith("\x1b[")) {
        const code = key.slice(2);
        if (code === "A") {
          // Up arrow
          highlightIndex = Math.max(0, highlightIndex - 1);
          render();
        } else if (code === "B") {
          // Down arrow
          highlightIndex = Math.min(options.length - 1, highlightIndex + 1);
          render();
        }
        return;
      }

      // j/k vim keys
      if (key === "j" || key === "J") {
        highlightIndex = Math.min(options.length - 1, highlightIndex + 1);
        render();
        return;
      }
      if (key === "k" || key === "K") {
        highlightIndex = Math.max(0, highlightIndex - 1);
        render();
        return;
      }

      // Space to select (optional alternative to Enter)
      if (key === " ") {
        cleanup();
        resolve(options[highlightIndex]!.value);
        return;
      }
    }

    stdin.on("data", onKeypress);
    render();
  });
}

/**
 * Create a reusable select instance for multiple selections
 *
 * @example
 * ```ts
 * const select = createSelect({
 *   maxVisible: 5,
 * });
 *
 * const first = await select("Choose first:", options1);
 * const second = await select("Choose second:", options2);
 * ```
 */
export function createSelect(
  defaultOptions: WithSelectOptions = {},
): <T>(prompt: string, options: SelectOption<T>[], overrides?: WithSelectOptions) => Promise<T> {
  return <T>(prompt: string, options: SelectOption<T>[], overrides: WithSelectOptions = {}) =>
    withSelect(prompt, options, { ...defaultOptions, ...overrides });
}
