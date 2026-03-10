/**
 * Silvery Static Component
 *
 * Renders items that are written to the terminal once and never updated.
 * Useful for logs, progress outputs, or any content that should remain
 * visible after being rendered.
 *
 * Write-once semantics: when the items array grows, only newly added items
 * (at the end) are rendered via the children callback. Previously rendered
 * items are preserved as frozen React elements. This matches Ink's Static
 * behavior where each item is rendered exactly once.
 */

import { useRef, type JSX, type ReactNode } from "react";

export interface StaticProps<T> {
  /** Items to render */
  items: T[];
  /** Render function for each item */
  children: (item: T, index: number) => ReactNode;
  /** Style to apply to the container */
  style?: Record<string, unknown>;
}

/**
 * Renders a list of items that are written once and never updated.
 *
 * Static content is rendered above the main UI and remains visible
 * even as the main UI updates. Each item is rendered only once.
 *
 * @example
 * ```tsx
 * const [logs, setLogs] = useState<string[]>([]);
 *
 * // Logs appear above the main UI and stay visible
 * <Static items={logs}>
 *   {(log, index) => <Text key={index}>{log}</Text>}
 * </Static>
 *
 * // Main UI continues below
 * <Box>
 *   <Text>Current status: processing...</Text>
 * </Box>
 * ```
 */
export function Static<T>({ items, children, style }: StaticProps<T>): JSX.Element {
  // Track previously rendered items to implement write-once semantics.
  // Once an item has been rendered, its React element is frozen and reused
  // on subsequent renders — the children callback is NOT called again for it.
  const renderedRef = useRef<ReactNode[]>([]);

  // Render only new items (items beyond what we've already rendered)
  const prevCount = renderedRef.current.length;
  if (items.length > prevCount) {
    for (let i = prevCount; i < items.length; i++) {
      renderedRef.current.push(children(items[i]!, i));
    }
  } else if (items.length < prevCount) {
    // Items were removed — truncate the rendered cache
    renderedRef.current.length = items.length;
  }

  return (
    <silvery-box flexDirection="column" {...style}>
      {renderedRef.current}
    </silvery-box>
  );
}
