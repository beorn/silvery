/**
 * SGR mouse event parsing (mode 1006) and SGR-Pixels parsing (mode 1016).
 *
 * SGR format: CSI < button;x;y M (press) or CSI < button;x;y m (release)
 *
 * Button encoding:
 * - Bits 0-1: 0=left, 1=middle, 2=right, 3=release (X10 only, not SGR)
 * - Bit 2 (+4): Shift held
 * - Bit 3 (+8): Meta/Alt held
 * - Bit 4 (+16): Ctrl held
 * - Bit 5 (+32): Motion event (mouse moved while button held)
 * - Bits 6-7: 64=wheel-up, 65=wheel-down, 66=wheel-left, 67=wheel-right
 */

/**
 * Parsed mouse event from SGR mouse protocol.
 */
export interface ParsedMouse {
  /** Mouse button: 0=left, 1=middle, 2=right */
  button: number
  /**
   * Silvery layout X coordinate, in terminal cells.
   * Integer in SGR 1006 mode; fractional when parsed from SGR-Pixels 1016.
   */
  x: number
  /**
   * Silvery layout Y coordinate, in terminal cells.
   * Integer in SGR 1006 mode; fractional when parsed from SGR-Pixels 1016.
   */
  y: number
  /** Physical pixel X coordinate, present only for SGR-Pixels 1016. */
  clientX?: number
  /** Physical pixel Y coordinate, present only for SGR-Pixels 1016. */
  clientY?: number
  /** Coordinate mode used by the parser. */
  coordinateMode: "cell" | "pixel"
  /** Event action */
  action: "down" | "up" | "move" | "wheel"
  /**
   * Vertical wheel delta (deltaY): -1 for wheel-up, +1 for wheel-down, 0 for a
   * pure-horizontal wheel. DOM-style sign convention (down is positive).
   */
  delta?: number
  /**
   * Horizontal wheel delta (deltaX): -1 for wheel-left, +1 for wheel-right, 0
   * for a pure-vertical wheel. DOM-style sign convention (right is positive).
   * SGR buttons 66 (left) / 67 (right) decode here; consumers that only read
   * `delta`/`deltaY` are unaffected.
   */
  deltaX?: number
  /** Shift was held */
  shift: boolean
  /** Alt/Meta was held */
  meta: boolean
  /** Ctrl was held */
  ctrl: boolean
  /** Monotonic timestamp when the terminal input chunk was received. */
  receivedAt?: number
  /** Monotonic id shared by events parsed from the same terminal input chunk. */
  inputBatchId?: number
}

const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/

export interface ParseMouseOptions {
  coordinateMode?: "cell" | "pixel"
  cellSize?: { width: number; height: number }
  // UPSTREAM-WAITING(herdr#unfiled): Delete when herdr forwards pixel units under 1016
  // Bead: @km/all/12134-upstream-waiting/24675-herdr-reports-sgr-pixels-mode-set-while-forwarding-cell-unit-mouse-coordinates
  // Escalate by: 2027-03-16
  /**
   * The negotiating side attests that the terminal encodes pixel units under
   * 1016, so {@link createMouseUnitVerifier} starts proven instead of waiting
   * for the stream. Only an in-process emulator whose modes the runtime itself
   * set can say so — `run()`'s emulator branch is the one writer. A real PTY
   * never can: a multiplexer answers every probe, DECRQM `?1016` included, and
   * still forwards cells (herdr 0.9, measured 2026-09-16), so the real-PTY
   * branch strips this from caller options and the stream stays the proof.
   */
  pixelUnitsAttested?: true
}

/**
 * One SGR mouse sequence as it arrived on the wire: the button byte and the
 * 1-indexed coordinates in whatever units the terminal actually used. SGR
 * 1006 (cells) and SGR-Pixels 1016 (pixels) are byte-identical in shape, so
 * the units are NOT recoverable from the sequence itself — see
 * {@link createMouseUnitVerifier} for how they are established.
 */
interface SgrMouseWire {
  readonly button: number
  /** 1-indexed wire X, in the terminal's units. */
  readonly x: number
  /** 1-indexed wire Y, in the terminal's units. */
  readonly y: number
  readonly terminator: "M" | "m"
}

/** Read the wire fields of an SGR mouse sequence; `null` when the shape doesn't match. */
function readSgrMouseWire(input: string): SgrMouseWire | null {
  const m = SGR_MOUSE_RE.exec(input)
  if (!m) return null
  return {
    button: parseInt(m[1]!),
    x: parseInt(m[2]!),
    y: parseInt(m[3]!),
    terminator: m[4] === "m" ? "m" : "M",
  }
}

