import EventEmitter from "node:events";
import { vi } from "vitest";

// Fake process.stdout
export type FakeStdout = {
  get: () => string;
  getWrites: () => string[];
} & NodeJS.WriteStream;

const createStdout = (columns?: number, isTTY?: boolean): FakeStdout => {
  const stdout = new EventEmitter() as unknown as FakeStdout;
  stdout.columns = columns ?? 100;
  stdout.isTTY = isTTY ?? true;

  const writes: string[] = [];
  const writeFn = vi.fn((...args: unknown[]) => {
    writes.push(args[0] as string);
    return true;
  });
  stdout.write = writeFn as unknown as typeof stdout.write;

  stdout.get = () => writes[writes.length - 1] ?? "";

  stdout.getWrites = () => writes;

  return stdout;
};

export default createStdout;
