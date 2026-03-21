import EventEmitter from "node:events"
import { vi } from "vitest"

export const createStdin = (): NodeJS.WriteStream => {
  const stdin = new EventEmitter() as unknown as NodeJS.WriteStream
  ;(stdin as any).isTTY = true
  ;(stdin as any).setRawMode = vi.fn()
  ;(stdin as any).setEncoding = () => {}

  const nextReads: (string | null)[] = []
  stdin.read = vi.fn(() => nextReads.shift() ?? null) as unknown as typeof stdin.read
  ;(stdin as any).unref = () => {}
  ;(stdin as any).ref = () => {}

  return stdin
}

export const emitReadable = (stdin: NodeJS.WriteStream, chunk: string): void => {
  const readFn = stdin.read as ReturnType<typeof vi.fn>
  // Queue up chunk + null for the readable event
  readFn.mockReturnValueOnce(chunk).mockReturnValueOnce(null)
  stdin.emit("readable")
}
