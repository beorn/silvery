// Enhanced Commander
export { Command, type HelpSectionPosition, type HelpSectionContent } from "./command.ts"
export {
  colorizeHelp,
  shouldColorize,
  type ColorizeHelpOptions,
  type CommandLike,
} from "./colorize.ts"

// Re-export Commander's other classes
export { Option, Argument, CommanderError, InvalidArgumentError, Help } from "commander"
export type { OptionValues } from "commander"

// Built-in types and Standard Schema
export {
  int,
  uint,
  float,
  port,
  url,
  path,
  csv,
  json,
  bool,
  date,
  email,
  regex,
  intRange,
} from "./presets.ts"
export type { CLIType, StandardSchemaV1 } from "./presets.ts"

// Tree-shakeable: only evaluated if user imports z
export { z } from "./z.ts"