/**
 * Parse an SGR mouse sequence.
 *
 * Return semantics (see ProtocolError in @silvery/ansi for the full contract):
 * - `null` — input does not match the SGR mouse shape `CSI < B;X;Y [Mm]`.
 *   No "committed but malformed" branch exists here: either the full SGR
 *   shape matches (parse succeeds) or it doesn't (null = next-parser-please).
 *
 * The bead 15127 audit listed this parser for review, but the regex-based
 * shape match means there's no place where the parser commits to "this is
 * a mouse event" and then fails on body validation — both happen at the
 * same point. Loud-error tightening here would require a stricter
 * sub-grammar (e.g. validating button-code ranges), tracked separately.
 *
 * The units applied are exactly `options.coordinateMode`; this function
 * trusts the caller. A runtime that negotiated 1016 with a terminal it cannot
 * attribute the coordinates to must parse through
 * {@link createMouseUnitVerifier} instead.
 *
 * @returns ParsedMouse or null if not a valid mouse sequence
 */
export function parseMouseSequence(input: string, options?: ParseMouseOptions): ParsedMouse | null {
  const wire = readSgrMouseWire(input)
  return wire ? interpretSgrMouse(wire, options) : null
}

/** Turn wire fields into a {@link ParsedMouse} using the given coordinate units. */
function interpretSgrMouse(wire: SgrMouseWire, options?: ParseMouseOptions): ParsedMouse {
  const raw = wire.button
  const rawX = wire.x - 1 // 1-indexed → 0-indexed
  const rawY = wire.y - 1
  const coordinateMode = options?.coordinateMode ?? "cell"
  const cellWidth = Math.max(1, options?.cellSize?.width ?? 1)
  const cellHeight = Math.max(1, options?.cellSize?.height ?? 1)
  const x = coordinateMode === "pixel" ? rawX / cellWidth : rawX
  const y = coordinateMode === "pixel" ? rawY / cellHeight : rawY
  const clientX = coordinateMode === "pixel" ? rawX : undefined
  const clientY = coordinateMode === "pixel" ? rawY : undefined
  const terminator = wire.terminator

  const shift = !!(raw & 4)
  const meta = !!(raw & 8)
  const ctrl = !!(raw & 16)
  const motion = !!(raw & 32)
  const isWheel = !!(raw & 64)

  if (isWheel) {
    // Bits 0-1 of a wheel button: 0=up, 1=down, 2=left, 3=right (X11 buttons
    // 4/5/6/7 → SGR 64/65/66/67). Up/down move the vertical axis (deltaY),
    // left/right the horizontal axis (deltaX); a wheel tick is single-axis.
    const wheelButton = raw & 3
    const horizontal = wheelButton >= 2
    const deltaY = horizontal ? 0 : wheelButton === 0 ? -1 : 1
    const deltaX = horizontal ? (wheelButton === 2 ? -1 : 1) : 0
    return {
      button: 0,
      x,
      y,
      ...(clientX === undefined ? {} : { clientX }),
      ...(clientY === undefined ? {} : { clientY }),
      coordinateMode,
      action: "wheel",
      delta: deltaY,
      deltaX,
      shift,
      meta,
      ctrl,
    }
  }

  const button = raw & 3
  const action = motion ? "move" : terminator === "M" ? "down" : "up"
  return {
    button,
    x,
    y,
    ...(clientX === undefined ? {} : { clientX }),
    ...(clientY === undefined ? {} : { clientY }),
    coordinateMode,
    action,
    shift,
    meta,
    ctrl,
  }
}

