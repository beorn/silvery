/** Terminal-owned desktop notification emission. */

import type { TerminalCaps, TerminalNotificationProtocol } from "@silvery/ansi"

const ESC = "\x1b"
const BEL = "\x07"
const ST = `${ESC}\\`
const KITTY_ENCODED_CHUNK_SIZE = 4096

/** Internal marker for synthetic streams that cannot deliver notifications. */
export const NOTIFICATION_WRITER_AVAILABLE: unique symbol = Symbol(
  "silvery.notification-writer-available",
)

export type NotificationUrgency = "low" | "normal" | "critical"

/** Target-neutral action shown alongside a desktop notification. */
export interface NotificationAction {
  /** Stable application-owned id returned by activation events. */
  readonly id: string
  readonly label: string
}

/** Protocol-neutral notification data accepted by a Term. */
export interface NotificationRequest {
  /** Stable identifier used by protocols that support replacement. */
  readonly id?: string
  readonly title?: string
  readonly body: string
  readonly urgency?: NotificationUrgency
  /** Optional actions. The terminal target supports these only through OSC 99. */
  readonly actions?: readonly NotificationAction[]
  /** Ask the target to report a click on the notification itself. */
  readonly reportActivation?: boolean
}

export type NotificationUnsupportedReason =
  | "notifications"
  | "notification-actions"
  | "notification-activation"

/** Target-neutral delivery result shared by terminal and future DOM targets. */
export type NotificationDelivery =
  | { readonly status: "emitted" }
  | {
      readonly status: "unsupported"
      readonly reason: NotificationUnsupportedReason
    }

/** Terminal refinement that preserves exact protocol evidence for Term callers. */
export type TerminalNotificationDelivery =
  | { readonly status: "emitted"; readonly protocol: TerminalNotificationProtocol }
  | { readonly status: "unsupported"; readonly reason: NotificationUnsupportedReason }

/** Target-neutral activation projected from the target's native reply. */
export type NotificationActivation =
  | { readonly id: string; readonly kind: "notification" }
  | { readonly id: string; readonly kind: "action"; readonly actionId: string }

/** Cross-target notification capability. A future DOM target implements this same shape. */
export interface NotificationTarget {
  notify(request: NotificationRequest): NotificationDelivery
  onNotificationActivation(handler: (event: NotificationActivation) => void): () => void
}

/** OSC 99 reply after protocol parsing, before domain action-id projection. */
export interface TerminalNotificationActivation {
  readonly id: string
  readonly button?: number
}

export type NotificationReplyEnvelope =
  | {
      readonly status: "complete"
      readonly start: number
      readonly end: number
      readonly activation: TerminalNotificationActivation | null
    }
  | { readonly status: "incomplete"; readonly start: number }

interface NotificationController extends NotificationTarget, Disposable {
  notify(request: NotificationRequest): TerminalNotificationDelivery
  dispose(): void
}

type SubscribeToActivationReplies = (
  handler: (reply: TerminalNotificationActivation) => void,
) => (() => void) | undefined

/**
 * Bind notification emission to a Term's proven capability and owned writer.
 * Internal: callers use the single public `term.notify(request)` entry.
 */
