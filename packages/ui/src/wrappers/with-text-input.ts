/**
 * withTextInput - CLI wrapper for text input prompts
 */

import chalk from "chalk";
import type { TextInputOptions } from "../types.js";
import {
  CURSOR_HIDE,
  CURSOR_SHOW,
  CURSOR_TO_START,
  CLEAR_LINE_END,
  write,
  isTTY,
} from "../cli/ansi";

/**
 * Prompt for text input in the terminal
 *
 * @example
 * ```ts
 * // Simple usage
 * const name = await withTextInput("What is your name?");
 *
 * // With options
 * const password = await withTextInput("Password:", { mask: "*" });
 *
 * // With validation
 * const email = await withTextInput("Email:", {
 *   validate: (v) => v.includes("@") ? undefined : "Invalid email"
 * });
 *
 * // With autocomplete
 * const fruit = await withTextInput("Pick a fruit:", {
 *   autocomplete: ["apple", "banana", "cherry"]
 * });
 * ```
 */
export async function withTextInput(
  prompt: string,
  options: TextInputOptions = {},
): Promise<string> {
  const stream = options.stream ?? process.stdout;
  const inputStream = options.inputStream ?? process.stdin;
  const isTty = isTTY(stream);

  // Initialize state
  let value = options.defaultValue ?? "";
  let cursorPosition = value.length;
  let errorMessage: string | undefined;

  // Setup raw mode for character-by-character input
  if (inputStream.isTTY) {
    inputStream.setRawMode(true);
  }
  inputStream.resume();

  // Render the current state
  const render = () => {
    const displayValue = options.mask ? options.mask.repeat(value.length) : value;

    const suggestion = getAutocompleteSuggestion(value, options.autocomplete);
    const suggestionSuffix = suggestion ? chalk.dim(suggestion.slice(value.length)) : "";

    // Build cursor display
    const beforeCursor = displayValue.slice(0, cursorPosition);
    const cursorChar = displayValue[cursorPosition] ?? " ";
    const afterCursor = displayValue.slice(cursorPosition + 1);

    // Placeholder when empty
    const showPlaceholder = !value && options.placeholder;
    const inputDisplay = showPlaceholder
      ? chalk.dim(options.placeholder) + chalk.inverse(" ")
      : beforeCursor + chalk.inverse(cursorChar) + afterCursor + suggestionSuffix;

    // Error message
    const errorDisplay = errorMessage ? chalk.red(` (${errorMessage})`) : "";

    const line = `${chalk.cyan("?")} ${chalk.bold(prompt)} ${inputDisplay}${errorDisplay}`;

    if (isTty) {
      write(`${CURSOR_TO_START}${line}${CLEAR_LINE_END}`, stream);
    }
  };

  // Hide cursor during input (we show our own)
  if (isTty) {
    write(CURSOR_HIDE, stream);
  }

  render();

  return new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      inputStream.removeListener("data", onData);
      inputStream.removeListener("error", onError);
      if (inputStream.isTTY) {
        inputStream.setRawMode(false);
      }
      inputStream.pause();
      if (isTty) {
        write(CURSOR_SHOW, stream);
      }
    };

    const submit = () => {
      // Validate before accepting
      if (options.validate) {
        const error = options.validate(value);
        if (error) {
          errorMessage = error;
          render();
          return;
        }
      }

      cleanup();

      // Show final value
      const displayValue = options.mask ? options.mask.repeat(value.length) : value;
      write(
        `${CURSOR_TO_START}${chalk.green("✔")} ${chalk.bold(prompt)} ${chalk.dim(displayValue)}${CLEAR_LINE_END}\n`,
        stream,
      );

      resolve(value);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onData = (data: Buffer) => {
      const input = data.toString();
      errorMessage = undefined; // Clear error on any input

      // Handle special keys
      for (let i = 0; i < input.length; i++) {
        const char = input[i]!;
        const code = char.charCodeAt(0);

        // Enter (CR or LF)
        if (code === 13 || code === 10) {
          submit();
          return;
        }

        // Ctrl+C - abort
        if (code === 3) {
          cleanup();
          write("\n", stream);
          reject(new Error("User aborted"));
          return;
        }

        // Escape - clear or abort
        if (code === 27) {
          // Check for arrow key sequences
          if (input[i + 1] === "[") {
            const arrowCode = input[i + 2];
            if (arrowCode === "D") {
              // Left arrow
              cursorPosition = Math.max(0, cursorPosition - 1);
              i += 2;
              continue;
            }
            if (arrowCode === "C") {
              // Right arrow
              cursorPosition = Math.min(value.length, cursorPosition + 1);
              i += 2;
              continue;
            }
            if (arrowCode === "H") {
              // Home
              cursorPosition = 0;
              i += 2;
              continue;
            }
            if (arrowCode === "F") {
              // End
              cursorPosition = value.length;
              i += 2;
              continue;
            }
            // Skip other escape sequences
            i += 2;
            continue;
          }
          // Plain escape - clear input
          value = "";
          cursorPosition = 0;
          continue;
        }

        // Backspace (127 or 8)
        if (code === 127 || code === 8) {
          if (cursorPosition > 0) {
            value = value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
            cursorPosition--;
          }
          continue;
        }

        // Delete (escape sequence handled above)
        if (code === 4) {
          // Ctrl+D acts as delete
          if (cursorPosition < value.length) {
            value = value.slice(0, cursorPosition) + value.slice(cursorPosition + 1);
          }
          continue;
        }

        // Tab - accept autocomplete suggestion
        if (code === 9) {
          const suggestion = getAutocompleteSuggestion(value, options.autocomplete);
          if (suggestion) {
            value = suggestion;
            cursorPosition = value.length;
          }
          continue;
        }

        // Ctrl+A - beginning of line
        if (code === 1) {
          cursorPosition = 0;
          continue;
        }

        // Ctrl+E - end of line
        if (code === 5) {
          cursorPosition = value.length;
          continue;
        }

        // Ctrl+U - clear to beginning
        if (code === 21) {
          value = value.slice(cursorPosition);
          cursorPosition = 0;
          continue;
        }

        // Ctrl+K - clear to end
        if (code === 11) {
          value = value.slice(0, cursorPosition);
          continue;
        }

        // Ctrl+W - delete word backward
        if (code === 23) {
          const before = value.slice(0, cursorPosition);
          const after = value.slice(cursorPosition);
          const trimmed = before.trimEnd();
          const lastSpace = trimmed.lastIndexOf(" ");
          const newBefore = lastSpace === -1 ? "" : trimmed.slice(0, lastSpace + 1);
          value = newBefore + after;
          cursorPosition = newBefore.length;
          continue;
        }

        // Regular printable character
        if (code >= 32 && code < 127) {
          value = value.slice(0, cursorPosition) + char + value.slice(cursorPosition);
          cursorPosition++;
          continue;
        }

        // Handle UTF-8 characters (multi-byte)
        if (code > 127) {
          value = value.slice(0, cursorPosition) + char + value.slice(cursorPosition);
          cursorPosition++;
          continue;
        }
      }

      render();
    };

    inputStream.on("data", onData);
    inputStream.on("error", onError);
  });
}