const SGR_MOUSE_TEST_RE = /^\x1b\[<\d+;\d+;\d+[Mm]$/

/** Check if a raw input string is a mouse sequence */
export function isMouseSequence(input: string): boolean {
  return SGR_MOUSE_TEST_RE.test(input)
}

// ============================================================================
// Coordinate units — verified from the stream, never assumed
// ============================================================================

/**
 * Which units the parser is applying right now, and why.
 *
 * Once a runtime has asked a terminal for SGR-Pixels (1016), nothing in the
 * event stream says whether the numbers are pixels or cells. A multiplexer
 * can answer the 14t/18t geometry probes truthfully and still forward cell
 * units (herdr 0.9, measured 2026-09-16 — `@si/select/24649`); dividing
 * those by the probed cell size collapses every event into the top-left
 * corner while mouse reporting looks nominally alive. So the unit is DERIVED
 * from evidence, never stored as a belief: an event whose wire x exceeds the
 * live column count (or wire y the row count) is impossible under cell units
 * and proves pixel units; until that proof arrives, events are read as cells.
 * The residual — a click inside the top-left cells before any motion on a true
 * pixel terminal reads as cells — is why this state is readable, not silent.
 *
 * The one exception is an in-process emulator: there is no tty between the
 * runtime and the terminal, the runtime set the emulator's 1016 itself, and the
 * emulator encodes what its mode says. That side attests pixel units through
 * {@link ParseMouseOptions.pixelUnitsAttested} and the stream has nothing left
 * to prove; `provenBy` says which of the two happened.
 */
export interface MouseCoordinateInterpretation {
  /** Units the next event will be parsed in. */
  readonly units: "cell" | "pixel"
  /** Units negotiated with the terminal through the parser options. */
  readonly negotiated: "cell" | "pixel"
  /**
   * `true` once pixel units are proven — by the stream, or attested at
   * negotiation by an in-process emulator; `false` while a pixel negotiation
   * is unproven (events read as cells); `undefined` when cell units were
   * negotiated and there is nothing to verify.
   */
  readonly pixelVerified: boolean | undefined
  /**
   * How pixel units were proven: `"stream"` by an event impossible under cell
   * units, `"attested"` by the negotiating side (an in-process emulator);
   * `undefined` while unproven or under a cell negotiation.
   */
  readonly provenBy: "stream" | "attested" | undefined
  /** 1-based ordinal of the event that proved pixel units, once one has. */
  readonly verifiedAtEvent: number | undefined
  /** Mouse events seen since the options were last set. */
  readonly eventsSeen: number
  /** The grid the last event was checked against; `undefined` before any event. */
  readonly lastGrid: { cols: number; rows: number } | undefined
}

export interface MouseUnitVerifierOptions {
  /**
   * Live terminal grid. Read per event, so a resize between the geometry
   * probe and the first event cannot manufacture or hide a proof.
   */
  size: () => { cols: number; rows: number }
  /**
   * Fires once when the first event under an unproven pixel negotiation is
   * read as cells (`"unproven"`) and once when pixel units are proven
   * (`"proven"`). Wire it to a logger — the verifier stays dependency-free.
   */
  onChange?: (interpretation: MouseCoordinateInterpretation, reason: "unproven" | "proven") => void
}

export interface MouseUnitVerifier {
  /** Parse one SGR sequence in the units the stream has justified so far. */
  parse(input: string): ParsedMouse | null
  /** Current interpretation — the diagnostic surface. */
  interpretation(): MouseCoordinateInterpretation
  /** Replace the negotiated options; verification starts over. */
  setOptions(options: ParseMouseOptions | undefined): void
}

// UPSTREAM-WAITING(herdr#unfiled): Delete when herdr forwards pixel units under 1016
// Bead: @km/all/12134-upstream-waiting/24675-herdr-reports-sgr-pixels-mode-set-while-forwarding-cell-unit-mouse-coordinates
// Escalate by: 2027-03-16
/**
 * Create a parser that applies pixel units only once the stream has proven
 * them. See {@link MouseCoordinateInterpretation} for the contract.
 *
 * A grid the size source cannot report (non-finite) can never prove anything,
 * so such a stream stays in cell units; the interpretation says so.
 */
export function createMouseUnitVerifier(
  initial: ParseMouseOptions | undefined,
  verifierOptions: MouseUnitVerifierOptions,
): MouseUnitVerifier {
  let options = initial
  let negotiated: "cell" | "pixel" = "cell"
  let pixelVerified: boolean | undefined
  let provenBy: "stream" | "attested" | undefined
  let verifiedAtEvent: number | undefined
  let eventsSeen = 0
  let lastGrid: { cols: number; rows: number } | undefined
  let unprovenAnnounced = false

  function reset(next: ParseMouseOptions | undefined): void {
    options = next
    negotiated = next?.coordinateMode === "pixel" ? "pixel" : "cell"
    // An attestation is a proof the negotiating side already holds; without
    // one, a pixel negotiation starts unproven and the stream must earn it.
    const attested = negotiated === "pixel" && next?.pixelUnitsAttested === true
    pixelVerified = negotiated === "pixel" ? attested : undefined
    provenBy = attested ? "attested" : undefined
    verifiedAtEvent = undefined
    eventsSeen = 0
    lastGrid = undefined
    unprovenAnnounced = false
  }
  reset(initial)

  const units = (): "cell" | "pixel" => (negotiated === "pixel" && pixelVerified ? "pixel" : "cell")
  const snapshot = (): MouseCoordinateInterpretation => ({
    units: units(),
    negotiated,
    pixelVerified,
    provenBy,
    verifiedAtEvent,
    eventsSeen,
    lastGrid,
  })

  return {
    parse(input) {
      const wire = readSgrMouseWire(input)
      if (!wire) return null
      eventsSeen++
      if (negotiated === "pixel" && !pixelVerified) {
        const grid = verifierOptions.size()
        lastGrid = grid
        const provesPixels =
          (Number.isFinite(grid.cols) && wire.x > grid.cols) ||
          (Number.isFinite(grid.rows) && wire.y > grid.rows)
        if (provesPixels) {
          pixelVerified = true
          provenBy = "stream"
          verifiedAtEvent = eventsSeen
          verifierOptions.onChange?.(snapshot(), "proven")
        } else if (!unprovenAnnounced) {
          unprovenAnnounced = true
          verifierOptions.onChange?.(snapshot(), "unproven")
        }
      }
      return interpretSgrMouse(wire, units() === "pixel" ? options : { coordinateMode: "cell" })
    },
    interpretation: snapshot,
    setOptions: reset,
  }
}
