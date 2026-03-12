/** Tool call in an exchange (Read, Edit, Bash, etc.). */
export interface ToolCall {
  tool: string
  args: string
  output: string[]
}

/** A single exchange in the conversation. */
export interface Exchange {
  id: number
  role: "user" | "agent" | "system"
  content: string
  thinking?: string
  toolCalls?: ToolCall[]
  tokens?: { input: number; output: number }
  frozen: boolean
}

/** Script entry — exchange data before id/frozen are assigned. */
export type ScriptEntry = Omit<Exchange, "id" | "frozen">
