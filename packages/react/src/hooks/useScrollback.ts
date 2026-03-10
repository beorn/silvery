/**
 * useScrollback - Push frozen items to terminal scrollback.
 *
 * Tracks a contiguous frozen prefix of items. When the frozen count
 * increases, renders newly frozen items and writes them to stdout.
 * Pair with VirtualList's `virtualized` prop for the complete experience.
 *
 * In inline mode, notifies the scheduler about lines written to stdout
 * so that cursor positioning accounts for the displacement.
 *
 * On terminal resize (width change), clears the entire terminal (scrollback
 * + screen via ED3 + ED2) and re-emits ALL frozen items at the new width.
 * This is the only correct approach — terminal scrollback is opaque and
 * cannot be selectively modified. Any attempt to track which items are
 * "visible" vs "in scrollback" drifts after terminal reflow, causing
 * cumulative duplication on each resize.
 *
 * Supports optional OSC 133 semantic markers for terminal prompt navigation
 * (Cmd+Up/Cmd+Down in iTerm2, Kitty, WezTerm, Ghostty).
 *
 * NOTE: DECSTBM scroll regions CANNOT be used here. Lines that scroll out
 * of a DECSTBM region are discarded — they never enter terminal scrollback.
 * All scrollback management must be done via explicit stdout.write() calls.
 */

import { useContext, useLayoutEffect, useRef } from "react";
import { StdoutContext } from "../context";
import { OSC133 } from "@silvery/term/osc-markers";

/** Custom marker callbacks for per-item control. */
export interface ScrollbackMarkerCallbacks<T> {
  /** Called before each frozen item's output. Return marker string or empty. */
  before?: (item: T, index: number) => string;
  /** Called after each frozen item's output. Return marker string or empty. */
  after?: (item: T, index: number) => string;
}

export interface UseScrollbackOptions<T> {
  /** Predicate: return true for items that should be frozen */
  frozen: (item: T, index: number) => boolean;
  /** Render an item to a string for stdout output */
  render: (item: T, index: number) => string;
  /** Output stream (defaults to process.stdout) */
  stdout?: { write(data: string): boolean };
  /**
   * Emit OSC 133 semantic markers around each frozen item for terminal navigation.
   *
   * - `true`: emit `OSC133.promptStart` before and `OSC133.commandEnd(0)` after each item
   * - Object with `before`/`after` callbacks: call for custom marker strings per item
   */
  markers?: boolean | ScrollbackMarkerCallbacks<T>;
  /** Terminal width in columns. When this changes, frozen items are re-rendered and
   *  re-emitted if the content changed at the new width. */
  width?: number;
}

/**
 * Count the number of newlines in a string.
 */
function countNewlines(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) count++;
  }
  return count;
}

/**
 * Resolve the before/after marker strings for a given item.
 */
function resolveMarkers<T>(
  markers: boolean | ScrollbackMarkerCallbacks<T> | undefined,
  item: T,
  index: number,
): { before: string; after: string } {
  if (!markers) return { before: "", after: "" };
  if (markers === true) {
    return { before: OSC133.promptStart, after: OSC133.commandEnd(0) };
  }
  return {
    before: markers.before?.(item, index) ?? "",
    after: markers.after?.(item, index) ?? "",
  };
}

/**
 * Track frozen items and write newly frozen ones to stdout.
 *
 * @returns The current frozen count (contiguous prefix length).
 */
