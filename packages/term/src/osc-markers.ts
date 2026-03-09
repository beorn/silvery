/**
 * OSC 133 Semantic Prompt Markers
 *
 * Shell integration protocol that marks prompts and commands in terminal output.
 * Terminals like iTerm2, Kitty, and WezTerm use these markers to provide
 * "jump to previous/next prompt" navigation (Cmd+Up/Cmd+Down in iTerm2).
 *
 * Protocol: OSC 133
 * - Prompt start:         ESC ] 133 ; A BEL     (before user input)
 * - Prompt end:           ESC ] 133 ; B BEL     (after user input, before command output)
 * - Command output start: ESC ] 133 ; C BEL     (before command output)
 * - Command output end:   ESC ] 133 ; D ; N BEL (after command output, N = exit code)
 *
 * For a chat-style app, each "exchange" (user prompt + assistant response) maps to:
 * - 133;A before the user's message
 * - 133;B after the user's message
 * - 133;C before the assistant's response
 * - 133;D;0 after the assistant's response
 *
 * Supported by: iTerm2, Kitty, WezTerm, foot, Ghostty
 */

export const OSC133 = {
  /** Mark prompt start (before user input) */
  promptStart: "\x1b]133;A\x07",
  /** Mark prompt end (after user input, before command output) */
  promptEnd: "\x1b]133;B\x07",
  /** Mark command output start */
  commandStart: "\x1b]133;C\x07",
  /** Mark command output end (exit code defaults to 0 = success) */
  commandEnd: (exitCode?: number) => `\x1b]133;D;${exitCode ?? 0}\x07`,
} as const
