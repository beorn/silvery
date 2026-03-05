/**
 * Input components for TUI apps
 *
 * @example
 * ```tsx
 * import { TextInput, Select } from "@hightea/ui/input";
 *
 * // Text input
 * <TextInput value={name} onChange={setName} placeholder="Enter name" />
 *
 * // Selection list
 * <Select
 *   options={[
 *     { label: "Option A", value: "a" },
 *     { label: "Option B", value: "b" },
 *   ]}
 *   value={selected}
 *   onChange={setSelected}
 * />
 * ```
 */

export { TextInput, useTextInput } from "./TextInput.js"
export { Select, useSelect } from "./Select.js"
export type { TextInputProps, TextInputOptions, SelectProps, SelectOption } from "../types.js"
