/**
 * Step node tree structure for declarative steps
 *
 * Parses the user's declarative object structure into an internal tree
 * that can be rendered and executed.
 */

/**
 * A single step in the tree
 */
export interface StepNode {
  /** Display label (auto-generated or custom) */
  label: string

  /** Object key from the declaration */
  key: string

  /** Work function (if leaf node) */
  work?: (...args: unknown[]) => unknown

  /** Child steps (if group node) */
  children?: StepNode[]

  /** Indentation level for display */
  indent: number
}

/**
 * What users can declare as a step value
 */
export type StepValue =
  | ((...args: unknown[]) => unknown) // Function (auto-named)
  | [string, (...args: unknown[]) => unknown] // [label, function]
  | StepsDef // Nested group

/**
 * The declarative structure users provide
 */
export type StepsDef = {
  [key: string]: StepValue
}

/**
 * Parse a declarative steps definition into a tree of StepNodes
 *
 * @param def - The declarative structure
 * @param indent - Current indentation level (internal)
 * @returns Array of StepNodes
 */
export function parseStepsDef(def: StepsDef, indent = 0): StepNode[] {
  const nodes: StepNode[] = []

  for (const [key, value] of Object.entries(def)) {
    if (typeof value === "function") {
      // Function: auto-generate label from key
      nodes.push({
        key,
        label: generateLabel(key),
        work: value,
        indent,
      })
    } else if (Array.isArray(value) && value.length === 2) {
      // Tuple: [label, function]
      const [label, work] = value as [string, (...args: unknown[]) => unknown]
      nodes.push({
        key,
        label,
        work,
        indent,
      })
    } else if (typeof value === "object" && value !== null) {
      // Nested group
      const children = parseStepsDef(value as StepsDef, indent + 1)
      nodes.push({
        key,
        label: generateLabel(key),
        children,
        indent,
      })
    }
  }

  return nodes
}

/**
 * Flatten the tree for sequential execution
 *
 * Returns nodes in depth-first order, with groups followed by their children.
 */
export function flattenStepNodes(nodes: StepNode[]): StepNode[] {
  const result: StepNode[] = []

  for (const node of nodes) {
    result.push(node)
    if (node.children) {
      result.push(...flattenStepNodes(node.children))
    }
  }

  return result
}

/**
 * Get only leaf nodes (nodes with work functions)
 */
export function getLeafNodes(nodes: StepNode[]): StepNode[] {
  const result: StepNode[] = []

  for (const node of nodes) {
    if (node.work) {
      result.push(node)
    }
    if (node.children) {
      result.push(...getLeafNodes(node.children))
    }
  }

  return result
}

/**
 * Generate a display label from a camelCase function name
 *
 * @example
 * generateLabel("loadModules") // "Load modules"
 * generateLabel("parseMarkdown") // "Parse markdown"
 * generateLabel("initBoardStateGenerator") // "Init board state generator"
 */
export function generateLabel(fnName: string): string {
  return fnName
    .replace(/([A-Z])/g, " $1") // Insert space before capitals
    .replace(/(\d+)/g, " $1") // Insert space before numbers
    .toLowerCase() // Convert all to lowercase
    .trim() // Remove leading/trailing spaces
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/^./, (s) => s.toUpperCase()) // Capitalize only first letter
}

/**
 * Check if a value is a StepsDef (nested group)
 */
export function isStepsDef(value: unknown): value is StepsDef {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof value !== "function"
}

/**
 * Check if a value is a tuple [label, function]
 */
export function isLabelTuple(value: unknown): value is [string, (...args: unknown[]) => unknown] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "function"
}
