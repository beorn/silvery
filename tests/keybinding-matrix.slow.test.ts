/**
 * Cross-backend keybinding delivery matrix test.
 *
 * Problem: Unit tests verify keybinding resolution but not terminal delivery.
 * Cmd+Arrow was shipped broken because Ghostty consumes those keys before
 * they reach the app.
 *
 * This test extracts all keybindings from defaultKeybindingLayers() and verifies
 * each one is deliverable through the terminal stack. It runs the FULL roundtrip:
 *
 *   km-commands key → Playwright key → keyToAnsi/keyToKittyAnsi → ANSI bytes
 *     → parseKey (silvery) → [input, Key] → keyToString/keyToModifiers (km-commands)
 *       → resolveKeybinding match
 *
 * Findings are categorized as:
 *   - PASS: full roundtrip works
 *   - LEGACY_AMBIGUOUS: key is ambiguous in legacy ANSI (Ctrl+I=Tab, Shift+Enter=Enter)
 *   - TERMINAL_CONSUMED: roundtrips through ANSI but real terminals consume it (Cmd+Arrow)
 *   - KEY_ADAPTER_GAP: keyToString missing a key (PageUp/PageDown)
 *   - ENCODING_GAP: keyToAnsi cannot encode key ("+" as separator collision)
 */

import { describe, test, expect } from "vitest"
import { defaultKeybindingLayers, parseKeyString, keyToString, keyToModifiers, type ParsedKey } from "@km/commands"
import { parseKey, keyToAnsi, keyToKittyAnsi, splitRawInput } from "@silvery/tea/keys"

// =============================================================================
// Key format conversion: km-commands → Playwright-style
// =============================================================================

/**
 * Convert km-commands ParsedKey to Playwright-style key string.
 * Handles keys that are also Playwright separators ("+").
 */
function toPlaywright(parsed: ParsedKey): string {
  const parts: string[] = []
  if (parsed.ctrl) parts.push("Control")
  if (parsed.cmd) parts.push("Super")
  if (parsed.opt) parts.push("Alt")
  if (parsed.shift) parts.push("Shift")
  parts.push(parsed.key)
  return parts.join("+")
}

function requiresKitty(parsed: ParsedKey): boolean {
  return parsed.cmd
}

// =============================================================================
// Known limitations — categorized by root cause
// =============================================================================

/** Keys ambiguous in legacy ANSI (require Kitty protocol for correct delivery) */
const LEGACY_AMBIGUOUS: Record<string, string> = {
  // Ctrl+letter keys that alias to special keys (ASCII control codes)
  "ctrl-i": "Ctrl+I = 0x09 = Tab (same byte)",
  "ctrl-j": "Ctrl+J = 0x0A = Linefeed/Enter (same byte)",
  "ctrl-m": "Ctrl+M = 0x0D = Carriage Return/Enter (same byte)",
  // Shift+special keys: legacy ANSI cannot distinguish Shift+Enter from Enter
  "shift-Enter": "Legacy ANSI: Shift+Enter = \\r (same as Enter)",
  "shift-Backspace": "Legacy ANSI: Shift+Backspace = 0x7F (same as Backspace)",
  // Ctrl+Shift+letter: in legacy ANSI, ctrl reduces to ASCII 1-26 (loses shift)
  "ctrl-shift-z": "Legacy ANSI: Ctrl+Shift+Z = 0x1A (same as Ctrl+Z, shift lost)",
  "ctrl-shift-r": "Legacy ANSI: Ctrl+Shift+R = 0x12 (same as Ctrl+R, shift lost)",
}

/** Keys consumed by real terminal emulators before reaching the app */
const TERMINAL_CONSUMED: Record<string, string> = {
  "Super+ArrowUp": "Ghostty/iTerm consumes Cmd+Arrow — scrolls terminal",
  "Super+ArrowDown": "Ghostty/iTerm consumes Cmd+Arrow — scrolls terminal",
  "Super+ArrowLeft": "Ghostty/iTerm consumes Cmd+Arrow — maps to Home",
  "Super+ArrowRight": "Ghostty/iTerm consumes Cmd+Arrow — maps to End",
}

