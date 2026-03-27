// Enhanced Commander
export { Command } from "./command.ts"
export { colorizeHelp, shouldColorize, type ColorizeHelpOptions, type CommandLike } from "./colorize.ts"

// Re-export Commander's other classes
export { Option, Argument, CommanderError, InvalidArgumentError, Help } from "commander"
export type { OptionValues } from "commander"

// Presets and Standard Schema type
export { int, uint, float, port, url, path, csv, json, bool, date, email, regex, intRange, oneOf } from "./presets.ts"
export type { Preset, StandardSchemaV1 } from "./presets.ts"

// Tree-shakeable: only evaluated if user imports z
export { z } from "./z.ts"
