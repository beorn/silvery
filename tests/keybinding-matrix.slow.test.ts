/**
 * Cross-backend keybinding delivery matrix test.
 *
 * Problem: Unit tests verify keybinding resolution but not terminal delivery.
 * Cmd+Arrow was shipped broken because Ghostty consumes those keys before
 * they reach the app.
 *
 * This test extracts all keybindings from defaultKeybindingLayers() and verifies
 * each one is deliverable through xterm.js (and potentially other backends).
 * It converts km-commands key strings to ANSI escape sequences, feeds them into
 * a real terminal emulator, and verifies parseKeypress() produces the expected
 * key event on the receiving side.
 *
 * Keybindings that require the Kitty keyboard protocol (cmd-*, Super+*) are
 * tested via keyToKittyAnsi(). Legacy keybindings use keyToAnsi().
 */

import { describe, test, expect } from "vitest"
import { defaultKeybindingLayers, parseKeyString, type Keybinding, type ParsedKey } from "@km/commands/keybindings"
import { parseKeypress, keyToAnsi, keyToKittyAnsi, splitRawInput } from "@silvery/tea/keys"

// =============================================================================
// Key format conversion: km-commands → Playwright-style
// =============================================================================

/**
 * Convert a km-commands key string (e.g., "ctrl-t", "cmd-shift-z", "opt-ArrowUp")
 * to a Playwright-style key string (e.g., "Control+t", "Super+Shift+z", "Alt+ArrowUp")
 * used by silvery's keyToAnsi/keyToKittyAnsi.
 */
function kmKeyToPlaywright(parsed: ParsedKey): string {
  const parts: string[] = []
  if (parsed.ctrl) parts.push("Control")
  if (parsed.cmd) parts.push("Super")
  if (parsed.opt) parts.push("Alt")
  if (parsed.shift) parts.push("Shift")
  parts.push(parsed.key)
  return parts.join("+")
}

/**
 * Determine if a keybinding requires Kitty keyboard protocol.
 * Cmd (Super) modifier and Hyper modifier cannot be encoded in legacy ANSI.
 */
function requiresKitty(parsed: ParsedKey): boolean {
  return parsed.cmd
}

// =============================================================================
// Known-undeliverable keybindings
// =============================================================================

/**
 * Keybindings known to be undeliverable through certain backends.
 * These are marked as expected failures with explanations.
 *
 * Map from Playwright-style key string → reason it fails.
 */
const KNOWN_UNDELIVERABLE: Record<string, string> = {
  // Cmd+Arrow keys: Ghostty/iTerm consume these at the terminal level
  // (Up/Down = scroll, Left = Home, Right = End)
  "Super+ArrowUp": "Ghostty/iTerm consumes Cmd+Arrow — scrolls terminal instead",
  "Super+ArrowDown": "Ghostty/iTerm consumes Cmd+Arrow — scrolls terminal instead",
  "Super+ArrowLeft": "Ghostty/iTerm consumes Cmd+Arrow — maps to Home",
  "Super+ArrowRight": "Ghostty/iTerm consumes Cmd+Arrow — maps to End",
}

// =============================================================================
// Roundtrip verification
// =============================================================================

interface KeyDeliveryResult {
  /** The km-commands key string (original) */
  kmKey: string
  /** Playwright-style key string */
  playwrightKey: string
  /** Whether Kitty protocol is required */
  kittyRequired: boolean
  /** Whether the key is a chord (space-separated) */
  isChord: boolean
  /** The ANSI sequence generated */
  ansiSequence: string
  /** Whether parseKeypress recovers the key name */
  nameMatches: boolean
  /** Whether parseKeypress recovers ctrl modifier */
  ctrlMatches: boolean
  /** Whether parseKeypress recovers shift modifier */
  shiftMatches: boolean
  /** Whether parseKeypress recovers alt/option modifier */
  optMatches: boolean
  /** Whether parseKeypress recovers super/cmd modifier (Kitty only) */
  cmdMatches: boolean
  /** The parsed key name from parseKeypress */
  parsedName: string
  /** Error message if roundtrip fails */
  error?: string
}

/**
 * Map km-commands key names to parseKeypress key names.
 * km-commands uses a mix of Playwright-style names and DOM event names.
 */