/** Keys where keyToString is missing a mapping (bug in key-adapter.ts) */
const KEY_ADAPTER_GAPS: Record<string, string> = {
  PageUp: "keyToString missing pageUp → 'PageUp' mapping",
  PageDown: "keyToString missing pageDown → 'PageDown' mapping",
}

/** Keys where keyToAnsi cannot encode them (encoding gaps) */
const ENCODING_GAPS: Record<string, string> = {
  "+": "keyToAnsi('+') returns '' — '+' is the Playwright modifier separator",
}

// =============================================================================
// Full-stack roundtrip verification
// =============================================================================

interface DeliveryResult {
  kmKey: string
  playwrightKey: string
  kittyRequired: boolean
  ansiSequence: string
  resolvedKey: string
  resolvedModifiers: { ctrl: boolean; opt: boolean; shift: boolean; cmd: boolean }
  keyMatches: boolean
  modifiersMatch: boolean
  error?: string
}

/**
 * Verify full roundtrip through the terminal stack.
 *
 * Accounts for:
 * - Uppercase letters: parseKey sets shift=true for "G", matchBinding ignores shift for A-Z
 * - Kitty shift+letter: Shift+r produces text "R", keyToString returns "R"
 * - Special keys: keyToString maps parseKey output to km-commands names
 */
function verifyRoundtrip(kmKey: string, parsed: ParsedKey): DeliveryResult {
  const playwrightKey = toPlaywright(parsed)
  const kittyRequired = requiresKitty(parsed)

  const result: DeliveryResult = {
    kmKey,
    playwrightKey,
    kittyRequired,
    ansiSequence: "",
    resolvedKey: "",
    resolvedModifiers: { ctrl: false, opt: false, shift: false, cmd: false },
    keyMatches: false,
    modifiersMatch: false,
  }

  try {
    const ansi = kittyRequired ? keyToKittyAnsi(playwrightKey) : keyToAnsi(playwrightKey)
    result.ansiSequence = ansi

    if (!ansi) {
      result.error = "Key produces no ANSI sequence"
      return result
    }

    const sequences = [...splitRawInput(ansi)]
    if (sequences.length === 0) {
      result.error = "splitRawInput produced no keypresses"
      return result
    }

    const [input, key] = parseKey(sequences[0]!)
    result.resolvedKey = keyToString(input, key)
    result.resolvedModifiers = keyToModifiers(key)

    const expectedKey = parsed.key
    const actualKey = result.resolvedKey
    const isUppercaseLetter = expectedKey.length === 1 && expectedKey >= "A" && expectedKey <= "Z" && !parsed.shift
    const isShiftedLetter =
      parsed.shift &&
      expectedKey.length === 1 &&
      expectedKey >= "a" &&
      expectedKey <= "z" &&
      actualKey === expectedKey.toUpperCase()

    result.keyMatches = actualKey === expectedKey || isShiftedLetter

    const ctrlOk = result.resolvedModifiers.ctrl === parsed.ctrl
    const optOk = result.resolvedModifiers.opt === parsed.opt
    const cmdOk = result.resolvedModifiers.cmd === parsed.cmd
    const shiftOk = isUppercaseLetter || isShiftedLetter || result.resolvedModifiers.shift === parsed.shift

    result.modifiersMatch = ctrlOk && optOk && cmdOk && shiftOk

    if (!result.keyMatches) {
      result.error = `Key mismatch: expected '${expectedKey}', got '${actualKey}'`
    } else if (!ctrlOk) {
      result.error = `Ctrl mismatch: expected ${parsed.ctrl}, got ${result.resolvedModifiers.ctrl}`
    } else if (!optOk) {
      result.error = `Opt mismatch: expected ${parsed.opt}, got ${result.resolvedModifiers.opt}`
    } else if (!cmdOk) {
      result.error = `Cmd mismatch: expected ${parsed.cmd}, got ${result.resolvedModifiers.cmd}`
    } else if (!shiftOk) {
      result.error = `Shift mismatch: expected ${parsed.shift}, got ${result.resolvedModifiers.shift}`
    }
  } catch (e) {
    result.error = `Exception: ${e instanceof Error ? e.message : String(e)}`
  }

  return result
}

