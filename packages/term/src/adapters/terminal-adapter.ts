/**
 * Terminal Render Adapter
 *
 * Implements the RenderAdapter interface for terminal output.
 * Uses character cells as units, ANSI codes for styling.
 */

import { type Color, TerminalBuffer } from "../buffer";
import { outputPhase } from "../pipeline/output-phase";
import type {
  BorderChars,
  RenderAdapter,
  RenderBuffer,
  RenderStyle,
  TextMeasureResult,
  TextMeasureStyle,
  TextMeasurer,
} from "../render-adapter";
import { type Measurer, displayWidth } from "../unicode";

// ============================================================================
// Border Characters
// ============================================================================

const BORDER_CHARS: Record<string, BorderChars> = {
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
  },
  round: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
  bold: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
  },
  singleDouble: {
    topLeft: "╓",
    topRight: "╖",
    bottomLeft: "╙",
    bottomRight: "╜",
    horizontal: "─",
    vertical: "║",
  },
  doubleSingle: {
    topLeft: "╒",
    topRight: "╕",
    bottomLeft: "╘",
    bottomRight: "╛",
    horizontal: "═",
    vertical: "│",
  },
  classic: {
    topLeft: "+",
    topRight: "+",
    bottomLeft: "+",
    bottomRight: "+",
    horizontal: "-",
    vertical: "|",
  },
};

// ============================================================================
// Terminal Measurer
// ============================================================================

/** Create a terminal text measurer, optionally using an explicit width measurer. */
export function createTerminalMeasurer(measurer?: Measurer): TextMeasurer {
  const dw = measurer ? measurer.displayWidth.bind(measurer) : displayWidth;
  return {
    measureText(text: string, _style?: TextMeasureStyle): TextMeasureResult {
      return { width: dw(text), height: 1 };
    },
    getLineHeight(_style?: TextMeasureStyle): number {
      return 1;
    },
  };
}

/** Default terminal measurer (uses module-level displayWidth / scoped measurer). */
export const terminalMeasurer: TextMeasurer = createTerminalMeasurer();

// ============================================================================
// Terminal Render Buffer
// ============================================================================

/**
 * Wraps TerminalBuffer to implement the RenderBuffer interface.
 */
export class TerminalRenderBuffer implements RenderBuffer {
  private buffer: TerminalBuffer;
  private dw: (text: string) => number;

  constructor(width: number, height: number, measurer?: Measurer) {
    this.buffer = new TerminalBuffer(width, height);
    this.dw = measurer ? measurer.displayWidth.bind(measurer) : displayWidth;
  }

  get width(): number {
    return this.buffer.width;
  }

  get height(): number {
    return this.buffer.height;
  }

  /**
   * Get the underlying TerminalBuffer for output phase.
   */
  getTerminalBuffer(): TerminalBuffer {
    return this.buffer;
  }

  fillRect(x: number, y: number, width: number, height: number, style: RenderStyle): void {
    const cellStyle = this.convertStyle(style);
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        if (this.buffer.inBounds(col, row)) {
          this.buffer.setCell(col, row, {
            char: " ",
            ...cellStyle,
          });
        }
      }
    }
  }

  drawText(x: number, y: number, text: string, style: RenderStyle): void {
    const cellStyle = this.convertStyle(style);
    let col = x;
    for (const char of text) {
      if (!this.buffer.inBounds(col, y)) break;
      const charWidth = this.dw(char);
      this.buffer.setCell(col, y, {
        char,
        ...cellStyle,
        wide: charWidth > 1,
      });
      // Mark continuation cells for wide characters
      for (let i = 1; i < charWidth; i++) {
        if (this.buffer.inBounds(col + i, y)) {
          this.buffer.setCell(col + i, y, {
            char: "",
            ...cellStyle,
            continuation: true,
          });
        }
      }
      col += charWidth;
    }
  }

  drawChar(x: number, y: number, char: string, style: RenderStyle): void {
    if (this.buffer.inBounds(x, y)) {
      this.buffer.setCell(x, y, {
        char,
        ...this.convertStyle(style),
      });
    }
  }

  inBounds(x: number, y: number): boolean {
    return this.buffer.inBounds(x, y);
  }

  private convertStyle(style: RenderStyle): {
    fg: Color;
    bg: Color;
    underlineColor: Color;
    attrs: {
      bold?: boolean;
      dim?: boolean;
      italic?: boolean;
      underline?: boolean;
      underlineStyle?: "single" | "double" | "curly" | "dotted" | "dashed" | false;
      strikethrough?: boolean;
      inverse?: boolean;
    };
  } {
    return {
      fg: this.parseColor(style.fg),
      bg: this.parseColor(style.bg),
      underlineColor: this.parseColor(style.attrs?.underlineColor),
      attrs: {
        bold: style.attrs?.bold,
        dim: style.attrs?.dim,
        italic: style.attrs?.italic,
        underline: style.attrs?.underline,
        underlineStyle: style.attrs?.underlineStyle,
        strikethrough: style.attrs?.strikethrough,
        inverse: style.attrs?.inverse,
      },
    };
  }

  /**
   * Parse a color string to the Color type used by TerminalBuffer.
   */
  private parseColor(color: string | undefined): Color {
    if (!color) return null;

    // Hex color
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      if (hex.length === 6) {
        return {
          r: Number.parseInt(hex.slice(0, 2), 16),
          g: Number.parseInt(hex.slice(2, 4), 16),
          b: Number.parseInt(hex.slice(4, 6), 16),
        };
      }
      if (hex.length === 3) {
        return {
          r: Number.parseInt(hex[0]! + hex[0]!, 16),
          g: Number.parseInt(hex[1]! + hex[1]!, 16),
          b: Number.parseInt(hex[2]! + hex[2]!, 16),
        };
      }
    }

    // RGB color
    const rgbMatch = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (rgbMatch) {
      return {
        r: Number.parseInt(rgbMatch[1]!, 10),
        g: Number.parseInt(rgbMatch[2]!, 10),
        b: Number.parseInt(rgbMatch[3]!, 10),
      };
    }

    // Named ANSI colors - map to 256-color indices
    const namedColors: Record<string, number> = {
      black: 0,
      red: 1,
      green: 2,
      yellow: 3,
      blue: 4,
      magenta: 5,
      cyan: 6,
      white: 7,
      gray: 8,
      grey: 8,
      brightblack: 8,
      brightred: 9,
      brightgreen: 10,
      brightyellow: 11,
      brightblue: 12,
      brightmagenta: 13,
      brightcyan: 14,
      brightwhite: 15,
    };

    const normalized = color.toLowerCase().replace(/[^a-z]/g, "");
    const index = namedColors[normalized];
    if (index !== undefined) {
      return index;
    }

    return null;
  }
}

// ============================================================================
// Terminal Adapter
// ============================================================================

export const terminalAdapter: RenderAdapter = {
  name: "terminal",
  measurer: terminalMeasurer,

  createBuffer(width: number, height: number): RenderBuffer {
    return new TerminalRenderBuffer(width, height);
  },

  flush(buffer: RenderBuffer, prevBuffer: RenderBuffer | null): string {
    const termBuffer = (buffer as TerminalRenderBuffer).getTerminalBuffer();
    const prevTermBuffer = prevBuffer
      ? (prevBuffer as TerminalRenderBuffer).getTerminalBuffer()
      : null;
    return outputPhase(prevTermBuffer, termBuffer);
  },

  getBorderChars(style: string): BorderChars {
    return BORDER_CHARS[style] ?? BORDER_CHARS.single!;
  },
};
