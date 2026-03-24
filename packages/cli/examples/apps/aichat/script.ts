/**
 * Script data for the AI coding agent demo.
 *
 * Contains the realistic conversation script, random prompts for off-script
 * mode, and the stress test generator for performance testing.
 */

import type { ScriptEntry } from "./types.js"

// ============================================================================
// Constants
// ============================================================================

export const MODEL_NAME = "claude-opus-4-6"
export const INPUT_COST_PER_M = 15 // $/M input tokens
export const OUTPUT_COST_PER_M = 75 // $/M output tokens
export const CONTEXT_WINDOW = 200_000

export const TOOL_COLORS: Record<string, string> = {
  Read: "$info",
  Edit: "$warning",
  Bash: "$error",
  Write: "$accent",
  Glob: "$muted",
  Grep: "$success",
}

export const TOOL_ICONS: Record<string, string> = {
  Read: "📖",
  Edit: "✏️",
  Bash: "⚡",
  Write: "📝",
  Glob: "🔍",
  Grep: "🔎",
}

/** Random user commands for Tab-to-inject feature. */
export const RANDOM_USER_COMMANDS = [
  "Can you add unit tests for the auth module?",
  "Refactor the database queries to use prepared statements.",
  "Add TypeScript strict mode and fix any errors.",
  "Set up CI/CD with GitHub Actions.",
  "The search feature is slow — can you optimize it?",
  "Add dark mode support to the UI.",
  "We need input validation on the registration form.",
  "Create a migration script for the new schema.",
  "Add WebSocket support for real-time updates.",
  "The CSV export is broken — dates are wrong.",
]

/** Random agent responses for Tab-injected turns. */
export const RANDOM_AGENT_RESPONSES: ScriptEntry[] = [
  {
    role: "agent",
    thinking: "Let me analyze the codebase to understand the current structure.",
    content: "I'll look at the relevant files and make the changes.",
    toolCalls: [
      { tool: "Read", args: "src/index.ts", output: ["export function main() { /* ... */ }"] },
      { tool: "Edit", args: "src/index.ts", output: ["+  // Updated implementation"] },
    ],
    tokens: { input: 12400, output: 890 },
  },
  {
    role: "agent",
    content: "Done! I've made the changes and verified everything works.",
    tokens: { input: 15200, output: 340 },
  },
]

/** Regex matching https/http URLs in output text. */
export const URL_RE = /https?:\/\/[^\s)]+/g

// ============================================================================
// Script — Realistic coding agent story with thinking + tokens
// ============================================================================