// =============================================================================
// Keybinding extraction
// =============================================================================

interface ExtractedBinding {
  layer: string
  key: string
  commandId: string
  parsed: ParsedKey
}

function extractAllBindings(): ExtractedBinding[] {
  const layers = defaultKeybindingLayers()
  const bindings: ExtractedBinding[] = []
  const seenKeys = new Set<string>()

  for (const layer of layers) {
    for (const binding of layer.bindings) {
      if (binding.wildcard) continue
      if (seenKeys.has(binding.key)) continue
      seenKeys.add(binding.key)

      bindings.push({
        layer: layer.name,
        key: binding.key,
        commandId: binding.commandId,
        parsed: parseKeyString(binding.key),
      })
    }
  }
  return bindings
}

function categorizeBindings(bindings: ExtractedBinding[]) {
  const simple: ExtractedBinding[] = []
  const chords: ExtractedBinding[] = []
  for (const b of bindings) {
    if (b.parsed.chord) chords.push(b)
    else simple.push(b)
  }
  return { simple, chords }
}

/** Is this binding known to be limited? Returns the reason or undefined */
function knownLimitation(key: string, parsed: ParsedKey): string | undefined {
  // Check direct key string
  if (LEGACY_AMBIGUOUS[key] || KEY_ADAPTER_GAPS[parsed.key] || ENCODING_GAPS[parsed.key]) {
    return LEGACY_AMBIGUOUS[key] ?? KEY_ADAPTER_GAPS[parsed.key] ?? ENCODING_GAPS[parsed.key]
  }
  // Also check reconstructed km-commands-style key string (for chord prefixes)
  const parts: string[] = []
  if (parsed.ctrl) parts.push("ctrl")
  if (parsed.cmd) parts.push("cmd")
  if (parsed.opt) parts.push("opt")
  if (parsed.shift) parts.push("shift")
  parts.push(parsed.key)
  const kmStyle = parts.join("-")
  return LEGACY_AMBIGUOUS[kmStyle]
}

/**
 * Parse a chord prefix string like "Ctrl+v" into a ParsedKey.
 * Chord prefixes use "+" as separator (Playwright-style), unlike
 * km-commands key strings which use "-".
 */
function parseChordPrefix(prefix: string): ParsedKey {
  const parts = prefix.split("+")
  const key = parts.pop()!
  const result: ParsedKey = { key, ctrl: false, opt: false, shift: false, cmd: false }
  for (const part of parts) {
    switch (part) {
      case "Ctrl":
        result.ctrl = true
        break
      case "Alt":
        result.opt = true
        break
      case "Shift":
        result.shift = true
        break
      case "Cmd":
        result.cmd = true
        break
    }
  }
  return result
}

// =============================================================================
// Tests
// =============================================================================

