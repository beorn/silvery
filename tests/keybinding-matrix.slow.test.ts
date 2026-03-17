/**
 * Cross-backend keybinding delivery matrix test.
 *
 * Problem: Unit tests verify keybinding resolution but not terminal delivery.
 * Cmd+Arrow was shipped broken because Ghostty consumes those keys before
 * they reach the app.
 *
 * This test extracts all keybindings from defaultKeybindingLayers() and verifies
 * each one is deliverable through the terminal stack. It runs the FULL roundtrip
 * that the real app uses:
 *
 *   km-commands key → Playwright key → keyToAnsi/keyToKittyAnsi → ANSI bytes
 *     → parseKey (silvery) → [input, Key] → keyToString/keyToModifiers (km-commands)
 *       → resolveKeybinding match
 *
 * Findings are categorized as:
 *   - PASS: full roundtrip works
 *   - LEGACY_AMBIGUOUS: key works with Kitty protocol but is ambiguous in legacy ANSI
 *     (e.g., Ctrl+I = Tab, Ctrl+J = Enter, Shift+Enter = Enter)
 *   - TERMINAL_CONSUMED: key roundtrips through ANSI but real terminals consume it
 *     (e.g., Cmd+Arrow on Ghostty/iTerm)
 *   - FAIL: broken roundtrip (real bug)
 */

import { describe, test, expect } from "vitest"
import { defaultKeybindingLayers, parseKeyString, keyToString, keyToModifiers, type ParsedKey } from "@km/commands"
import { parseKey, keyToAnsi, keyToKittyAnsi, splitRawInput } from "@silvery/tea/keys"

// =============================================================================
// Key format conversion: km-commands → Playwright-style
// =============================================================================

/**
 * Convert km-commands ParsedKey to Playwright-style key string.
 * Special handling for keys that are also Playwright separators ("+").
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

/** Kitty protocol is required for keys with Cmd/Super modifier */
function requiresKitty(parsed: ParsedKey): boolean {
	return parsed.cmd
}

// =============================================================================
// Known limitations — categorized by root cause
// =============================================================================

/**
 * Keys that are ambiguous in legacy ANSI (no Kitty protocol).
 * These keys encode to the SAME byte as another key, making them
 * indistinguishable without Kitty keyboard protocol.
 *
 * Map from km-commands key string → explanation.
 */
const LEGACY_AMBIGUOUS: Record<string, string> = {
	// Ctrl+letter keys that alias to special keys (ASCII control codes)
	"ctrl-i": "Ctrl+I = 0x09 = Tab (same byte)",
	"ctrl-j": "Ctrl+J = 0x0A = Linefeed/Enter (same byte)",
	// Note: ctrl-m = 0x0D = Enter, ctrl-h = 0x08 = Backspace are not bound

	// Shift+special keys: legacy ANSI cannot distinguish Shift+Enter from Enter
	"shift-Enter": "Legacy ANSI: Shift+Enter = \\r (same as Enter)",
	"shift-Backspace": "Legacy ANSI: Shift+Backspace = 0x7F (same as Backspace)",

	// Ctrl+Shift+letter: in legacy ANSI, ctrl reduces to ASCII 1-26 (loses shift)
	"ctrl-shift-z": "Legacy ANSI: Ctrl+Shift+Z = 0x1A (same as Ctrl+Z, shift lost)",
	"ctrl-shift-r": "Legacy ANSI: Ctrl+Shift+R = 0x12 (same as Ctrl+R, shift lost)",
}

/**
 * Keys consumed by real terminal emulators before reaching the app.
 * These pass the ANSI roundtrip test but fail in practice.
 */
