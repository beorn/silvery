/**
 * CursorLine Component
 *
 * Renders a single line of text with a visible cursor at a split point.
 * Extracts the duplicated cursor-rendering pattern found across km-tui
 * (inline edit, input box, search bar, etc.) into a reusable primitive.
 *
 * Usage:
 * ```tsx
 * <CursorLine beforeCursor="hel" afterCursor="lo world" />
 * <CursorLine beforeCursor="full text" afterCursor="" />
 * <CursorLine beforeCursor="" afterCursor="start" cursorStyle="underline" />
 * ```
 */
import React from "react";
import { Text } from "@silvery/react/components/Text";

// =============================================================================
// Types
// =============================================================================

export interface CursorLineProps {
  /** Text before the cursor position */
  beforeCursor: string;
  /** Text after the cursor position (first char gets cursor highlight) */
  afterCursor: string;
  /** Text color */
  color?: string;
  /** Whether to show the cursor (default: true) */
  showCursor?: boolean;
  /** Cursor style: 'block' (inverse) or 'underline' (default: block) */
  cursorStyle?: "block" | "underline";
}

// =============================================================================
// Component
// =============================================================================

/**
 * Renders a single line with a visible cursor character.
 *
 * The cursor character is `afterCursor[0]` (or a space when afterCursor is
 * empty, indicating the cursor is at the end of the text). The character is
 * rendered with inverse video (block) or underline styling.
 */
export function CursorLine({
  beforeCursor,
  afterCursor,
  color,
  showCursor = true,
  cursorStyle = "block",
}: CursorLineProps): React.ReactElement {
  if (!showCursor)
    return (
      <Text color={color}>
        {beforeCursor}
        {afterCursor}
      </Text>
    );

  const cursorChar = afterCursor[0] ?? " ";
  const rest = afterCursor.slice(1);

  return (
    <Text color={color}>
      {beforeCursor}
      {cursorStyle === "block" ? (
        <Text inverse>{cursorChar}</Text>
      ) : (
        <Text underline>{cursorChar}</Text>
      )}
      {rest}
    </Text>
  );
}
