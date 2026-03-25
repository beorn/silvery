/**
 * @silvery/model — Optional DI model factories for silvery apps.
 *
 * A model is a factory that creates domain state. Models can declare
 * dependencies on other models or app capabilities.
 *
 * @example
 * ```ts
 * const todoModel = defineModel({
 *   name: "todo",
 *   create: () => ({
 *     items: [] as string[],
 *     add(text: string) { this.items.push(text) },
 *   }),
 * })
 * ```
 *
 * @packageDocumentation
 */

export interface ModelDef<T, TDeps extends Record<string, unknown> = Record<string, never>> {
  readonly name: string
  readonly deps?: (keyof TDeps)[]
  create(deps: TDeps): T
}

export function defineModel<T, TDeps extends Record<string, unknown> = Record<string, never>>(
  def: ModelDef<T, TDeps>,
): ModelDef<T, TDeps> {
  return def
}

export interface ModelRegistry {
  readonly models: Map<string, unknown>
  register<T>(def: ModelDef<T, any>, deps?: Record<string, unknown>): T
  get<T>(name: string): T | undefined
  has(name: string): boolean
}

export function createModelRegistry(): ModelRegistry {
  const models = new Map<string, unknown>()

  return {
    models,

    register<T>(def: ModelDef<T, any>, deps?: Record<string, unknown>): T {
      if (models.has(def.name)) {
        return models.get(def.name) as T
      }
      const instance = def.create(deps ?? ({} as any))
      models.set(def.name, instance)
      return instance
    },

    get<T>(name: string): T | undefined {
      return models.get(name) as T | undefined
    },

    has(name: string): boolean {
      return models.has(name)
    },
  }
}