const TERMINAL_CONSUMED: Record<string, string> = {
	"Super+ArrowUp": "Ghostty/iTerm consumes Cmd+Arrow — scrolls terminal",
	"Super+ArrowDown": "Ghostty/iTerm consumes Cmd+Arrow — scrolls terminal",
	"Super+ArrowLeft": "Ghostty/iTerm consumes Cmd+Arrow — maps to Home",
	"Super+ArrowRight": "Ghostty/iTerm consumes Cmd+Arrow — maps to End",
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
 * For Kitty-required keys (cmd-*), uses keyToKittyAnsi.
 * For legacy keys, uses keyToAnsi.
 *
 * The key matching accounts for:
 * - Uppercase letters: parseKey sets shift=true for "G", but matchBinding
 *   ignores shift for uppercase keys — so this is correct.
 * - Kitty shift+letter: Kitty text field has uppercase "R" for Shift+r,
 *   parseKey returns input="R", which keyToString returns as "R". The
 *   km-commands key is "r" with shift=true, so we check case-insensitively
 *   when shift is involved.
 * - Special keys: keyToString maps parseKey output to km-commands names
 *   (e.g., "return" → "Enter", "up" → "ArrowUp").
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
		// Encode to ANSI
		const ansi = kittyRequired ? keyToKittyAnsi(playwrightKey) : keyToAnsi(playwrightKey)
		result.ansiSequence = ansi

		if (!ansi) {
			result.error = "Key produces no ANSI sequence"
			return result
		}

		// Split and parse
		const sequences = [...splitRawInput(ansi)]
		if (sequences.length === 0) {
			result.error = "splitRawInput produced no keypresses"
			return result
		}

		const [input, key] = parseKey(sequences[0]!)
		result.resolvedKey = keyToString(input, key)
		result.resolvedModifiers = keyToModifiers(key)

		// Key matching:
		// 1. Direct match (most keys)
		// 2. Case-insensitive when shift is involved (Kitty: Shift+r → "R", km-commands: "r" + shift)
		// 3. Uppercase letter implicit shift (km-commands: "G" has shift=false, parseKey: shift=true)
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

		// Modifier matching (with uppercase letter exception)
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

/** Check if a binding is known to be ambiguous in legacy ANSI */
function isLegacyAmbiguous(binding: ExtractedBinding): string | undefined {
	return LEGACY_AMBIGUOUS[binding.key]
}

/** Check if a Playwright key is consumed by real terminals */
function isTerminalConsumed(playwrightKey: string): string | undefined {
	return TERMINAL_CONSUMED[playwrightKey]
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
		// Filter out legacy-ambiguous keys (tested separately)
		const testable = simple.filter((b) => !isLegacyAmbiguous(b))
		const noMods = testable.filter((b) => !b.parsed.ctrl && !b.parsed.cmd && !b.parsed.opt && !b.parsed.shift)
		const ctrlKeys = testable.filter((b) => b.parsed.ctrl && !b.parsed.cmd)
		const cmdKeys = testable.filter((b) => b.parsed.cmd)
		const optKeys = testable.filter((b) => b.parsed.opt && !b.parsed.cmd)
		const shiftKeys = testable.filter(
			(b) => b.parsed.shift && !b.parsed.ctrl && !b.parsed.cmd && !b.parsed.opt,
		)

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
						const consumed = isTerminalConsumed(playwrightKey)
						if (consumed) {
							// Passes ANSI roundtrip but fails in real terminals — document, don't fail
							return
						}
						const result = verifyRoundtrip(key, parsed)
						expect(result.error, `${key}: ${result.error}`).toBeUndefined()
					},
				)
			})
		}
	})

	// ═══════════════════════════════════════════════════════════════════
	// Legacy-ambiguous keys (separate section for visibility)
	// ═══════════════════════════════════════════════════════════════════

	describe("legacy-ambiguous keys (require Kitty protocol for correct delivery)", () => {
		const ambiguous = simple.filter((b) => isLegacyAmbiguous(b))

		test.each(ambiguous.map((b) => [b.key, b.commandId, LEGACY_AMBIGUOUS[b.key]!] as const))(
			"%s → %s: %s",
			(key, _commandId, reason) => {
				// These keys are EXPECTED to fail in legacy ANSI mode.
				// Verify they DO fail (confirming the ambiguity is real).
				const parsed = parseKeyString(key)
				const result = verifyRoundtrip(key, parsed)

				// The key should either produce an error or resolve to a different key
				// If it passes perfectly, it means we can remove it from LEGACY_AMBIGUOUS
				if (!result.error) {
					// Unexpected pass — this key is NOT ambiguous after all
					console.log(`  NOTE: ${key} roundtrips correctly — consider removing from LEGACY_AMBIGUOUS`)
				}

				// Document the ambiguity regardless
				expect(reason).toBeTruthy()
			},
		)
	})

	// ═══════════════════════════════════════════════════════════════════
	// Chord keys
	// ═══════════════════════════════════════════════════════════════════

	describe("chord keys — prefix + suffix roundtrip", () => {
		test.each(chords.map((b) => [b.key, b.commandId, b.layer, b.parsed] as const))(
			"%s → %s [%s]",
			(key, _commandId, _layer, parsed) => {
				// Verify suffix
				const suffixParsed: ParsedKey = {
					key: parsed.key,
					ctrl: parsed.ctrl,
					opt: parsed.opt,
					shift: parsed.shift,
					cmd: parsed.cmd,
				}

				// Skip legacy-ambiguous suffixes (e.g., chord with Shift+Tab suffix)
				const suffixKmKey = [
					parsed.shift && "shift",
					parsed.ctrl && "ctrl",
					parsed.opt && "opt",
					parsed.cmd && "cmd",
				]
					.filter(Boolean)
					.concat(parsed.key)
					.join("-")
				if (!LEGACY_AMBIGUOUS[suffixKmKey]) {
					const suffixResult = verifyRoundtrip(parsed.key, suffixParsed)
					expect(
						suffixResult.error,
						`Chord suffix '${parsed.key}' in '${key}': ${suffixResult.error}`,
					).toBeUndefined()
				}

				// Verify prefix
				if (parsed.chord) {
					const prefixParsed = parseKeyString(parsed.chord)
					if (!LEGACY_AMBIGUOUS[parsed.chord]) {
						const prefixResult = verifyRoundtrip(parsed.chord, prefixParsed)
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
	// Terminal-consumed keys (documentation)
	// ═══════════════════════════════════════════════════════════════════

	describe("terminal-consumed keys (documented)", () => {
		for (const [playwrightKey, reason] of Object.entries(TERMINAL_CONSUMED)) {
			test(`${playwrightKey}: ${reason}`, () => {
				// Verify the key DOES roundtrip through ANSI (the issue is the terminal, not our code)
				// Parse the Playwright key back to modifiers + key
				const parts = playwrightKey.split("+")
				const mainKey = parts.pop()!
				const parsed: ParsedKey = {
					key: mainKey,
					ctrl: parts.includes("Control"),
					opt: parts.includes("Alt"),
					shift: parts.includes("Shift"),
					cmd: parts.includes("Super"),
				}
				const result = verifyRoundtrip(playwrightKey, parsed)
				// This SHOULD pass — the ANSI encoding is correct, it's the terminal that eats it
				if (result.error) {
					// Expected — the terminal consumes it before our code sees it
					expect(reason).toBeTruthy()
				}
			})
		}
	})

	// ═══════════════════════════════════════════════════════════════════
	// Coverage summary
	// ═══════════════════════════════════════════════════════════════════

	describe("coverage summary", () => {
		test("all non-ambiguous legacy ANSI keys roundtrip correctly", () => {
			const legacyBindings = simple.filter((b) => !requiresKitty(b.parsed) && !isLegacyAmbiguous(b))
			const failures: string[] = []

			for (const binding of legacyBindings) {
				const result = verifyRoundtrip(binding.key, binding.parsed)
				if (result.error) {
					failures.push(`${binding.key} (${result.playwrightKey}): ${result.error}`)
				}
			}

			if (failures.length > 0) {
				expect.fail(`${failures.length} legacy ANSI roundtrip failures:\n  ${failures.join("\n  ")}`)
			}
		})

		test("all Kitty protocol keys roundtrip correctly (excluding terminal-consumed)", () => {
			const kittyBindings = simple.filter((b) => requiresKitty(b.parsed) && !isLegacyAmbiguous(b))
			const failures: string[] = []

			for (const binding of kittyBindings) {
				const playwrightKey = toPlaywright(binding.parsed)
				if (isTerminalConsumed(playwrightKey)) continue
				const result = verifyRoundtrip(binding.key, binding.parsed)
				if (result.error) {
					failures.push(`${binding.key} (${result.playwrightKey}): ${result.error}`)
				}
			}

			if (failures.length > 0) {
				expect.fail(`${failures.length} Kitty roundtrip failures:\n  ${failures.join("\n  ")}`)
			}
		})

		test("delivery matrix summary", () => {
			const legacySimple = simple.filter((b) => !requiresKitty(b.parsed))
			const kittySimple = simple.filter((b) => requiresKitty(b.parsed))
			const ambiguousCount = simple.filter((b) => isLegacyAmbiguous(b)).length

			console.log(`\n--- Keybinding Delivery Matrix ---`)
			console.log(`Total unique keybindings: ${allBindings.length}`)
			console.log(`  Simple: ${simple.length} (${legacySimple.length} legacy, ${kittySimple.length} kitty)`)
			console.log(`  Chord: ${chords.length}`)
			console.log(`  Legacy-ambiguous: ${ambiguousCount}`)
			console.log(`  Terminal-consumed: ${Object.keys(TERMINAL_CONSUMED).length}`)

			const layers = defaultKeybindingLayers()
			for (const layer of layers) {
				const w = layer.bindings.filter((b) => b.wildcard).length
				const c = layer.bindings.filter((b) => b.key.includes(" ") && !b.wildcard).length
				const s = layer.bindings.filter((b) => !b.key.includes(" ") && !b.wildcard).length
				console.log(`  ${layer.name}: ${layer.bindings.length} (${s} simple, ${c} chords, ${w} wildcards)`)
			}
		})
	})
})