export function useScrollback<T>(items: T[], options: UseScrollbackOptions<T>): number {
  const { frozen, render, stdout = process.stdout, markers, width } = options;
  const stdoutCtx = useContext(StdoutContext);

  // Compute contiguous frozen prefix
  let frozenCount = 0;
  for (let i = 0; i < items.length; i++) {
    if (!frozen(items[i]!, i)) break;
    frozenCount++;
  }

  const prevFrozenCountRef = useRef(0);

  // Stored rendered strings for content-change detection on resize
  const renderedStringsRef = useRef<Map<number, string>>(new Map());
  const prevWidthRef = useRef(width);

  // Track cumulative frozen line count for visible-range calculation on resize.
  // This is the total number of terminal lines occupied by all frozen items.
  // Used to determine which items have scrolled into terminal scrollback (and
  // therefore can't be re-emitted — the terminal owns them).
  const totalFrozenLinesRef = useRef(0);

  // Refs for current values — avoid stale closures in useLayoutEffect
  const renderRef = useRef(render);
  renderRef.current = render;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const frozenCountRef = useRef(frozenCount);
  frozenCountRef.current = frozenCount;

  // Normal freeze path: write newly frozen items to scrollback.
  //
  // In inline mode with promoteScrollback (run() runtime), delegates frozen
  // content to the output phase. The output phase writes frozen content + live
  // content in a single target.write() — no screen clearing, no cursor desync,
  // no flicker.
  //
  // Without promoteScrollback (test renderer, static rendering, or older runtimes),
  // falls back to direct stdout writes with notifyScrollback.
  useLayoutEffect(() => {
    const prev = prevFrozenCountRef.current;
    if (frozenCount > prev) {
      if (stdoutCtx?.promoteScrollback) {
        // Inline mode: build frozen content string and delegate to output phase.
        // No direct stdout writes — the output phase handles everything.
        let frozenContent = "";
        let linesWritten = 0;
        for (let i = prev; i < frozenCount; i++) {
          const { before, after } = resolveMarkers(markers, items[i]!, i);
          if (before) frozenContent += before;
          const text = render(items[i]!, i) + "\n";
          frozenContent += text.replace(/\n/g, "\x1b[K\r\n");
          linesWritten += countNewlines(text);
          renderedStringsRef.current.set(i, text);
          if (after) frozenContent += after;
        }
        totalFrozenLinesRef.current += linesWritten;
        stdoutCtx.promoteScrollback(frozenContent, linesWritten);
      } else {
        // Non-inline / legacy: write only newly frozen items directly
        let linesWritten = 0;
        for (let i = prev; i < frozenCount; i++) {
          const { before, after } = resolveMarkers(markers, items[i]!, i);
          if (before) stdout.write(before);
          const text = render(items[i]!, i) + "\n";
          stdout.write(text.replace(/\n/g, "\r\n"));
          linesWritten += countNewlines(text);
          renderedStringsRef.current.set(i, text);
          if (after) stdout.write(after);
        }
        totalFrozenLinesRef.current += linesWritten;
        stdoutCtx?.notifyScrollback?.(linesWritten);
      }
    }
    prevFrozenCountRef.current = frozenCount;
  }, [frozenCount, items, render, stdout, stdoutCtx, markers]);

  // Resize path: clear scrollback + screen, re-emit ALL frozen items.
  //
  // Terminal scrollback is opaque — the application cannot query, modify, or
  // selectively clear it. Previous attempts to track which items are "visible"
  // vs "in scrollback" via totalFrozenLinesRef drifted after terminal reflow,
  // causing cumulative duplication on each resize.
  //
  // The correct approach is simple: on width change, clear EVERYTHING (scrollback
  // + screen via ED3 + ED2), then re-emit all frozen items from scratch at the
  // new width. This eliminates drift entirely — no guessing what the terminal did.
  //
  // Trade-off: brief visual flash on resize (acceptable for a resize event).
  // ED3 (\x1b[3J) is supported by: Ghostty, iTerm2, xterm, Alacritty, WezTerm,
  // kitty, VTE terminals, Windows Terminal.
  useLayoutEffect(() => {
    if (width === undefined) return;

    const prevWidth = prevWidthRef.current;
    prevWidthRef.current = width;

    if (prevWidth === undefined || width === prevWidth) return;
    const currentFrozenCount = frozenCountRef.current;
    if (currentFrozenCount === 0) return;

    const currentItems = itemsRef.current;
    const currentRender = renderRef.current;
    const currentMarkers = markersRef.current;

    // 1. Reset output phase cursor tracking
    stdoutCtx?.resetInlineCursor?.();

    // 2. Clear scrollback buffer + visible screen
    //    \x1b[3J = ED3 (Erase Saved Lines — clears scrollback)
    //    \x1b[H  = CUP (move cursor to 1,1)
    //    \x1b[2J = ED2 (Erase entire screen)
    stdout.write("\x1b[3J\x1b[H\x1b[2J");

    // 3. Re-emit ALL frozen items at new width
    let linesWritten = 0;
    for (let i = 0; i < currentFrozenCount; i++) {
      const { before, after } = resolveMarkers(currentMarkers, currentItems[i]!, i);

      if (before) stdout.write(before);

      const text = currentRender(currentItems[i]!, i) + "\n";
      stdout.write(text.replace(/\n/g, "\r\n"));
      linesWritten += countNewlines(text);
      renderedStringsRef.current.set(i, text);

      if (after) stdout.write(after);
    }

    // 4. Reset totalFrozenLines to accurate count (no drift possible)
    totalFrozenLinesRef.current = linesWritten;

    // 5. Do NOT call notifyScrollback here. The re-emitted frozen items are
    // the new scrollback baseline, not a displacement offset. resetInlineCursor()
    // already set forceFirstRender=true, which makes the output phase treat the
    // next render as the first frame — cursor starts fresh after the frozen items.

    // 6. Sync prevFrozenCountRef to prevent double-writes
    prevFrozenCountRef.current = currentFrozenCount;
  }, [width, stdout, stdoutCtx]);

  return frozenCount;
}
