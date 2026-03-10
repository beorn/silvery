/**
 * Kitty keyboard protocol tests.
 *
 * Tests parseKeypress() for kitty CSI u sequences, kitty-enhanced special keys,
 * modifier handling, event types, printability, text fields, and edge cases.
 *
 * Ported from Ink's kitty-keyboard.tsx test suite.
 */
import { describe, expect, test } from "vitest";
import { parseKeypress } from "../../packages/tea/src/keys";

// Helper to create kitty protocol CSI u sequences
function kittyKey(
  codepoint: number,
  modifiers?: number,
  eventType?: number,
  textCodepoints?: number[],
): string {
  let seq = `\x1b[${codepoint}`;
  if (modifiers !== undefined || eventType !== undefined || textCodepoints !== undefined) {
    seq += `;${modifiers ?? 1}`;
  }

  if (eventType !== undefined || textCodepoints !== undefined) {
    seq += `:${eventType ?? 1}`;
  }

  if (textCodepoints !== undefined) {
    seq += `;${textCodepoints.join(":")}`;
  }

  seq += "u";
  return seq;
}

// ============================================================================
// Basic character parsing
// ============================================================================

describe("kitty protocol - basic characters", () => {
  test("simple character", () => {
    const result = parseKeypress(kittyKey(97));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(false);
    expect(result.shift).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("uppercase character (shift)", () => {
    // 'A' with shift (modifier 2 = shift + 1)
    const result = parseKeypress(kittyKey(65, 2));
    expect(result.name).toBe("a");
    expect(result.shift).toBe(true);
    expect(result.ctrl).toBe(false);
  });

  test("number keys", () => {
    // '1' key
    const result = parseKeypress(kittyKey(49));
    expect(result.name).toBe("1");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("special character", () => {
    // '@' key
    const result = parseKeypress(kittyKey(64));
    expect(result.name).toBe("@");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("supplementary unicode codepoint", () => {
    // Emoji: 😀 (U+1F600 = 128512)
    const result = parseKeypress(kittyKey(128_512));
    expect(result.name).toBe("😀");
    expect(result.isKittyProtocol).toBe(true);
  });
});

// ============================================================================
// Modifier handling
// ============================================================================

describe("kitty protocol - modifiers", () => {
  test("ctrl modifier", () => {
    // 'a' with ctrl (modifier 5 = ctrl(4) + 1)
    const result = parseKeypress(kittyKey(97, 5));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(false);
  });

  test("alt/option modifier", () => {
    // 'a' with alt (modifier 3 = alt(2) + 1)
    const result = parseKeypress(kittyKey(97, 3));
    expect(result.name).toBe("a");
    expect(result.option).toBe(true);
    expect(result.ctrl).toBe(false);
  });

  test("super modifier", () => {
    // 'a' with super (modifier 9 = super(8) + 1)
    const result = parseKeypress(kittyKey(97, 9));
    expect(result.name).toBe("a");
    expect(result.super).toBe(true);
    expect(result.ctrl).toBe(false);
  });

  test("hyper modifier", () => {
    // 'a' with hyper (modifier 17 = hyper(16) + 1)
    const result = parseKeypress(kittyKey(97, 17));
    expect(result.name).toBe("a");
    expect(result.hyper).toBe(true);
    expect(result.super).toBe(false);
  });

  test("meta modifier", () => {
    // 'a' with meta (modifier 33 = meta(32) + 1)
    const result = parseKeypress(kittyKey(97, 33));
    expect(result.name).toBe("a");
    expect(result.meta).toBe(true);
  });

  test("caps lock", () => {
    // 'a' with capsLock (modifier 65 = capsLock(64) + 1)
    const result = parseKeypress(kittyKey(97, 65));
    expect(result.name).toBe("a");
    expect(result.capsLock).toBe(true);
  });

  test("num lock", () => {
    // 'a' with numLock (modifier 129 = numLock(128) + 1)
    const result = parseKeypress(kittyKey(97, 129));
    expect(result.name).toBe("a");
    expect(result.numLock).toBe(true);
  });

  test("combined modifiers (ctrl+shift)", () => {
    // 'a' with ctrl+shift (modifier 6 = ctrl(4) + shift(1) + 1)
    const result = parseKeypress(kittyKey(97, 6));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(true);
    expect(result.meta).toBe(false);
  });

  test("combined modifiers (super+ctrl)", () => {
    // 's' with super+ctrl (modifier 13 = super(8) + ctrl(4) + 1)
    const result = parseKeypress(kittyKey(115, 13));
    expect(result.name).toBe("s");
    expect(result.super).toBe(true);
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(false);
  });

  test("malformed modifier 0 does not set all flags", () => {
    // Malformed sequence with modifier 0 (should clamp to 0, not become -1)
    const result = parseKeypress("\x1b[97;0u");
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(false);
    expect(result.shift).toBe(false);
    expect(result.option).toBe(false);
    expect(result.super).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });
});

// ============================================================================
// Special keys
// ============================================================================

describe("kitty protocol - special keys", () => {
  test("escape key", () => {
    const result = parseKeypress(kittyKey(27));
    expect(result.name).toBe("escape");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("return/enter key", () => {
    const result = parseKeypress(kittyKey(13));
    expect(result.name).toBe("return");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("tab key", () => {
    const result = parseKeypress(kittyKey(9));
    expect(result.name).toBe("tab");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("backspace key", () => {
    const result = parseKeypress(kittyKey(8));
    expect(result.name).toBe("backspace");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("delete key", () => {
    const result = parseKeypress(kittyKey(127));
    expect(result.name).toBe("delete");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("space key", () => {
    const result = parseKeypress(kittyKey(32));
    expect(result.name).toBe("space");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("ctrl+letter produces codepoint 1-26", () => {
    // When using ctrl+a, kitty sends codepoint 1 (not 97)
    // Ctrl+a (codepoint 1, modifier 5 = ctrl + 1)
    const result = parseKeypress(kittyKey(1, 5));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(true);
  });
});

// ============================================================================
// Event types
// ============================================================================

describe("kitty protocol - event types", () => {
  test("press event", () => {
    const result = parseKeypress(kittyKey(97, 1, 1));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe(1);
  });

  test("repeat event", () => {
    const result = parseKeypress(kittyKey(97, 1, 2));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe(2);
  });

  test("release event", () => {
    const result = parseKeypress(kittyKey(97, 1, 3));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe(3);
  });
});

// ============================================================================
// Text field
// ============================================================================

describe("kitty protocol - text field", () => {
  test("text-as-codepoints field", () => {
    // 'a' key with text-as-codepoints containing 'A' (shifted)
    const result = parseKeypress(kittyKey(97, 2, 1, [65]));
    expect(result.name).toBe("a");
    expect(result.text).toBe("A");
    expect(result.shift).toBe(true);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("text-as-codepoints with multiple codepoints", () => {
    // Key with text containing multiple codepoints (e.g., composed character)
    const result = parseKeypress(kittyKey(97, 1, 1, [72, 101]));
    expect(result.text).toBe("He");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("text-as-codepoints with supplementary unicode", () => {
    // Text field with emoji codepoint
    const result = parseKeypress(kittyKey(97, 1, 1, [128_512]));
    expect(result.text).toBe("😀");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("text defaults to character from codepoint", () => {
    const result = parseKeypress(kittyKey(97));
    expect(result.text).toBe("a");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("space key has text field set to space character", () => {
    const result = parseKeypress(kittyKey(32));
    expect(result.text).toBe(" ");
  });

  test("return key has text field set to carriage return", () => {
    const result = parseKeypress(kittyKey(13));
    expect(result.text).toBe("\r");
  });
});

// ============================================================================
// Sequence/raw preservation
// ============================================================================

describe("kitty protocol - sequence and raw", () => {
  test("preserves sequence and raw", () => {
    const seq = kittyKey(97, 5);
    const result = parseKeypress(seq);
    expect(result.sequence).toBe(seq);
    expect(result.raw).toBe(seq);
  });
});

// ============================================================================
// Kitty-enhanced special keys
// ============================================================================

describe("kitty protocol - enhanced special keys", () => {
  test("arrow keys with event type", () => {
    // Up arrow press: CSI 1;1:1 A
    const up = parseKeypress("\x1b[1;1:1A");
    expect(up.name).toBe("up");
    expect(up.eventType).toBe(1);
    expect(up.isKittyProtocol).toBe(true);

    // Down arrow release: CSI 1;1:3 B
    const down = parseKeypress("\x1b[1;1:3B");
    expect(down.name).toBe("down");
    expect(down.eventType).toBe(3);
    expect(down.isKittyProtocol).toBe(true);

    // Right arrow repeat: CSI 1;1:2 C
    const right = parseKeypress("\x1b[1;1:2C");
    expect(right.name).toBe("right");
    expect(right.eventType).toBe(2);
    expect(right.isKittyProtocol).toBe(true);

    // Left arrow: CSI 1;1:1 D
    const left = parseKeypress("\x1b[1;1:1D");
    expect(left.name).toBe("left");
    expect(left.eventType).toBe(1);
    expect(left.isKittyProtocol).toBe(true);
  });

  test("arrow keys with modifiers", () => {
    // Ctrl+up: CSI 1;5:1 A (modifiers=5 means ctrl(4)+1)
    const result = parseKeypress("\x1b[1;5:1A");
    expect(result.name).toBe("up");
    expect(result.ctrl).toBe(true);
    expect(result.eventType).toBe(1);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("home and end keys", () => {
    const home = parseKeypress("\x1b[1;1:1H");
    expect(home.name).toBe("home");
    expect(home.eventType).toBe(1);
    expect(home.isKittyProtocol).toBe(true);

    const end = parseKeypress("\x1b[1;1:1F");
    expect(end.name).toBe("end");
    expect(end.eventType).toBe(1);
    expect(end.isKittyProtocol).toBe(true);
  });

  test("tilde-terminated special keys", () => {
    // Delete: CSI 3;1:1 ~
    const del = parseKeypress("\x1b[3;1:1~");
    expect(del.name).toBe("delete");
    expect(del.eventType).toBe(1);
    expect(del.isKittyProtocol).toBe(true);

    // Insert: CSI 2;1:1 ~
    const ins = parseKeypress("\x1b[2;1:1~");
    expect(ins.name).toBe("insert");
    expect(ins.isKittyProtocol).toBe(true);

    // Page up: CSI 5;1:1 ~
    const pgup = parseKeypress("\x1b[5;1:1~");
    expect(pgup.name).toBe("pageup");
    expect(pgup.isKittyProtocol).toBe(true);

    // F5: CSI 15;1:1 ~
    const f5 = parseKeypress("\x1b[15;1:1~");
    expect(f5.name).toBe("f5");
    expect(f5.isKittyProtocol).toBe(true);
  });

  test("tilde keys with modifiers", () => {
    // Shift+Delete: CSI 3;2:1 ~ (modifiers=2 means shift(1)+1)
    const result = parseKeypress("\x1b[3;2:1~");
    expect(result.name).toBe("delete");
    expect(result.shift).toBe(true);
    expect(result.eventType).toBe(1);
    expect(result.isKittyProtocol).toBe(true);
  });
});

// ============================================================================
// isPrintable
// ============================================================================

describe("kitty protocol - isPrintable", () => {
  test("true for regular characters", () => {
    expect(parseKeypress(kittyKey(97)).isPrintable).toBe(true); // 'a'
  });

  test("true for digits", () => {
    expect(parseKeypress(kittyKey(49)).isPrintable).toBe(true); // '1'
  });

  test("true for symbols", () => {
    expect(parseKeypress(kittyKey(64)).isPrintable).toBe(true); // '@'
  });

  test("true for emoji", () => {
    expect(parseKeypress(kittyKey(128_512)).isPrintable).toBe(true); // 😀
  });

  test("false for escape", () => {
    expect(parseKeypress(kittyKey(27)).isPrintable).toBe(false);
  });

  test("true for return", () => {
    expect(parseKeypress(kittyKey(13)).isPrintable).toBe(true);
  });

  test("false for tab", () => {
    expect(parseKeypress(kittyKey(9)).isPrintable).toBe(false);
  });

  test("true for space", () => {
    expect(parseKeypress(kittyKey(32)).isPrintable).toBe(true);
  });

  test("false for backspace", () => {
    expect(parseKeypress(kittyKey(8)).isPrintable).toBe(false);
  });

  test("false for ctrl+letter", () => {
    // Ctrl+a (codepoint 1)
    expect(parseKeypress(kittyKey(1, 5)).isPrintable).toBe(false);
  });

  test("false for special keys (arrows)", () => {
    // Up arrow via kitty enhanced special key format
    expect(parseKeypress("\x1b[1;1:1A").isPrintable).toBe(false);
  });
});

// ============================================================================
// Non-printable functional keys (expanded codepoint map)
// ============================================================================

describe("kitty protocol - non-printable functional keys", () => {
  test("capslock (57358) is non-printable", () => {
    const result = parseKeypress("\x1b[57358u");
    expect(result.name).toBe("capslock");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("printscreen (57361) is non-printable", () => {
    const result = parseKeypress("\x1b[57361u");
    expect(result.name).toBe("printscreen");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("f13 (57376) is non-printable", () => {
    const result = parseKeypress("\x1b[57376u");
    expect(result.name).toBe("f13");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("media key (57428 mediaplay) is non-printable", () => {
    const result = parseKeypress("\x1b[57428u");
    expect(result.name).toBe("mediaplay");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("modifier-only key (57441 leftshift) is non-printable", () => {
    const result = parseKeypress("\x1b[57441u");
    expect(result.name).toBe("leftshift");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("modifier-only key (57442 leftcontrol) is non-printable", () => {
    const result = parseKeypress("\x1b[57442u");
    expect(result.name).toBe("leftcontrol");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("kp keys (57399 kp0) are non-printable", () => {
    const result = parseKeypress("\x1b[57399u");
    expect(result.name).toBe("kp0");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("scrolllock (57359) is non-printable", () => {
    const result = parseKeypress("\x1b[57359u");
    expect(result.name).toBe("scrolllock");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("numlock (57360) is non-printable", () => {
    const result = parseKeypress("\x1b[57360u");
    expect(result.name).toBe("numlock");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("pause (57362) is non-printable", () => {
    const result = parseKeypress("\x1b[57362u");
    expect(result.name).toBe("pause");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("volume keys are non-printable", () => {
    const lower = parseKeypress("\x1b[57438u");
    expect(lower.name).toBe("lowervolume");
    expect(lower.isPrintable).toBe(false);

    const raise = parseKeypress("\x1b[57439u");
    expect(raise.name).toBe("raisevolume");
    expect(raise.isPrintable).toBe(false);

    const mute = parseKeypress("\x1b[57440u");
    expect(mute.name).toBe("mutevolume");
    expect(mute.isPrintable).toBe(false);
  });
});

// ============================================================================
// Malformed input handling
// ============================================================================

describe("kitty protocol - malformed input", () => {
  test("invalid codepoint above U+10FFFF returns safe empty keypress", () => {
    // Codepoint 1114112 = 0x110000, one above max Unicode
    const result = parseKeypress("\x1b[1114112u");
    expect(result.name).toBe("");
    expect(result.ctrl).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
    expect(result.isPrintable).toBe(false);
  });

  test("surrogate codepoint returns safe empty keypress", () => {
    // Codepoint 0xD800 is a surrogate
    const result = parseKeypress("\x1b[55296u");
    expect(result.name).toBe("");
    expect(result.ctrl).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
    expect(result.isPrintable).toBe(false);
  });

  test("invalid text codepoint replaced with fallback", () => {
    // Valid primary codepoint, but text field has an invalid codepoint
    const result = parseKeypress(kittyKey(97, 1, 1, [1_114_112]));
    expect(result.name).toBe("a");
    expect(result.text).toBe("?");
    expect(result.isKittyProtocol).toBe(true);
  });
});

// ============================================================================
// Legacy fallback
// ============================================================================

describe("kitty protocol - legacy fallback", () => {
  test("non-kitty sequences fall back to legacy parsing", () => {
    // Regular escape sequence (not kitty protocol)
    const result = parseKeypress("\x1b[A");
    expect(result.name).toBe("up");
    expect(result.isKittyProtocol).toBeUndefined();
  });

  test("non-kitty sequences - ctrl+c", () => {
    const result = parseKeypress("\x03");
    expect(result.name).toBe("c");
    expect(result.ctrl).toBe(true);
    expect(result.isKittyProtocol).toBeUndefined();
  });
});

// ============================================================================
// Detection and enable/disable sequences
// ============================================================================

describe("kitty protocol - detection and control sequences", () => {
  test("enableKittyKeyboard produces correct CSI sequence", async () => {
    const { enableKittyKeyboard, KittyFlags } = await import("../../packages/term/src/output");
    expect(enableKittyKeyboard()).toBe("\x1b[>1u");
    expect(enableKittyKeyboard(KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS)).toBe(
      "\x1b[>3u",
    );
  });

  test("disableKittyKeyboard produces correct CSI sequence", async () => {
    const { disableKittyKeyboard } = await import("../../packages/term/src/output");
    expect(disableKittyKeyboard()).toBe("\x1b[<u");
  });

  test("queryKittyKeyboard produces correct CSI sequence", async () => {
    const { queryKittyKeyboard } = await import("../../packages/term/src/output");
    expect(queryKittyKeyboard()).toBe("\x1b[?u");
  });

  test("detectKittySupport parses response correctly", async () => {
    const { detectKittySupport } = await import("../../packages/term/src/kitty-detect");

    const write = () => {};
    const read = async () => "\x1b[?1u";
    const result = await detectKittySupport(write, read);
    expect(result.supported).toBe(true);
    expect(result.flags).toBe(1);
  });

  test("detectKittySupport handles timeout (no response)", async () => {
    const { detectKittySupport } = await import("../../packages/term/src/kitty-detect");

    const write = () => {};
    const read = async () => null;
    const result = await detectKittySupport(write, read);
    expect(result.supported).toBe(false);
    expect(result.flags).toBe(0);
  });

  test("detectKittySupport handles non-response data", async () => {
    const { detectKittySupport } = await import("../../packages/term/src/kitty-detect");

    const write = () => {};
    const read = async () => "somegarbage";
    const result = await detectKittySupport(write, read);
    expect(result.supported).toBe(false);
    expect(result.flags).toBe(0);
    expect(result.buffered).toBe("somegarbage");
  });

  test("detectKittySupport preserves buffered input around response", async () => {
    const { detectKittySupport } = await import("../../packages/term/src/kitty-detect");

    const write = () => {};
    const read = async () => "before\x1b[?3uafter";
    const result = await detectKittySupport(write, read);
    expect(result.supported).toBe(true);
    expect(result.flags).toBe(3);
    expect(result.buffered).toBe("beforeafter");
  });
});

// ============================================================================
// keyToKittyAnsi
// ============================================================================

describe("keyToKittyAnsi", () => {
  test("simple character", async () => {
    const { keyToKittyAnsi } = await import("../../packages/tea/src/keys");
    expect(keyToKittyAnsi("a")).toBe("\x1b[97u");
  });

  test("character with ctrl modifier", async () => {
    const { keyToKittyAnsi } = await import("../../packages/tea/src/keys");
    expect(keyToKittyAnsi("Control+c")).toBe("\x1b[99;5u");
  });

  test("enter key", async () => {
    const { keyToKittyAnsi } = await import("../../packages/tea/src/keys");
    expect(keyToKittyAnsi("Enter")).toBe("\x1b[13u");
  });

  test("shift+enter", async () => {
    const { keyToKittyAnsi } = await import("../../packages/tea/src/keys");
    expect(keyToKittyAnsi("Shift+Enter")).toBe("\x1b[13;2u");
  });

  test("arrow keys use enhanced special key format", async () => {
    const { keyToKittyAnsi } = await import("../../packages/tea/src/keys");
    expect(keyToKittyAnsi("ArrowUp")).toBe("\x1b[1;1A");
    expect(keyToKittyAnsi("ArrowDown")).toBe("\x1b[1;1B");
    expect(keyToKittyAnsi("ArrowRight")).toBe("\x1b[1;1C");
    expect(keyToKittyAnsi("ArrowLeft")).toBe("\x1b[1;1D");
  });

  test("super+key", async () => {
    const { keyToKittyAnsi } = await import("../../packages/tea/src/keys");
    expect(keyToKittyAnsi("Super+s")).toBe("\x1b[115;9u");
  });
});
