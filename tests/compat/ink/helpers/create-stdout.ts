import EventEmitter from "node:events"
import { vi } from "vitest"

// Fake process.stdout
export type FakeStdout = {
  get: () => string
  getWrites: () => string[]
} & NodeJS.WriteStream

const createStdout = (columns?: number, isTTY?: boolean): FakeStdout => {
  const stdout = new EventEmitter() as unknown as FakeStdout
  stdout.columns = columns ?? 100
  stdout.isTTY = isTTY ?? true

  const writes: string[] = []
  const calls: unknown[][] = []
  const writeFn = vi.fn((...args: unknown[]) => {
    writes.push(args[0] as string)
    calls.push(args)
    return true
  })
  // Add sinon-compatible properties (ink tests use stdout.write.lastCall.args[0])
  Object.defineProperties(writeFn, {
    lastCall: {
      get: () =>
        calls.length > 0
          ? { args: calls[calls.length - 1], firstArg: calls[calls.length - 1]![0] }
          : undefined,
    },
    firstCall: {
      get: () => (calls.length > 0 ? { args: calls[0], firstArg: calls[0]![0] } : undefined),
    },
    callCount: { get: () => calls.length },
    calledOnce: { get: () => calls.length === 1 },
    called: { get: () => calls.length > 0 },
    getCalls: { value: () => calls.map((args, i) => ({ args, firstArg: args[0], callId: i })) },
    getCall: { value: (i: number) => ({ args: calls[i], firstArg: calls[i]?.[0] }) },
    calledOnceWithExactly: {
      value: (...expected: unknown[]) =>
        calls.length === 1 && JSON.stringify(calls[0]) === JSON.stringify(expected),
    },
    resetHistory: {
      value: () => {
        calls.length = 0
      },
    },
  })
  stdout.write = writeFn as unknown as typeof stdout.write

  stdout.get = () => writes[writes.length - 1] ?? ""

  stdout.getWrites = () => writes

  return stdout
}

export default createStdout
