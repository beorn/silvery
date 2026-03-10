/**
 * CSI 6n Cursor Position Query
 *
 * Queries the terminal for the current cursor position using the standard
 * Device Status Report (DSR) mechanism.
 *
 * Protocol:
 * - Query:    CSI 6 n  (\x1b[6n)
 * - Response: CSI {row} ; {col} R  (\x1b[{row};{col}R)
 *
 * Row and column are 1-indexed in the protocol response.
 *
 * Supported by: virtually all terminals (VT100+)
 */

/** Regex to match a CPR response: CSI row ; col R */
const CPR_RESPONSE_RE = /\x1b\[(\d+);(\d+)R/;

/**
 * Query the terminal cursor position.
 *
 * Sends CSI 6n and parses the CPR response.
 * Returns 1-indexed row and column.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin (resolves with data or null on timeout)
 * @param timeoutMs How long to wait for response (default: 200ms)
 */
export async function queryCursorPosition(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<{ row: number; col: number } | null> {
  write("\x1b[6n");

  const data = await read(timeoutMs);
  if (data == null) return null;

  const match = CPR_RESPONSE_RE.exec(data);
  if (!match) return null;

  return {
    row: parseInt(match[1]!, 10),
    col: parseInt(match[2]!, 10),
  };
}

/**
 * Query cursor position using real stdin/stdout.
 * Convenience wrapper around queryCursorPosition.
 */
export async function queryCursorFromStdio(
  stdout: { write: (s: string) => boolean | void },
  stdin: NodeJS.ReadStream,
  timeoutMs = 200,
): Promise<{ row: number; col: number } | null> {
  const wasRaw = stdin.isRaw;
  if (!wasRaw) stdin.setRawMode(true);

  try {
    const write = (s: string) => {
      stdout.write(s);
    };

    const read = (ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          stdin.removeListener("data", onData);
          resolve(null);
        }, ms);

        function onData(chunk: Buffer) {
          clearTimeout(timer);
          stdin.removeListener("data", onData);
          resolve(chunk.toString());
        }

        stdin.on("data", onData);
      });

    return await queryCursorPosition(write, read, timeoutMs);
  } finally {
    if (!wasRaw) stdin.setRawMode(false);
  }
}