export const SCRIPT: ScriptEntry[] = [
  {
    role: "user",
    content: "Fix the login bug in auth.ts — expired tokens throw instead of refreshing.",
    tokens: { input: 84, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "The user reports expired tokens throw instead of refreshing. This is likely in the token validation flow. I should read auth.ts to see the current expiry check logic. The bug is probably comparing jwt.exp (seconds) with Date.now() (milliseconds).",
    content: "Let me look at the auth module.",
    toolCalls: [
      {
        tool: "Read",
        args: "src/auth.ts",
        output: [
          "export async function login(token: string) {",
          "  const decoded = jwt.decode(token)",
          "  if (decoded.exp < Date.now()) {",
          '    throw new Error("Token expired")',
          "  }",
          "  return decoded.user",
          "}",
        ],
      },
    ],
    tokens: { input: 3694, output: 624 },
  },
  {
    role: "agent",
    thinking:
      "Found it — decoded.exp is in seconds (Unix timestamp) but Date.now() returns milliseconds. Every token appears expired because exp (e.g. 1700000000) is always less than Date.now() (e.g. 1700000000000). I need to divide Date.now() by 1000, and change the throw to a refresh call.",
    content: "Found it. The expiry check compares seconds (jwt.exp) to milliseconds (Date.now()). Fixing now.",
    toolCalls: [
      {
        tool: "Edit",
        args: "src/auth.ts",
        output: [
          "  const decoded = jwt.decode(token)",
          "- if (decoded.exp < Date.now()) {",
          '-   throw new Error("Token expired")',
          "+ if (decoded.exp < Date.now() / 1000) {",
          "+   return refreshToken(token)",
          "  }",
        ],
      },
    ],
    tokens: { input: 4312, output: 574 },
  },
  {
    role: "agent",
    content: "Running tests to verify the fix.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test src/auth.test.ts",
        output: [
          "auth.test.ts",
          "  ✓ login with valid token (2ms)",
          "  ✓ login with expired token refreshes (3ms)",
          "  ✓ login with invalid token rejects (1ms)",
          "",
          "3 passed | 0 failed",
        ],
      },
    ],
    tokens: { input: 4978, output: 312 },
  },
  {
    role: "agent",
    content:
      "Fixed! The bug was comparing jwt.exp (seconds since epoch) with Date.now() (milliseconds). Expired tokens now trigger a refresh instead of throwing.",
    tokens: { input: 5202, output: 178 },
  },
  {
    role: "user",
    content: "Nice. Can you also add rate limiting to the login endpoint?",
    tokens: { input: 116, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "The user wants rate limiting on login. I should check if there's existing rate limiting infrastructure before building from scratch. Let me search for rate-limit patterns in the codebase.",
    content: "I'll check what rate limiting infrastructure exists.",
    toolCalls: [
      {
        tool: "Grep",
        args: "rateLimit|rate-limit",
        output: [
          "src/middleware/rate-limit.ts",
          "src/config.ts",
          "See https://docs.example.com/api/rate-limiting for API docs",
        ],
      },
      {
        tool: "Read",
        args: "src/middleware/rate-limit.ts",
        output: [
          "import { RateLimiter } from '@lib/rate-limit'",
          "",
          "export function createLimiter(opts: { window: number; max: number }) {",
          "  return new RateLimiter(opts)",
          "}",
        ],
      },
    ],
    tokens: { input: 6490, output: 846 },
  },
  {
    role: "agent",
    thinking:
      "Good — there's already a RateLimiter abstraction. I just need to create an instance with appropriate settings (5 attempts per 60s window seems reasonable for login) and wire it into the auth route as middleware.",
    content: "Good, there's already a rate limiter. I'll wire it into the auth route.",
    toolCalls: [
      {
        tool: "Edit",
        args: "src/routes/auth.ts",
        output: [
          "+ import { createLimiter } from '../middleware/rate-limit'",
          "+",
          "+ const loginLimiter = createLimiter({ window: 60_000, max: 5 })",
          "+",
          "  router.post('/login', async (req, res) => {",
          "+   const limited = await loginLimiter.check(req.ip)",
          "+   if (limited) return res.status(429).json({ error: 'Too many attempts' })",
          "    const { token } = req.body",
        ],
      },
    ],
    tokens: { input: 7782, output: 756 },
  },
  {
    role: "agent",
    content: "Running the full test suite.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test",
        output: [
          "auth.test.ts ........... 3 passed",
          "rate-limit.test.ts ..... 5 passed",
          "routes/auth.test.ts .... 7 passed",
          "",
          "15 passed | 0 failed | 3 files",
        ],
      },
    ],
    tokens: { input: 8204, output: 334 },
  },
  {
    role: "agent",
    content: "Rate limiting added: 5 attempts per minute per IP on the login endpoint. All 15 tests pass.",
    tokens: { input: 8468, output: 156 },
  },
  {
    role: "user",
    content: "Now add i18n support for error messages. We need 日本語 (Japanese) and Deutsch (German). 🌍",
    tokens: { input: 146, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "i18n for error messages — I need to create translation JSON files for ja and de, then build a simple t() function that resolves message keys by locale. I'll also need to update the error responses in auth.ts to use t() with the request's locale.",
    content: "I'll create the translation files and update the error handling.",
    toolCalls: [
      {
        tool: "Write",
        args: "src/i18n/ja.json",
        output: [
          "{",
          '  "token_expired": "トークンの有効期限が切れました 🔧",',
          '  "rate_limited": "リクエストが多すぎます。後でもう一度お試しください",',
          '  "invalid_token": "無効なトークンです 🐛",',
          '  "login_success": "ログイン成功 ✅"',
          "}",
        ],
      },
      {
        tool: "Write",
        args: "src/i18n/de.json",
        output: [
          "{",
          '  "token_expired": "Token abgelaufen",',
          '  "rate_limited": "Zu viele Anfragen. Bitte versuchen Sie es später",',
          '  "invalid_token": "Ungültiges Token",',
          '  "login_success": "Anmeldung erfolgreich"',
          "}",
        ],
      },
    ],
    tokens: { input: 17868, output: 1134 },
  },
  {
    role: "agent",
    thinking:
      "Now I need the i18n loader module that imports the locale files and exports a t() function. The function should look up the key in the requested locale, falling back to English defaults. Then I'll wire it into the auth error responses.",
    content: "Now I'll create the i18n loader and wire it into the error responses.",
    toolCalls: [
      {
        tool: "Write",
        args: "src/i18n/index.ts",
        output: [
          "import ja from './ja.json'",
          "import de from './de.json'",
          "",
          "const locales = { ja, de, en: { /* defaults */ } }",
          "",
          "export function t(key: string, lang = 'en'): string {",
          "  return locales[lang]?.[key] ?? locales.en[key] ?? key",
          "}",
        ],
      },
      {
        tool: "Edit",
        args: "src/auth.ts",
        output: [
          "+ import { t } from './i18n'",
          "",
          "- return res.status(429).json({ error: 'Too many attempts' })",
          "+ return res.status(429).json({ error: t('rate_limited', req.lang) })",
        ],
      },
    ],
    tokens: { input: 19752, output: 890 },
  },
  {
    role: "agent",
    content: "Running tests with locale coverage.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test src/i18n/",
        output: [
          "i18n.test.ts",
          "  ✓ English fallback for unknown key",
          "  ✓ Japanese: トークンの有効期限が切れました 🔧",
          "  ✓ German: Token abgelaufen",
          "  ✓ Emoji preserved in translations 🐛✅",
          "",
          "4 passed | 0 failed",
        ],
      },
    ],
    tokens: { input: 20468, output: 356 },
  },
  {
    role: "agent",
    content:
      "i18n support added with Japanese (日本語) and German (Deutsch) translations. Error messages are now locale-aware. 🌍✅",
    tokens: { input: 20802, output: 134 },
  },
  {
    role: "user",
    content: "Add a health check endpoint at /health that returns the service version.",
    tokens: { input: 104, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "Simple task — read the version from package.json and expose it on GET /health alongside uptime. Quick implementation.",
    content: "Simple addition — reading package.json for the version, then adding the route.",
    toolCalls: [
      {
        tool: "Read",
        args: "package.json",
        output: ["{", '  "name": "auth-service",', '  "version": "2.4.1",', "  ...", "}"],
      },
      {
        tool: "Edit",
        args: "src/routes/health.ts",
        output: [
          "+ import { version } from '../../package.json'",
          "+",
          "+ router.get('/health', (req, res) => {",
          "+   res.json({ status: 'ok', version, uptime: process.uptime() })",
          "+ })",
        ],
      },
    ],
    tokens: { input: 21578, output: 468 },
  },
  {
    role: "agent",
    content: "Running final tests.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test",
        output: [
          "auth.test.ts ........... 3 passed",
          "rate-limit.test.ts ..... 5 passed",
          "routes/auth.test.ts .... 7 passed",
          "routes/health.test.ts .. 2 passed",
          "i18n.test.ts ........... 4 passed",
          "",
          "21 passed | 0 failed | 5 files",
        ],
      },
    ],
    tokens: { input: 22046, output: 290 },
  },
  {
    role: "agent",
    content:
      "All done! Summary of changes:\n• Fixed token expiry bug (seconds vs milliseconds)\n• Added rate limiting (5 req/min per IP)\n• Added i18n support (日本語 + Deutsch) 🌍\n• Added /health endpoint (v2.4.1)\n\nAll 21 tests pass. Ready to commit?",
    tokens: { input: 22468, output: 224 },
  },
]

