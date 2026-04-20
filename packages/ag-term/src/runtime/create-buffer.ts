import { type TerminalBuffer, bufferToStyledText, bufferToText } from "../buffer"
import type { AgNode } from "@silvery/ag/types"
import type { Buffer } from "./types"

export function createBuffer(
  termBuffer: TerminalBuffer,
  nodes: AgNode,
  overlay?: string,
): Buffer {
  let _text: string | undefined
  let _ansi: string | undefined
  return {
    get text() {
      return (_text ??= bufferToText(termBuffer))
    },
    get ansi() {
      return (_ansi ??= bufferToStyledText(termBuffer))
    },
    nodes,
    _buffer: termBuffer,
    overlay,
  }
}