export function createNotificationTarget(
  caps: Pick<TerminalCaps, "notifications">,
  write?: (data: string) => void,
  subscribeToActivationReplies?: SubscribeToActivationReplies,
): NotificationController {
  const activationHandlers = new Set<(event: NotificationActivation) => void>()
  const pendingActivations = new Map<string, readonly string[]>()
  let unsubscribeFromReplies: (() => void) | undefined
  let disposed = false

  function receiveActivation(reply: TerminalNotificationActivation): void {
    if (disposed) return
    const actionIds = pendingActivations.get(reply.id)
    if (actionIds === undefined) return

    const actionId = reply.button === undefined ? undefined : actionIds[reply.button - 1]
    const event: NotificationActivation | undefined =
      reply.button === undefined
        ? { id: reply.id, kind: "notification" }
        : actionId === undefined
          ? undefined
          : { id: reply.id, kind: "action", actionId }
    if (event === undefined) return
    pendingActivations.delete(reply.id)
    for (const handler of activationHandlers) handler(event)
  }

  function ensureReplySubscription(): boolean {
    if (unsubscribeFromReplies !== undefined) return true
    if (subscribeToActivationReplies === undefined) return false
    unsubscribeFromReplies = subscribeToActivationReplies(receiveActivation)
    return unsubscribeFromReplies !== undefined
  }

  function notify(request: NotificationRequest): TerminalNotificationDelivery {
    const protocol = caps.notifications
    if (protocol === false || write === undefined) {
      return { status: "unsupported", reason: "notifications" }
    }

    const actions = request.actions ?? []
    const wantsActivation = request.reportActivation === true || actions.length > 0
    if (actions.length > 0 && protocol !== "osc99") {
      return { status: "unsupported", reason: "notification-actions" }
    }
    if (request.reportActivation === true && protocol !== "osc99") {
      return { status: "unsupported", reason: "notification-activation" }
    }
    if (wantsActivation) {
      if (request.id === undefined) {
        throw new TypeError("Notification activation replies require a notification id")
      }
      validateActions(actions)
      kittyIdentifier(request.id)
      if (!ensureReplySubscription()) {
        return { status: "unsupported", reason: "notification-activation" }
      }
    }

    const sequence =
      protocol === "osc99"
        ? encodeOsc99(request)
        : protocol === "osc777"
          ? encodeOsc777(request)
          : encodeOsc9(request)
    const activationId = protocol === "osc99" ? request.id : undefined
    const previousActionIds =
      activationId === undefined ? undefined : pendingActivations.get(activationId)
    if (activationId !== undefined) {
      setPendingActivation(
        activationId,
        wantsActivation ? actions.map((action) => action.id) : undefined,
      )
    }
    try {
      write(sequence)
    } catch (error) {
      if (activationId !== undefined) setPendingActivation(activationId, previousActionIds)
      throw error
    }
    return { status: "emitted", protocol }
  }

  function setPendingActivation(id: string, actionIds: readonly string[] | undefined): void {
    if (actionIds === undefined) pendingActivations.delete(id)
    else pendingActivations.set(id, actionIds)
  }

  function onNotificationActivation(handler: (event: NotificationActivation) => void): () => void {
    if (disposed) return () => {}
    activationHandlers.add(handler)
    return () => activationHandlers.delete(handler)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    unsubscribeFromReplies?.()
    unsubscribeFromReplies = undefined
    pendingActivations.clear()
    activationHandlers.clear()
  }

  return {
    notify,
    onNotificationActivation,
    dispose,
    [Symbol.dispose]: dispose,
  }
}

const KITTY_URGENCY: Record<NotificationUrgency, 0 | 1 | 2> = {
  low: 0,
  normal: 1,
  critical: 2,
}

function legacyText(text: string, delimiterSafe = false): string {
  const withoutControls = Array.from(text, (character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character
  }).join("")
  const withoutDelimiters = delimiterSafe ? withoutControls.replaceAll(";", ",") : withoutControls
  return withoutDelimiters.replace(/\s+/g, " ").trim()
}

function encodeOsc9(request: NotificationRequest): string {
  return `${ESC}]9;${legacyText(request.body)}${BEL}`
}

function encodeOsc777(request: NotificationRequest): string {
  const title = legacyText(request.title ?? "", true)
  const body = legacyText(request.body, true)
  return `${ESC}]777;notify;${title};${body}${BEL}`
}

function kittyIdentifier(id: string | undefined): string | undefined {
  if (id === undefined) return undefined
  if (id === "0" || !/^[A-Za-z0-9_.+-]+$/.test(id)) {
    throw new TypeError(
      "OSC 99 notification ids may contain only A-Z, a-z, 0-9, _, -, +, and .; id 0 is reserved",
    )
  }
  return id
}

