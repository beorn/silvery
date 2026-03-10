/**
 * Divider Component
 *
 * A horizontal separator line with optional centered title.
 *
 * Usage:
 * ```tsx
 * <Divider />
 * <Divider title="Section" />
 * <Divider char="=" width={40} />
 * ```
 */
import React from "react";
import { useContentRect } from "@silvery/react/hooks/useLayout";
import { Box } from "@silvery/react/components/Box";
import { Text } from "@silvery/react/components/Text";

// =============================================================================
// Types
// =============================================================================

export interface DividerProps {
  /** Character to repeat (default: "─") */
  char?: string;
  /** Title text centered in divider */
  title?: string;
  /** Width (default: 100% via useContentRect) */
  width?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CHAR = "─";
const DEFAULT_WIDTH = 40;

// =============================================================================
// Component
// =============================================================================

export function Divider({
  char = DEFAULT_CHAR,
  title,
  width: widthProp,
}: DividerProps): React.ReactElement {
  const { width: contentWidth } = useContentRect();
  const totalWidth = widthProp ?? (contentWidth > 0 ? contentWidth : DEFAULT_WIDTH);

  if (!title) {
    return (
      <Box>
        <Text dimColor>{char.repeat(totalWidth)}</Text>
      </Box>
    );
  }

  // Title with surrounding lines: "───── Title ─────"
  const titleWithPad = ` ${title} `;
  const remaining = Math.max(0, totalWidth - titleWithPad.length);
  const leftLen = Math.floor(remaining / 2);
  const rightLen = remaining - leftLen;

  return (
    <Box>
      <Text dimColor>{char.repeat(leftLen)}</Text>
      <Text bold>{titleWithPad}</Text>
      <Text dimColor>{char.repeat(rightLen)}</Text>
    </Box>
  );
}