/**
 * Create a text input instance for manual control
 *
 * @example
 * ```ts
 * const input = createTextInput("Name:", { placeholder: "Enter name" });
 * input.render();
 *
 * // Later, get the value
 * const value = await input.waitForSubmit();
 * ```
 */
export function createTextInput(prompt: string, options: TextInputOptions = {}): TextInputInstance {
  const stream = options.stream ?? process.stdout;
  const isTty = isTTY(stream);

  let value = options.defaultValue ?? "";
  let cursorPosition = value.length;

  const render = () => {
    const displayValue = options.mask ? options.mask.repeat(value.length) : value;

    const suggestion = getAutocompleteSuggestion(value, options.autocomplete);
    const suggestionSuffix = suggestion ? chalk.dim(suggestion.slice(value.length)) : "";

    const beforeCursor = displayValue.slice(0, cursorPosition);
    const cursorChar = displayValue[cursorPosition] ?? " ";
    const afterCursor = displayValue.slice(cursorPosition + 1);

    const showPlaceholder = !value && options.placeholder;
    const inputDisplay = showPlaceholder
      ? chalk.dim(options.placeholder) + chalk.inverse(" ")
      : beforeCursor + chalk.inverse(cursorChar) + afterCursor + suggestionSuffix;

    const line = `${chalk.cyan("?")} ${chalk.bold(prompt)} ${inputDisplay}`;

    if (isTty) {
      write(`${CURSOR_TO_START}${line}${CLEAR_LINE_END}`, stream);
    }
  };

  return {
    get value() {
      return value;
    },
    set value(v: string) {
      value = v;
      cursorPosition = Math.min(cursorPosition, v.length);
    },
    get cursorPosition() {
      return cursorPosition;
    },
    set cursorPosition(pos: number) {
      cursorPosition = Math.max(0, Math.min(value.length, pos));
    },
    render,
    insert(char: string) {
      value = value.slice(0, cursorPosition) + char + value.slice(cursorPosition);
      cursorPosition += char.length;
    },
    backspace() {
      if (cursorPosition > 0) {
        value = value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
        cursorPosition--;
      }
    },
    delete() {
      if (cursorPosition < value.length) {
        value = value.slice(0, cursorPosition) + value.slice(cursorPosition + 1);
      }
    },
    clear() {
      value = "";
      cursorPosition = 0;
    },
    acceptSuggestion() {
      const suggestion = getAutocompleteSuggestion(value, options.autocomplete);
      if (suggestion) {
        value = suggestion;
        cursorPosition = value.length;
      }
    },
  };
}

/** Instance returned by createTextInput for manual control */
export interface TextInputInstance {
  /** Current input value */
  value: string;
  /** Current cursor position */
  cursorPosition: number;
  /** Render the current state */
  render(): void;
  /** Insert text at cursor */
  insert(char: string): void;
  /** Delete character before cursor */
  backspace(): void;
  /** Delete character at cursor */
  delete(): void;
  /** Clear all input */
  clear(): void;
  /** Accept autocomplete suggestion */
  acceptSuggestion(): void;
}

/**
 * Find a matching autocomplete suggestion for the current input
 */
function getAutocompleteSuggestion(value: string, autocomplete?: string[]): string | undefined {
  if (!value || !autocomplete?.length) {
    return undefined;
  }

  const lowerValue = value.toLowerCase();
  return autocomplete.find(
    (item) => item.toLowerCase().startsWith(lowerValue) && item.length > value.length,
  );
}
