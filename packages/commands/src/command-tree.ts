/**
 * Command tree domain model.
 *
 * This is the platform-neutral command shape shared by runtime command
 * dispatch, keybindings, tests, and future CLI / MCP projection. The current
 * flat registry remains supported; this model is the next surface.
 */

const commandNodeMarker = Symbol.for("@silvery/commands/command-node")

export interface ParseParamSchema<TParams> {
  parse(value: unknown): TParams
  missing?(value: unknown): string[]
}

export interface StandardParamSchema<TParams> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor?: string
    readonly validate: (
      value: unknown,
    ) => { readonly value: TParams } | { readonly issues: readonly { readonly message?: string }[] }
    readonly types?: { readonly output: TParams } | undefined
  }
  missing?(value: unknown): string[]
}

export type ParamSchema<TParams> = ParseParamSchema<TParams> | StandardParamSchema<TParams>

export interface CommandMetadata {
  effects?: "read" | "write" | "destructive"
  output?: "text" | "json" | "stream"
  idempotent?: boolean
  pagination?: { defaultLimit: number; maxLimit: number }
  asyncJob?: boolean
}

export type Availability = boolean | { available: boolean; reason?: string | undefined } | string

export interface CommandNode<TContext = unknown, TParams = void, TResult = unknown> {
  title: string
  description?: string | undefined
  params?: ParamSchema<TParams> | undefined
  isAvailable?: ((ctx: TContext) => Availability) | undefined
  run: (ctx: TContext, params: TParams) => TResult | Promise<TResult>
  metadata?: CommandMetadata | undefined
  readonly [commandNodeMarker]?: true
}

export type CommandTree<TContext = unknown> = {
  readonly [segment: string]: CommandNode<TContext, any, any> | CommandTree<TContext>
}

export interface FlattenedCommand<TContext = unknown> {
  id: string
  path: string[]
  command: CommandNode<TContext, any, any>
}

export type Invocation<TParams = unknown> =
  | { state: "ready"; params: TParams }
  | { state: "prompt"; missing: string[] }
  | { state: "unavailable"; reason?: string | undefined }
  | { state: "invalid"; error: unknown }
  | { state: "unknown" }

export function command<TContext = unknown, TParams = void, TResult = unknown>(
  node: Omit<CommandNode<TContext, TParams, TResult>, typeof commandNodeMarker>,
): CommandNode<TContext, TParams, TResult> {
  Object.defineProperty(node, commandNodeMarker, {
    value: true,
    enumerable: false,
  })
  return node as CommandNode<TContext, TParams, TResult>
}

export function defineCommands<TTree extends CommandTree<any>>(tree: TTree): TTree {
  return tree
}

export function isCommandNode(value: unknown): value is CommandNode<any, any, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly [commandNodeMarker]?: true })[commandNodeMarker] === true
  )
}

export function flattenCommandTree<TContext>(
  tree: CommandTree<TContext>,
): FlattenedCommand<TContext>[] {
  const out: FlattenedCommand<TContext>[] = []

  function walk(node: CommandTree<TContext>, path: string[]): void {
    for (const [segment, value] of Object.entries(node)) {
      const nextPath = [...path, segment]
      if (isCommandNode(value)) {
        out.push({
          id: nextPath.join("."),
          path: nextPath,
          command: value,
        })
        continue
      }
      walk(value as CommandTree<TContext>, nextPath)
    }
  }

  walk(tree, [])
  return out
}

export function resolveInvocation<TContext, TParams>(
  node: CommandNode<TContext, TParams, any> | undefined,
  ctx: TContext,
  partialParams?: unknown,
): Invocation<TParams> {
  if (!node) return { state: "unknown" }

  const availability = normalizeAvailability(node.isAvailable?.(ctx))
  if (availability && !availability.available) {
    return { state: "unavailable", reason: availability.reason }
  }

  if (!node.params) {
    return { state: "ready", params: undefined as TParams }
  }

  const missing = node.params.missing?.(partialParams ?? {})
  if (missing && missing.length > 0) {
    return { state: "prompt", missing }
  }

  try {
    return {
      state: "ready",
      params: parseParams(node.params, partialParams ?? {}),
    }
  } catch (error) {
    return { state: "invalid", error }
  }
}

function normalizeAvailability(
  availability: Availability | undefined,
): { available: boolean; reason?: string | undefined } | undefined {
  if (availability === undefined) return undefined
  if (typeof availability === "boolean") return { available: availability }
  if (typeof availability === "string") return { available: false, reason: availability }
  return availability
}

function parseParams<TParams>(schema: ParamSchema<TParams>, value: unknown): TParams {
  if ("parse" in schema) return schema.parse(value)

  const result = schema["~standard"].validate(value)
  if ("issues" in result) {
    const message = result.issues.map((issue) => issue.message ?? "invalid value").join(", ")
    throw new Error(message)
  }
  return result.value
}
