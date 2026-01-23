/**
 * Inkx React Contexts
 *
 * Provides contexts for:
 * - NodeContext: Access to the current InkxNode (for useLayout)
 * - AppContext: App-level controls (exit, etc.)
 * - StdioContext: Access to stdin/stdout
 */

import type { EventEmitter } from "node:events";
import { createContext } from "react";
import type { InkxNode } from "./types.js";

// ============================================================================
// Node Context
// ============================================================================

/**
 * Context that provides access to the current InkxNode.
 * Used by useLayout() to subscribe to layout changes.
 *
 * Each Box/Text component wraps its children in a NodeContext.Provider
 * with its corresponding InkxNode.
 */
export const NodeContext = createContext<InkxNode | null>(null);

// ============================================================================
// App Context
// ============================================================================

export interface AppContextValue {
  /** Exit the application with optional error */
  exit: (error?: Error) => void;
}

/**
 * Context for app-level controls.
 * Used by useApp() hook.
 */
export const AppContext = createContext<AppContextValue | null>(null);

// ============================================================================
// Stdio Context
// ============================================================================

export interface StdoutContextValue {
  /** Standard output stream */
  stdout: NodeJS.WriteStream;
  /** Write to stdout */
  write: (data: string) => void;
}

/**
 * Context for stdout access.
 * Used by useStdout() hook.
 */
export const StdoutContext = createContext<StdoutContextValue | null>(null);

// ============================================================================
// Stdin Context
// ============================================================================

export interface StdinContextValue {
  /** Standard input stream */
  stdin: NodeJS.ReadStream;
  /** Whether raw mode is supported */
  isRawModeSupported: boolean;
  /** Set raw mode on stdin */
  setRawMode: (value: boolean) => void;
}

/**
 * Context for stdin access.
 * Used by useStdin() hook.
 */
export const StdinContext = createContext<StdinContextValue | null>(null);

// ============================================================================
// Input Context
// ============================================================================

export interface InputContextValue {
  /** Event emitter for input events */
  eventEmitter: EventEmitter;
  /** Whether to exit on Ctrl+C */
  exitOnCtrlC: boolean;
}

/**
 * Context for input handling.
 * Used by useInput() hook.
 */
export const InputContext = createContext<InputContextValue | null>(null);

// ============================================================================
// Focus Context
// ============================================================================

export interface FocusContextValue {
  /** Currently focused element ID */
  activeId: string | null;
  /** Add a focusable element */
  add: (id: string, options?: { autoFocus?: boolean }) => void;
  /** Remove a focusable element */
  remove: (id: string) => void;
  /** Activate a focusable element (make it eligible for focus) */
  activate: (id: string) => void;
  /** Deactivate a focusable element (make it ineligible for focus) */
  deactivate: (id: string) => void;
  /** Set focus to element by ID */
  focus: (id: string) => void;
  /** Focus next element */
  focusNext: () => void;
  /** Focus previous element */
  focusPrevious: () => void;
  /** Enable focus management */
  enableFocus: () => void;
  /** Disable focus management */
  disableFocus: () => void;
  /** Is focus management enabled */
  isFocusEnabled: boolean;
}

/**
 * Context for focus management.
 * Used by useFocus() and useFocusManager() hooks.
 */
export const FocusContext = createContext<FocusContextValue | null>(null);