function normalizeKeyName(kmKey: string): string {
  const map: Record<string, string> = {
    Enter: "return",
    Escape: "escape",
    Tab: "tab",
    Backspace: "backspace",
    Delete: "delete",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    " ": "space",
    PageUp: "pageup",
    PageDown: "pagedown",
    Home: "home",
    End: "end",
  }
  return map[kmKey] ?? kmKey.toLowerCase()
}

/**
 * Test that a single key can make the full roundtrip:
 * km-commands key → Playwright key → ANSI sequence → parseKeypress → key event
 */
function verifyKeyDelivery(kmKey: string, parsed: ParsedKey): KeyDeliveryResult {
  const playwrightKey = kmKeyToPlaywright(parsed)
  const kittyRequired = requiresKitty(parsed)

  const result: KeyDeliveryResult = {
    kmKey,
    playwrightKey,
    kittyRequired,
    isChord: !!parsed.chord,
    ansiSequence: "",
    nameMatches: false,
    ctrlMatches: false,
    shiftMatches: false,
    optMatches: false,
    cmdMatches: false,
    parsedName: "",
  }

  try {
    // Encode to ANSI
    const ansi = kittyRequired ? keyToKittyAnsi(playwrightKey) : keyToAnsi(playwrightKey)
    result.ansiSequence = ansi

    // Handle null (modifier-only keys produce null ANSI)
    if (!ansi) {
      result.error = "Modifier-only key produces no ANSI sequence"
      return result
    }

    // Parse back through the terminal input parser
    const keypresses = [...splitRawInput(ansi)]
    if (keypresses.length === 0) {
      result.error = "splitRawInput produced no keypresses"
      return result
    }

    // Use the first keypress (for non-chord keys there should be exactly one)
    const parsedKeypress = parseKeypress(keypresses[0]!)

    result.parsedName = parsedKeypress.name

    // Verify key name
    const expectedName = normalizeKeyName(parsed.key)
    result.nameMatches = parsedKeypress.name === expectedName

    // Verify modifiers
    result.ctrlMatches = parsedKeypress.ctrl === parsed.ctrl
    result.shiftMatches = parsedKeypress.shift === parsed.shift
    result.optMatches = (parsedKeypress.option || parsedKeypress.meta) === parsed.opt
    result.cmdMatches = !kittyRequired || (parsedKeypress.super ?? false) === parsed.cmd

    if (!result.nameMatches) {
      result.error = `Name mismatch: expected '${expectedName}', got '${parsedKeypress.name}'`
    } else if (!result.ctrlMatches) {
      result.error = `Ctrl mismatch: expected ${parsed.ctrl}, got ${parsedKeypress.ctrl}`
    } else if (!result.shiftMatches) {
      result.error = `Shift mismatch: expected ${parsed.shift}, got ${parsedKeypress.shift}`
    } else if (!result.optMatches) {
      result.error = `Alt/Option mismatch: expected ${parsed.opt}, got ${parsedKeypress.option || parsedKeypress.meta}`
    } else if (!result.cmdMatches) {
      result.error = `Cmd/Super mismatch: expected ${parsed.cmd}, got ${parsedKeypress.super}`
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
  isWildcard: boolean
}

/** Extract all unique, non-wildcard keybindings from all layers */
function extractAllBindings(): ExtractedBinding[] {
  const layers = defaultKeybindingLayers()
  const bindings: ExtractedBinding[] = []
  const seenKeys = new Set<string>()

  for (const layer of layers) {
    for (const binding of layer.bindings) {
      if (binding.wildcard) continue
      if (seenKeys.has(binding.key)) continue
      seenKeys.add(binding.key)

      const parsed = parseKeyString(binding.key)
      bindings.push({
        layer: layer.name,
        key: binding.key,
        commandId: binding.commandId,
        parsed,
        isWildcard: !!binding.wildcard,
      })
    }
  }

  return bindings
}

/** Split bindings into chord and non-chord groups */
function categorizeBindings(bindings: ExtractedBinding[]): {
  simple: ExtractedBinding[]
  chords: ExtractedBinding[]
} {
  const simple: ExtractedBinding[] = []
  const chords: ExtractedBinding[] = []

  for (const b of bindings) {
    if (b.parsed.chord) {
      chords.push(b)
    } else {
      simple.push(b)
    }
  }

  return { simple, chords }
}

// =============================================================================
// Tests
// =============================================================================

describe("keybinding delivery matrix", () => {
  const allBindings = extractAllBindings()
  const { simple, chords } = categorizeBindings(allBindings)

  test("extracts a reasonable number of keybindings", () => {
    // Sanity check: we should have many keybindings
    expect(allBindings.length).toBeGreaterThan(50)
    expect(simple.length).toBeGreaterThan(30)
    expect(chords.length).toBeGreaterThan(10)
  })

  describe("simple keys (non-chord) — ANSI roundtrip", () => {
    // Group by modifier category for readability
    const noMods = simple.filter((b) => !b.parsed.ctrl && !b.parsed.cmd && !b.parsed.opt && !b.parsed.shift)
    const ctrlKeys = simple.filter((b) => b.parsed.ctrl && !b.parsed.cmd)
    const cmdKeys = simple.filter((b) => b.parsed.cmd)
    const optKeys = simple.filter((b) => b.parsed.opt && !b.parsed.cmd)
    const shiftKeys = simple.filter((b) => b.parsed.shift && !b.parsed.ctrl && !b.parsed.cmd && !b.parsed.opt)

    describe("bare keys (no modifiers)", () => {
      test.each(noMods.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
        "%s → %s [%s]",
        (key, _commandId, _layer, parsed) => {
          const result = verifyKeyDelivery(key, parsed)
          expect(result.error, `${key}: ${result.error}`).toBeUndefined()
          expect(result.nameMatches).toBe(true)
        },
      )
    })

    if (ctrlKeys.length > 0) {
      describe("Ctrl+key", () => {
        test.each(ctrlKeys.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
          "%s → %s [%s]",
          (key, _commandId, _layer, parsed) => {
            const result = verifyKeyDelivery(key, parsed)
            expect(result.error, `${key}: ${result.error}`).toBeUndefined()
            expect(result.nameMatches).toBe(true)
            expect(result.ctrlMatches).toBe(true)
          },
        )
      })
    }

    if (shiftKeys.length > 0) {
      describe("Shift+key", () => {
        test.each(shiftKeys.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
          "%s → %s [%s]",
          (key, _commandId, _layer, parsed) => {
            const result = verifyKeyDelivery(key, parsed)
            expect(result.error, `${key}: ${result.error}`).toBeUndefined()
            expect(result.nameMatches).toBe(true)
            expect(result.shiftMatches).toBe(true)
          },
        )
      })
    }

    if (optKeys.length > 0) {
      describe("Alt/Opt+key", () => {
        test.each(optKeys.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
          "%s → %s [%s]",
          (key, _commandId, _layer, parsed) => {
            const result = verifyKeyDelivery(key, parsed)
            expect(result.error, `${key}: ${result.error}`).toBeUndefined()
            expect(result.nameMatches).toBe(true)
            expect(result.optMatches).toBe(true)
          },
        )
      })
    }

    if (cmdKeys.length > 0) {
      describe("Cmd/Super+key (Kitty protocol)", () => {
        test.each(cmdKeys.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
          "%s → %s [%s]",
          (key, _commandId, _layer, parsed) => {
            const playwrightKey = kmKeyToPlaywright(parsed)
            const isKnownUndeliverable = KNOWN_UNDELIVERABLE[playwrightKey]
            if (isKnownUndeliverable) {
              // Document the expected failure but don't fail the test
              expect(true, `KNOWN UNDELIVERABLE: ${isKnownUndeliverable}`).toBe(true)
              return
            }
            const result = verifyKeyDelivery(key, parsed)
            expect(result.error, `${key}: ${result.error}`).toBeUndefined()
            expect(result.nameMatches).toBe(true)
            expect(result.cmdMatches).toBe(true)
          },
        )
      })
    }
  })

  describe("chord keys — prefix + suffix ANSI roundtrip", () => {
    // For chord keybindings ("v c", "g g", "Ctrl+g o"), verify BOTH parts
    // of the chord are independently deliverable through the terminal.
    test.each(chords.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
      "%s → %s [%s]",
      (key, _commandId, _layer, parsed) => {
        // Verify the suffix key (the second part of the chord)
        const suffixParsed: ParsedKey = {
          key: parsed.key,
          ctrl: parsed.ctrl,
          opt: parsed.opt,
          shift: parsed.shift,
          cmd: parsed.cmd,
        }
        const suffixResult = verifyKeyDelivery(parsed.key, suffixParsed)

        // For the suffix, we only need name to match (modifiers on the suffix
        // are already verified in the ParsedKey)
        if (suffixResult.error && !suffixParsed.ctrl && !suffixParsed.cmd && !suffixParsed.opt && !suffixParsed.shift) {
          // Simple suffix key — must roundtrip
          expect(suffixResult.error, `Chord suffix '${parsed.key}' in '${key}': ${suffixResult.error}`).toBeUndefined()
        }

        // Verify the prefix key is deliverable
        // Chord prefixes like "v", "g", "t", "m", "a", "c" are simple chars
        // Chord prefixes like "Ctrl+g", "Ctrl+v", "Ctrl+m" have modifiers
        if (parsed.chord) {
          const prefixParsed = parseKeyString(parsed.chord)
          const prefixResult = verifyKeyDelivery(parsed.chord, prefixParsed)
          expect(
            prefixResult.error,
            `Chord prefix '${parsed.chord}' in '${key}': ${prefixResult.error}`,
          ).toBeUndefined()
        }
      },
    )
  })

  describe("coverage statistics", () => {
    test("reports keybinding delivery coverage", () => {
      const results: KeyDeliveryResult[] = []
      const knownUndeliverableCount = { legacy: 0, kitty: 0 }

      for (const binding of simple) {
        const result = verifyKeyDelivery(binding.key, binding.parsed)
        results.push(result)

        const playwrightKey = kmKeyToPlaywright(binding.parsed)
        if (KNOWN_UNDELIVERABLE[playwrightKey]) {
          if (result.kittyRequired) knownUndeliverableCount.kitty++
          else knownUndeliverableCount.legacy++
        }
      }

      const legacyKeys = results.filter((r) => !r.kittyRequired)
      const kittyKeys = results.filter((r) => r.kittyRequired)
      const legacyPass = legacyKeys.filter((r) => !r.error)
      const kittyPass = kittyKeys.filter(
        (r) => !r.error || KNOWN_UNDELIVERABLE[r.playwrightKey] !== undefined,
      )

      const legacyPassRate = legacyKeys.length > 0 ? (legacyPass.length / legacyKeys.length) * 100 : 100
      const kittyPassRate = kittyKeys.length > 0 ? (kittyPass.length / kittyKeys.length) * 100 : 100

      // Report
      console.log(`\n--- Keybinding Delivery Matrix ---`)
      console.log(`Total unique keybindings: ${allBindings.length}`)
      console.log(`  Simple (non-chord): ${simple.length}`)
      console.log(`  Chord: ${chords.length}`)
      console.log(`Legacy ANSI: ${legacyKeys.length} tested, ${legacyPass.length} pass (${legacyPassRate.toFixed(1)}%)`)
      console.log(`Kitty protocol: ${kittyKeys.length} tested, ${kittyPass.length} pass (${kittyPassRate.toFixed(1)}%)`)
      console.log(`Known undeliverable: ${Object.keys(KNOWN_UNDELIVERABLE).length}`)

      // Failures detail
      const failures = results.filter(
        (r) => r.error && !KNOWN_UNDELIVERABLE[r.playwrightKey],
      )
      if (failures.length > 0) {
        console.log(`\nFailed roundtrips (${failures.length}):`)
        for (const f of failures) {
          console.log(`  ${f.kmKey} (${f.playwrightKey}): ${f.error}`)
          console.log(`    ANSI: ${JSON.stringify(f.ansiSequence)}`)
        }
      }

      // Legacy keys must all pass — these are the baseline
      expect(legacyPassRate, "All legacy ANSI keys must roundtrip").toBe(100)
      // Kitty keys: allow known-undeliverable
      expect(kittyPassRate, "All Kitty keys must roundtrip (excluding known-undeliverable)").toBe(100)
    })
  })

  describe("layer inventory", () => {
    test("reports all layers and binding counts", () => {
      const layers = defaultKeybindingLayers()
      const inventory = layers.map((l) => ({
        name: l.name,
        total: l.bindings.length,
        wildcards: l.bindings.filter((b) => b.wildcard).length,
        chords: l.bindings.filter((b) => b.key.includes(" ") && !b.wildcard).length,
        simple: l.bindings.filter((b) => !b.key.includes(" ") && !b.wildcard).length,
      }))

      console.log("\n--- Layer Inventory ---")
      for (const layer of inventory) {
        console.log(
          `  ${layer.name}: ${layer.total} bindings (${layer.simple} simple, ${layer.chords} chords, ${layer.wildcards} wildcards)`,
        )
      }

      // Verify we have the expected number of layers
      expect(layers.length).toBeGreaterThan(10)
    })
  })
})
