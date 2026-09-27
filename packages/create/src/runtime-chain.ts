/** Target-neutral apply-chain surface for browser and terminal runtimes. */

export { createBaseApp } from "./runtime/base-app"
export type { Apply, BaseApp } from "./runtime/base-app"

export { withTerminalChain } from "./runtime/with-terminal-chain"
export type {
  KeyShape,
  ModifierState,
  TerminalStore,
  WithTerminalChainOptions,
} from "./runtime/with-terminal-chain"

export { withPasteChain } from "./runtime/with-paste-chain"
export type { PasteHandler, PasteStore, WithPasteChainOptions } from "./runtime/with-paste-chain"

export { withInputChain } from "./runtime/with-input-chain"
export type { InputHandler, InputStore } from "./runtime/with-input-chain"

export { withFocusChain } from "./runtime/with-focus-chain"
export type {
  FocusChainStore,
  FocusKeyDispatch,
  HasActiveFocus,
  WithFocusChainOptions,
} from "./runtime/with-focus-chain"

export { withCustomEvents } from "./runtime/with-custom-events"
export type { CustomEventHandler, CustomEventStore } from "./runtime/with-custom-events"
