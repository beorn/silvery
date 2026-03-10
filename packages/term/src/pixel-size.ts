/**
 * CSI 14t/18t — Terminal Pixel and Text Area Size Queries
 *
 * Queries the terminal for window dimensions in pixels and characters.
 *
 * Protocols:
 *
 * Text Area Pixels (CSI 14t):
 *   Query:    CSI 14 t
 *   Response: CSI 4 ; height ; width t
 *
 * Text Area Size in Characters (CSI 18t):
 *   Query:    CSI 18 t
 *   Response: CSI 8 ; rows ; cols t
 *
 * Cell size can be derived by dividing pixel dimensions by character dimensions.
 *
 * Supported by: xterm, Ghostty, Kitty, WezTerm, foot, iTerm2
 */

/** Regex for CSI 4 ; height ; width t (pixel size response) */
const PIXEL_RESPONSE_RE = /\x1b\[4;(\d+);(\d+)t/;

/** Regex for CSI 8 ; rows ; cols t (text area size response) */
const TEXT_AREA_RESPONSE_RE = /\x1b\[8;(\d+);(\d+)t/;

// ============================================================================
// Pixel Size Query
// ============================================================================

/**
 * Query the terminal text area size in pixels.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param timeoutMs How long to wait for response (default: 200ms)
 * @returns Width and height in pixels, or null on timeout/unsupported
 */
export async function queryTextAreaPixels(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<{ width: number; height: number } | null> {
  write("\x1b[14t");

  const data = await read(timeoutMs);
  if (data == null) return null;

  const match = PIXEL_RESPONSE_RE.exec(data);
  if (!match) return null;

  return {
    height: parseInt(match[1]!, 10),
    width: parseInt(match[2]!, 10),
  };
}

// ============================================================================
// Text Area Size Query (characters)
// ============================================================================

/**
 * Query the terminal text area size in characters (rows x columns).
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param timeoutMs How long to wait for response (default: 200ms)
 * @returns Rows and columns, or null on timeout/unsupported
 */
export async function queryTextAreaSize(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<{ cols: number; rows: number } | null> {
  write("\x1b[18t");

  const data = await read(timeoutMs);
  if (data == null) return null;

  const match = TEXT_AREA_RESPONSE_RE.exec(data);
  if (!match) return null;

  return {
    rows: parseInt(match[1]!, 10),
    cols: parseInt(match[2]!, 10),
  };
}

// ============================================================================
// Cell Size (derived)
// ============================================================================

/**
 * Query the terminal cell size in pixels by querying both pixel
 * dimensions and character dimensions, then dividing.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param timeoutMs Per-query timeout (default: 200ms)
 * @returns Cell width and height in pixels, or null if either query fails
 */
export async function queryCellSize(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<{ width: number; height: number } | null> {
  const pixels = await queryTextAreaPixels(write, read, timeoutMs);
  if (pixels == null) return null;

  const size = await queryTextAreaSize(write, read, timeoutMs);
  if (size == null) return null;

  if (size.cols === 0 || size.rows === 0) return null;

  return {
    width: pixels.width / size.cols,
    height: pixels.height / size.rows,
  };
}