function validateActions(actions: readonly NotificationAction[]): void {
  const ids = new Set<string>()
  for (const action of actions) {
    if (action.id.length === 0) throw new TypeError("Notification action ids must not be empty")
    if (ids.has(action.id)) {
      throw new TypeError(`Notification action ids must be unique: ${action.id}`)
    }
    if (action.label.length === 0) {
      throw new TypeError(`Notification action labels must not be empty: ${action.id}`)
    }
    if (action.label.includes("\u2028")) {
      throw new TypeError(`Notification action labels must not contain U+2028: ${action.id}`)
    }
    ids.add(action.id)
  }
}

// Browser-safe base64 of the UTF-8 bytes: the canvas entry reaches this module through the input owner, and a
// node:buffer import there breaks the canvas-browser-boundary contract. btoa takes one char per byte.
const utf8Encoder = new TextEncoder()
function utf8Base64(text: string): string {
  let binary = ""
  for (const byte of utf8Encoder.encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function encodedChunks(text: string): readonly string[] {
  const encoded = utf8Base64(text)
  if (encoded.length === 0) return [""]
  const chunks: string[] = []
  for (let offset = 0; offset < encoded.length; offset += KITTY_ENCODED_CHUNK_SIZE) {
    chunks.push(encoded.slice(offset, offset + KITTY_ENCODED_CHUNK_SIZE))
  }
  return chunks
}

function encodeKittyPayload(
  request: NotificationRequest,
  payload: "title" | "body" | "buttons",
  text: string,
  doneAfterPayload: boolean,
): string {
  const id = kittyIdentifier(request.id)
  const chunks = encodedChunks(text)
  if (chunks.length > 1 && id === undefined) {
    throw new TypeError("Chunked OSC 99 notifications require a request id")
  }

  const reportActivation = request.reportActivation === true || (request.actions?.length ?? 0) > 0

  return chunks
    .map((chunk, index) => {
      const done = doneAfterPayload && index === chunks.length - 1
      const metadata = [
        id === undefined ? undefined : `i=${id}`,
        reportActivation ? "a=report" : undefined,
        `d=${done ? 1 : 0}`,
        "e=1",
        `p=${payload}`,
        request.urgency === undefined ? undefined : `u=${KITTY_URGENCY[request.urgency]}`,
      ]
        .filter((part): part is string => part !== undefined)
        .join(":")
      return `${ESC}]99;${metadata};${chunk}${ST}`
    })
    .join("")
}

function encodeOsc99(request: NotificationRequest): string {
  const title =
    request.title === undefined ? "" : encodeKittyPayload(request, "title", request.title, false)
  const buttons =
    request.actions === undefined || request.actions.length === 0
      ? ""
      : encodeKittyPayload(
          request,
          "buttons",
          request.actions.map((action) => action.label).join("\u2028"),
          false,
        )
  return title + buttons + encodeKittyPayload(request, "body", request.body, true)
}

/** Parse one OSC 99 reply envelope without leaking terminal button indexes to callers. */
export function parseNotificationReplyEnvelope(input: string): NotificationReplyEnvelope | null {
  const prefix = `${ESC}]99;`
  const start = input.indexOf(prefix)
  if (start < 0) return null
  const terminator = input.indexOf(ST, start + prefix.length)
  if (terminator < 0) return { status: "incomplete", start }

  const end = terminator + ST.length
  const content = input.slice(start + prefix.length, terminator)
  const match = /^i=([A-Za-z0-9_.+-]+);([1-9][0-9]*)?$/.exec(content)
  const id = match?.[1]
  const button = match?.[2]
  return {
    status: "complete",
    start,
    end,
    activation:
      id === undefined
        ? null
        : {
            id,
            ...(button === undefined ? {} : { button: Number(button) }),
          },
  }
}
