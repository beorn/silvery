import { type TerminalBuffer, bufferToStyledText, bufferToText } from "../buffer";
import type { TeaNode } from "@silvery/tea/types";
import type { Buffer } from "./types";

export function createBuffer(termBuffer: TerminalBuffer, nodes: TeaNode): Buffer {
  let _text: string | undefined;
  let _ansi: string | undefined;
  return {
    get text() {
      return (_text ??= bufferToText(termBuffer));
    },
    get ansi() {
      return (_ansi ??= bufferToStyledText(termBuffer));
    },
    nodes,
    _buffer: termBuffer,
  };
}
