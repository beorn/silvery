/**
 * Capability symbols — well-known keys for the CapabilityRegistry.
 *
 * Features register themselves under these symbols so other parts
 * of the composition chain can discover and interact with them.
 *
 * @internal Not exported from the public barrel.
 */

/** Selection feature: text selection state + mouse handling. */
export const SELECTION_CAPABILITY = Symbol.for("silvery.selection")

/** Clipboard feature: copy/paste via OSC 52 or other backends. */
export const CLIPBOARD_CAPABILITY = Symbol.for("silvery.clipboard")

/** Copy-mode feature: keyboard-driven selection (Esc+v). */
export const COPY_MODE_CAPABILITY = Symbol.for("silvery.copy-mode")

/** Find feature: text search (Ctrl+F). */
export const FIND_CAPABILITY = Symbol.for("silvery.find")

/** Drag feature: drag-and-drop state + mouse handling. */
export const DRAG_CAPABILITY = Symbol.for("silvery.drag")

/** Input router: priority-based event dispatch for interaction features. */
export const INPUT_ROUTER = Symbol.for("silvery.input-router")
