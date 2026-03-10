/**
 * wrapEmitter - Track EventEmitter state changes with progress indicators
 */

import type { EventEmitter } from "events";
import { Spinner } from "../cli/spinner";

/** Event handler configuration */
interface EventConfig {
  /** Display text for this event */
  text?: string;
  /** Dynamic text based on event data */
  getText?: (data: unknown) => string;
  /** Mark spinner as succeeded */
  succeed?: boolean;
  /** Mark spinner as failed */
  fail?: boolean;
  /** Stop tracking */
  stop?: boolean;
}

/** Configuration for wrapEmitter */
interface WrapEmitterConfig {
  /** Event handlers */
  events: Record<string, EventConfig>;
  /** Initial text */
  initialText?: string;
}

/**
 * Track EventEmitter state changes with a spinner
 *
 * @example
 * ```ts
 * const stop = wrapEmitter(syncManager, {
 *   initialText: "Starting sync...",
 *   events: {
 *     'ready': { text: "Watcher ready", succeed: true },
 *     'state-change': { getText: (s) => `State: ${s}` },
 *     'error': { fail: true },
 *     'idle': { stop: true }
 *   }
 * });
 *
 * // Later, to stop manually
 * stop();
 * ```
 */
export function wrapEmitter(emitter: EventEmitter, config: WrapEmitterConfig): () => void {
  const spinner = new Spinner(config.initialText ?? "");
  const handlers: Map<string, (...args: unknown[]) => void> = new Map();

  spinner.start();

  // Set up event handlers
  for (const [eventName, eventConfig] of Object.entries(config.events)) {
    const handler = (data: unknown) => {
      // Update text
      if (eventConfig.getText) {
        spinner.currentText = eventConfig.getText(data);
      } else if (eventConfig.text) {
        spinner.currentText = eventConfig.text;
      }

      // Handle terminal states
      if (eventConfig.succeed) {
        spinner.succeed();
        cleanup();
      } else if (eventConfig.fail) {
        const message = data instanceof Error ? data.message : String(data ?? "Failed");
        spinner.fail(message);
        cleanup();
      } else if (eventConfig.stop) {
        spinner.stop();
        cleanup();
      }
    };

    handlers.set(eventName, handler);
    emitter.on(eventName, handler);
  }

  // Cleanup function
  function cleanup() {
    for (const [eventName, handler] of handlers) {
      emitter.off(eventName, handler);
    }
    handlers.clear();
  }

  // Return stop function
  return () => {
    spinner.stop();
    cleanup();
  };
}

/**
 * Wait for an EventEmitter to emit a specific event
 * Shows a spinner while waiting
 *
 * @example
 * ```ts
 * await waitForEvent(syncManager, "ready", "Waiting for watcher...");
 * ```
 */
export async function waitForEvent(
  emitter: EventEmitter,
  eventName: string,
  text: string,
  options: {
    errorEvent?: string;
    timeout?: number;
  } = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const spinner = new Spinner(text);
    spinner.start();

    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      emitter.off(eventName, successHandler);
      if (options.errorEvent) {
        emitter.off(options.errorEvent, errorHandler);
      }
      if (timer) {
        clearTimeout(timer);
      }
    };

    const successHandler = (data: unknown) => {
      cleanup();
      spinner.succeed();
      resolve(data);
    };

    const errorHandler = (error: unknown) => {
      cleanup();
      spinner.fail(error instanceof Error ? error.message : "Error");
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    emitter.once(eventName, successHandler);

    if (options.errorEvent) {
      emitter.once(options.errorEvent, errorHandler);
    }

    if (options.timeout) {
      timer = setTimeout(() => {
        cleanup();
        spinner.fail("Timeout");
        reject(new Error(`Timeout waiting for ${eventName}`));
      }, options.timeout);
    }
  });
}
