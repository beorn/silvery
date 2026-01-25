/**
 * Inkx Spacer Component
 *
 * A flexible space that expands to fill available space. Useful for pushing
 * elements to opposite ends of a container.
 */

import type { JSX } from "react";

/**
 * Fills available space in the parent container.
 *
 * @example
 * ```tsx
 * // Push "Right" to the end
 * <Box flexDirection="row">
 *   <Text>Left</Text>
 *   <Spacer />
 *   <Text>Right</Text>
 * </Box>
 *
 * // Center element with equal spacing
 * <Box flexDirection="row">
 *   <Spacer />
 *   <Text>Centered</Text>
 *   <Spacer />
 * </Box>
 * ```
 */
export function Spacer(): JSX.Element {
  return <inkx-box flexGrow={1} />;
}
