/**
 * @fakes @silvery/ag-term
 *
 * A {@link CascadeOutputs} built from the real `computeCascade` — the same
 * values the render pipeline derives — with a `Partial` overlay for the
 * deliberately wrong field a negative test needs (e.g. an oracle that lies
 * about `contentAreaAffected`). No cast: every member added to the contract
 * fails to compile here.
 */
import { computeCascade } from "../pipeline/cascade-predicates.ts"
import type { CascadeInputs, CascadeOutputs } from "../pipeline/cascade-predicates.ts"

export function createFakeCascadeOutputs(
  inputs: CascadeInputs,
  overrides: Partial<CascadeOutputs> = {},
): CascadeOutputs {
  return { ...computeCascade(inputs), ...overrides }
}
