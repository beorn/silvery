/**
 * withKeybindings - SlateJS-style plugin for keybinding wiring
 *
 * Intercepts `press()` calls and routes them to commands via keybinding resolution.
 * Commands not in the registry fall through to component useInput handlers.
 *
 * @example
 * ```tsx
 * const app = withKeybindings(withCommands(render(<Board />), cmdOpts), {
 *   bindings: defaultKeybindings,
 *   getKeyContext: () => ({ mode: 'normal', hasSelection: false, ... }),
 * })
 *
 * // Press 'j' → resolves to cursor_down → calls app.cmd.down()
 * await app.press('j')
 *
 * // Press 'x' (no binding) → passes through to useInput handlers
 * await app.press('x')
 * ```
 *
 * See docs/future/silvery-command-api-research.md for design rationale.
 */

import type { AppWithCommands, KeybindingDef } from "./with-commands";
import { parseHotkey } from "./keys";

// =============================================================================
// Types
// =============================================================================

/**
 * Context for keybinding resolution.
 * Used to match mode-specific bindings and conditional bindings.
 */
export interface KeybindingContext {
  mode: string;
  hasSelection: boolean;
  [key: string]: unknown;
}

/**
 * Options for withKeybindings.
 */
export interface WithKeybindingsOptions {
  /** Keybindings to resolve */
  bindings: KeybindingDef[];
  /** Build context for keybinding resolution */
  getKeyContext: () => KeybindingContext;
}

/**
 * Extended keybinding with mode support.
 */
export interface ExtendedKeybindingDef extends KeybindingDef {
  modes?: string[];
  when?: (ctx: KeybindingContext) => boolean;
}

// =============================================================================
// Implementation
// =============================================================================

// parseKey replaced by parseHotkey from ./keys.js

/**
 * Resolve a key press to a command ID using keybinding lookup.
 */
function resolveKeybinding(
  key: string,
  modifiers: { ctrl: boolean; meta: boolean; shift: boolean; super: boolean },
  bindings: ExtendedKeybindingDef[],
  ctx: KeybindingContext,
): string | null {
  for (const binding of bindings) {
    // Check key match
    if (binding.key !== key) continue;

    // Check modifiers
    if (!!binding.ctrl !== !!modifiers.ctrl) continue;
    if (!!binding.opt !== !!modifiers.meta) continue;
    if (!!binding.cmd !== !!modifiers.super) continue;

    // For single uppercase letters (A-Z), the shift key is implicit
    const isUppercaseLetter = key.length === 1 && key >= "A" && key <= "Z" && !binding.shift;
    if (!isUppercaseLetter && !!binding.shift !== !!modifiers.shift) continue;

    // alt removed — macOS uses opt (⌥), matched against modifiers.meta above

    // Check mode
    if (binding.modes && binding.modes.length > 0) {
      if (!binding.modes.includes(ctx.mode)) continue;
    }

    // Check conditional
    if (binding.when && !binding.when(ctx)) continue;

    return binding.commandId;
  }
  return null;
}

/**
 * Wire keybindings to command invocation.
 *
 * Intercepts `press()` and routes matching keys to commands.
 * Non-matching keys pass through to the original press handler.
 *
 * @example
 * ```tsx
 * const app = withKeybindings(appWithCmd, {
 *   bindings: defaultKeybindings,
 *   getKeyContext: () => buildKeybindingContext(state),
 * })
 *
 * await app.press('j')  // Triggers cmd.down() if bound
 * ```
 */
export function withKeybindings<T extends AppWithCommands>(
  app: T,
  options: WithKeybindingsOptions,
): T {
  const { bindings, getKeyContext } = options;
  const originalPress = app.press.bind(app);

  // Create a proxy to intercept press() while preserving all other properties
  return new Proxy(app, {
    get(target, prop, receiver) {
      if (prop === "press") {
        return async function interceptedPress(keyStr: string): Promise<T> {
          const { key, ...modifiers } = parseHotkey(keyStr);
          const ctx = getKeyContext();

          // Try to resolve to a command
          const commandId = resolveKeybinding(
            key,
            modifiers,
            bindings as ExtendedKeybindingDef[],
            ctx,
          );

          if (commandId) {
            const cmd = target.cmd[commandId];
            if (cmd) {
              await cmd();
              return receiver as T;
            }
          }

          // Pass through to original press handler (for useInput)
          await originalPress(keyStr);
          return receiver as T;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
