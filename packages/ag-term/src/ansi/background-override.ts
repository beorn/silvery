/** SGR marker for an intentional ANSI background inside a styled container. */
export const BG_OVERRIDE_CODE = 9999

/** Mark ANSI-styled text as an intentional background override. */
export function bgOverride(text: string): string {
  return `\x1b[${BG_OVERRIDE_CODE}m${text}`
}
