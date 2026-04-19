/**
 * createAppContext<T>() — React context helper for domain-plugin app bridges.
 *
 * Every domain plugin that exposes a model to the React tree ends up writing
 * the same 15–20 lines of context boilerplate:
 *
 * ```tsx
 * const ChatContext = createContext<ChatModel | null>(null)
 * function ChatProvider({ chat, children }: { chat: ChatModel; children: ReactNode }) {
 *   return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>
 * }
 * function useChat() {
 *   const chat = useContext(ChatContext)
 *   if (!chat) throw new Error("useChat() called outside <ChatProvider>")
 *   return chat
 * }
 * ```
 *
 * `createAppContext<T>()` replaces this with a single call that returns
 * `{ AppContext, AppProvider, useApp }`. The provider takes `value={app}`;
 * `useApp()` throws with a clear message if used outside the provider.
 *
 * @example
 * ```tsx
 * // In the plugin or model file:
 * const { AppProvider: ChatProvider, useApp: useChat } =
 *   createAppContext<ChatModel>({ name: "Chat" })
 *
 * // Wiring:
 * withReact({ view: (app) => <ChatProvider value={app.chat}><ChatView /></ChatProvider> })
 *
 * // Inside a component:
 * const chat = useChat()
 * ```
 *
 * The optional `name` parameter sets the React DevTools `displayName` on
 * the context and provider, and makes the out-of-provider error messages
 * clearer (e.g. "useChat() called outside <ChatProvider>" → "<ChatProvider>"
 * is actually visible in the devtools tree).
 */

import React, { createContext, useContext, type ReactNode } from "react"

// =============================================================================
// Types
// =============================================================================

export interface CreateAppContextOptions {
  /**
   * Display name for React DevTools and error messages.
   * The provider renders as `<{name}Provider>` and the hook reports
   * "use{Name}() called outside <{Name}Provider>" when misused.
   * @default "App"
   */
  name?: string
}

export interface AppContextHelpers<T> {
  /** The underlying React.Context — useful if you need to pass it to another consumer. */
  AppContext: React.Context<T | null>
  /** Provider component — pass `value={yourApp}`. */
  AppProvider: ((props: { value: T; children: ReactNode }) => React.ReactElement) & {
    displayName?: string
  }
  /** Hook — returns the app from the nearest Provider, throws if used outside one. */
  useApp: () => T
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a typed React context + Provider + hook for exposing a domain
 * model (or any app-scoped value) to the React tree.
 *
 * @param options - Optional `{ name }` controls DevTools label + error messages.
 * @returns `{ AppContext, AppProvider, useApp }`.
 */
export function createAppContext<T>(options: CreateAppContextOptions = {}): AppContextHelpers<T> {
  const name = options.name ?? "App"
  const providerName = `${name}Provider`
  const hookName = `use${name}`

  const AppContext = createContext<T | null>(null)
  AppContext.displayName = `${name}Context`

  const AppProvider = ({ value, children }: { value: T; children: ReactNode }) =>
    React.createElement(AppContext.Provider, { value }, children)
  AppProvider.displayName = providerName

  const useApp = (): T => {
    const value = useContext(AppContext)
    if (value === null) {
      throw new Error(
        `${hookName}() called outside <${providerName}>. ` +
          `Wrap the component tree in <${providerName} value={...}>...</${providerName}>.`,
      )
    }
    return value
  }

  return { AppContext, AppProvider, useApp }
}