describe("keybinding delivery matrix", () => {
  const allBindings = extractAllBindings()
  const { simple, chords } = categorizeBindings(allBindings)

  test("extracts a reasonable number of keybindings", () => {
    expect(allBindings.length).toBeGreaterThan(50)
    expect(simple.length).toBeGreaterThan(30)
    expect(chords.length).toBeGreaterThan(10)
  })

  // ═══════════════════════════════════════════════════════════════════
  // Simple keys (non-chord)
  // ═══════════════════════════════════════════════════════════════════

  describe("simple keys — full-stack roundtrip", () => {
    const testable = simple.filter((b) => !knownLimitation(b.key, b.parsed))
    const noMods = testable.filter((b) => !b.parsed.ctrl && !b.parsed.cmd && !b.parsed.opt && !b.parsed.shift)
    const ctrlKeys = testable.filter((b) => b.parsed.ctrl && !b.parsed.cmd)
    const cmdKeys = testable.filter((b) => b.parsed.cmd)
    const optKeys = testable.filter((b) => b.parsed.opt && !b.parsed.cmd)
    const shiftKeys = testable.filter((b) => b.parsed.shift && !b.parsed.ctrl && !b.parsed.cmd && !b.parsed.opt)

    describe("bare keys (no modifiers)", () => {
      test.each(noMods.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
        "%s → %s [%s]",
        (key, _commandId, _layer, parsed) => {
          const result = verifyRoundtrip(key, parsed)
          expect(result.error, `${key}: ${result.error}`).toBeUndefined()
        },
      )
    })

    if (ctrlKeys.length > 0) {
      describe("Ctrl+key", () => {
        test.each(ctrlKeys.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
          "%s → %s [%s]",
          (key, _commandId, _layer, parsed) => {
            const result = verifyRoundtrip(key, parsed)
            expect(result.error, `${key}: ${result.error}`).toBeUndefined()
          },
        )
      })
    }

    if (shiftKeys.length > 0) {
      describe("Shift+key", () => {
        test.each(shiftKeys.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
          "%s → %s [%s]",
          (key, _commandId, _layer, parsed) => {
            const result = verifyRoundtrip(key, parsed)
            expect(result.error, `${key}: ${result.error}`).toBeUndefined()
          },
        )
      })
    }

    if (optKeys.length > 0) {
      describe("Alt/Opt+key", () => {
        test.each(optKeys.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
          "%s → %s [%s]",
          (key, _commandId, _layer, parsed) => {
            const result = verifyRoundtrip(key, parsed)
            expect(result.error, `${key}: ${result.error}`).toBeUndefined()
          },
        )
      })
    }

    if (cmdKeys.length > 0) {
      describe("Cmd/Super+key (Kitty protocol)", () => {
        test.each(cmdKeys.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
          "%s → %s [%s]",
          (key, _commandId, _layer, parsed) => {
            const playwrightKey = toPlaywright(parsed)
            if (TERMINAL_CONSUMED[playwrightKey]) return
            const result = verifyRoundtrip(key, parsed)
            expect(result.error, `${key}: ${result.error}`).toBeUndefined()
          },
        )
      })
    }
  })

  // ═══════════════════════════════════════════════════════════════════
  // Known limitations (documented, not failing)
  // ═══════════════════════════════════════════════════════════════════

  describe("known limitations (documented)", () => {
    const ambiguous = simple.filter((b) => LEGACY_AMBIGUOUS[b.key])
    if (ambiguous.length > 0) {
      test.each(ambiguous.map((b) => [b.key, LEGACY_AMBIGUOUS[b.key]!] as const))(
        "LEGACY_AMBIGUOUS: %s — %s",
        (key, reason) => {
          // Verify the ambiguity is real (roundtrip should fail or mismatch)
          const parsed = parseKeyString(key)
          const result = verifyRoundtrip(key, parsed)
          // If it passes, the ambiguity was fixed upstream — remove from list
          if (!result.error) {
            expect.fail(`${key} now roundtrips correctly — remove from LEGACY_AMBIGUOUS. Reason was: ${reason}`)
          }
        },
      )
    }

    const adapterGaps = simple.filter((b) => KEY_ADAPTER_GAPS[b.parsed.key])
    if (adapterGaps.length > 0) {
      test.each(adapterGaps.map((b) => [b.key, KEY_ADAPTER_GAPS[b.parsed.key]!] as const))(
        "KEY_ADAPTER_GAP: %s — %s",
        (_key, reason) => {
          expect(reason).toBeTruthy()
        },
      )
    }

    const encodingGaps = simple.filter((b) => ENCODING_GAPS[b.parsed.key])
    if (encodingGaps.length > 0) {
      test.each(encodingGaps.map((b) => [b.key, ENCODING_GAPS[b.parsed.key]!] as const))(
        "ENCODING_GAP: %s — %s",
        (_key, reason) => {
          expect(reason).toBeTruthy()
        },
      )
    }

    for (const [playwrightKey, reason] of Object.entries(TERMINAL_CONSUMED)) {
      test(`TERMINAL_CONSUMED: ${playwrightKey} — ${reason}`, () => {
        expect(reason).toBeTruthy()
      })
    }
  })

  // ═══════════════════════════════════════════════════════════════════
  // Chord keys
  // ═══════════════════════════════════════════════════════════════════

  describe("chord keys — prefix + suffix roundtrip", () => {
    test.each(chords.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
      "%s → %s [%s]",
      (key, _commandId, _layer, parsed) => {
        // Verify suffix key
        const suffixParsed: ParsedKey = {
          key: parsed.key,
          ctrl: parsed.ctrl,
          opt: parsed.opt,
          shift: parsed.shift,
          cmd: parsed.cmd,
        }

        if (!knownLimitation(parsed.key, suffixParsed)) {
          const suffixResult = verifyRoundtrip(parsed.key, suffixParsed)
          expect(suffixResult.error, `Chord suffix '${parsed.key}' in '${key}': ${suffixResult.error}`).toBeUndefined()
        }

        // Verify prefix key
        // Chord prefixes are either bare ("v", "g") or modified ("Ctrl+v", "Ctrl+g").
        // Modified prefixes use "+" separator (Playwright-style), and the chord system
        // builds them at runtime via buildChordPrefix(key, modifiers) → "Ctrl+v".
        // We verify the underlying key+modifiers roundtrip, not the composite string.
        if (parsed.chord) {
          const prefixParsed = parseChordPrefix(parsed.chord)
          if (!knownLimitation(parsed.chord, prefixParsed)) {
            const prefixResult = verifyRoundtrip(prefixParsed.key, prefixParsed)
            expect(
              prefixResult.error,
              `Chord prefix '${parsed.chord}' in '${key}': ${prefixResult.error}`,
            ).toBeUndefined()
          }
        }
      },
    )
  })

  // ═══════════════════════════════════════════════════════════════════
  // Coverage summary
  // ═══════════════════════════════════════════════════════════════════

  describe("coverage summary", () => {
    test("all non-limited legacy ANSI keys roundtrip correctly", () => {
      const testable = simple.filter((b) => !requiresKitty(b.parsed) && !knownLimitation(b.key, b.parsed))
      const failures: string[] = []

      for (const binding of testable) {
        const result = verifyRoundtrip(binding.key, binding.parsed)
        if (result.error) {
          failures.push(`${binding.key} (${result.playwrightKey}): ${result.error}`)
        }
      }

      if (failures.length > 0) {
        expect.fail(`${failures.length} legacy ANSI roundtrip failures:\n  ${failures.join("\n  ")}`)
      }
    })

    test("all Kitty protocol keys roundtrip correctly (excluding known limitations)", () => {
      const testable = simple.filter(
        (b) =>
          requiresKitty(b.parsed) && !knownLimitation(b.key, b.parsed) && !TERMINAL_CONSUMED[toPlaywright(b.parsed)],
      )
      const failures: string[] = []

      for (const binding of testable) {
        const result = verifyRoundtrip(binding.key, binding.parsed)
        if (result.error) {
          failures.push(`${binding.key} (${result.playwrightKey}): ${result.error}`)
        }
      }

      if (failures.length > 0) {
        expect.fail(`${failures.length} Kitty roundtrip failures:\n  ${failures.join("\n  ")}`)
      }
    })

    test("reports delivery matrix statistics", () => {
      const legacySimple = simple.filter((b) => !requiresKitty(b.parsed))
      const kittySimple = simple.filter((b) => requiresKitty(b.parsed))
      const limitedCount = simple.filter((b) => knownLimitation(b.key, b.parsed)).length

      // Verify counts are in expected ranges (catches if bindings are added/removed)
      expect(allBindings.length).toBeGreaterThan(200)
      expect(simple.length).toBeGreaterThan(100)
      expect(chords.length).toBeGreaterThan(100)
      expect(legacySimple.length).toBeGreaterThan(80)
      expect(kittySimple.length).toBeGreaterThan(20)
      expect(limitedCount).toBeLessThan(15)
    })
  })
})
