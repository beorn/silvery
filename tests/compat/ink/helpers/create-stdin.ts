import EventEmitter from "node:events";
import { vi } from "vitest";

export const createStdin = (): NodeJS.WriteStream => {
  const stdin = new EventEmitter() as unknown as NodeJS.WriteStream;
  stdin.isTTY = true;
  stdin.setRawMode = vi.fn();
  stdin.setEncoding = () => {};

  let nextReads: (string | null)[] = [];
  stdin.read = vi.fn(() => nextReads.shift() ?? null) as unknown as typeof stdin.read;
  stdin.unref = () => {};
  stdin.ref = () => {};

  return stdin;
};

export const emitReadable = (stdin: NodeJS.WriteStream, chunk: string): void => {
  const readFn = stdin.read as ReturnType<typeof vi.fn>;
  // Queue up chunk + null for the readable event
  readFn.mockReturnValueOnce(chunk).mockReturnValueOnce(null);
  stdin.emit("readable");
};
