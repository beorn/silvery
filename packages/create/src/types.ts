/**
 * Silvery Types — re-exports from @silvery/ag/types plus runtime-apply-chain types.
 *
 * Runtime types: `Op`, `Effect`, `ApplyResult` — used by the apply-chain
 * event loop (`runtime/event-loop`) and the `with*` plugins.
 */

// Re-export core shape types from @silvery/ag.
export * from "@silvery/ag/types"

// ---------------------------------------------------------------------------
// Apply-chain runtime types (Phase 2)
// ---------------------------------------------------------------------------

/**
 * An `Op` is a typed intent — the unit dispatched through the apply chain.
 * Mirrors a Redux-style action: `{type}` discriminator plus free-form payload.
 *
 * Ops have no inherent render semantics; each plugin decides whether it
 * wants to handle, mutate its store slice, and return effects.
 */
export type Op = { type: string; [key: string]: unknown }

/**
 * An `Effect` is a request emitted by a plugin that the runner must
 * execute after the apply chain returns. Effects are data, not closures:
 * they are serializable, inspectable, and replayable.
 *
 * Well-known effect types interpreted by the create-app runner:
 * - `{type: "render"}`          — schedule a render pass
 * - `{type: "render-barrier"}`  — force a render + microtask flush before the next op
 * - `{type: "exit"}`            — quit the app
 * - `{type: "suspend"}`         — Ctrl+Z suspend (SIGTSTP)
 * - `{type: "dispatch", ...}`   — re-dispatch another Op (append to queue)
 */
export type Effect = { type: string; [key: string]: unknown }

/**
 * An apply function's return channel.
 *
 *   - `false`    — not handled, pass through to the next plugin (or ignore)
 *   - `Effect[]` — handled; empty array means "handled, no side effects"
 *
 * This is what makes the chain explicit: a plugin signals BOTH "I
 * handled it" and "here is what should happen next" in one value.
 */
export type ApplyResult = false | Effect[]