// ============================================================================
// Stress test script — 200 programmatically generated exchanges
// ============================================================================

export function generateStressScript(): ScriptEntry[] {
  const exchanges: ScriptEntry[] = []
  const tools = ["Read", "Edit", "Bash", "Write", "Grep", "Glob"]
  const files = [
    "src/auth.ts",
    "src/db.ts",
    "src/routes/api.ts",
    "src/middleware/cors.ts",
    "src/utils/crypto.ts",
    "src/config.ts",
    "tests/integration.test.ts",
    "src/i18n/日本語.json",
  ]

  let cumulativeInput = 4000

  for (let i = 0; i < 200; i++) {
    if (i % 5 === 0) {
      const prompts = [
        `Fix bug #${100 + i} in ${files[i % files.length]}`,
        `Add feature: ${["caching", "logging", "retry", "batching", "バリデーション"][i % 5]}`,
        `Refactor ${files[i % files.length]} — it's too complex 🔧`,
        `Why is test #${i} failing? 🐛`,
        `Add 日本語 translations for module ${i}`,
      ]
      exchanges.push({
        role: "user",
        content: prompts[Math.floor(i / 5) % prompts.length]!,
        tokens: { input: 40 + (i % 30), output: 0 },
      })
    } else if (i % 5 === 4) {
      exchanges.push({
        role: "agent",
        content: `Done with batch ${Math.floor(i / 5) + 1}. ${3 + (i % 7)} tests pass. ✅`,
        tokens: { input: cumulativeInput, output: 45 + (i % 60) },
      })
    } else {
      const tool = tools[i % tools.length]!
      const file = files[i % files.length]!
      cumulativeInput += 200 + (i % 300)
      exchanges.push({
        role: "agent",
        thinking: i % 3 === 0 ? `Analyzing ${file} for the reported issue...` : undefined,
        content: `Working on ${file}...`,
        toolCalls: [
          {
            tool,
            args: tool === "Bash" ? `bun test ${file.replace("src/", "tests/")}` : file,
            output: [
              `// ${tool} output for ${file}`,
              `line ${i * 10 + 1}: processing...`,
              tool === "Edit" ? `- old code at line ${i}` : `  existing line ${i}`,
              tool === "Edit" ? `+ new code at line ${i}` : `  result: ok`,
              i % 10 === 0 ? `✓ テスト合格 🎉` : `✓ done`,
            ],
          },
        ],
        tokens: { input: cumulativeInput, output: 120 + (i % 200) },
      })
    }

    if (i === 80 || i === 160) {
      exchanges.push({
        role: "system",
        content: `📦 Compaction #${i === 80 ? 1 : 2}: context cleared. Scrollback preserved above.`,
      })
    }
  }

  return exchanges
}
