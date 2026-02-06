import {
  type TerminalBuffer,
  bufferToStyledText,
  bufferToText,
} from "../buffer.js"
import type { InkxNode } from "../types.js"
import type { Buffer } from "./types.js"

export function createBuffer(
  termBuffer: TerminalBuffer,
  nodes: InkxNode,
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
  }
}
