/**
 * DevToolsShowcase — tailspin-inspired log viewer
 *
 * Filterable log viewer with live search, scroll, level coloring,
 * highlighted quoted strings, and underlined paths.
 *
 * Uses TextInput for the search box (Silvery Way principle #1).
 */

import React, { useState } from "react"
import { Box, Text, useInput } from "@silvery/term/xterm/index.ts"
import { TextInput } from "@silvery/ui/components/TextInput"
import { KeyHints } from "./shared.js"

// --- Types ---

interface LogEntry {
  time: string
  level: "INFO" | "WARN" | "ERROR" | "DEBUG"
  message: string
}

// --- Data ---

const ALL_LOGS: LogEntry[] = [
  { time: "14:23:01", level: "INFO", message: "Server started on port 3000" },
  { time: "14:23:02", level: "INFO", message: 'Database connection to "primary" established' },
  { time: "14:23:05", level: "DEBUG", message: "Loading config from /etc/app/config.toml" },
  { time: "14:23:08", level: "WARN", message: "Cache miss ratio above threshold (42%)" },
  {
    time: "14:23:12",
    level: "ERROR",
    message: "Failed to connect to Redis: ECONNREFUSED at /var/run/redis.sock",
  },
  { time: "14:23:15", level: "INFO", message: 'Retry succeeded: Redis "default" connected' },
  { time: "14:23:18", level: "INFO", message: "Worker pool initialized (4 threads)" },
  { time: "14:23:22", level: "WARN", message: 'Deprecated API "v1" endpoint called by client' },
  { time: "14:23:25", level: "DEBUG", message: "GC pause: 12ms (minor collection)" },
  { time: "14:23:30", level: "ERROR", message: "Timeout: /api/analytics took 5200ms" },
  { time: "14:23:33", level: "INFO", message: "Health check: all services green" },
  { time: "14:23:38", level: "INFO", message: 'Request processed: 200 OK (23ms) for "/api/users"' },
]

const levelColors: Record<string, string> = {
  INFO: "#a6e3a1",
  WARN: "#f9e2af",
  ERROR: "#f38ba8",
  DEBUG: "#89b4fa",
}

const levelBg: Record<string, string> = {
  ERROR: "#302020",
  WARN: "#302a1a",
}

// --- LogMessage component ---

/** Render message with colored quoted strings and underlined paths */
function LogMessage({ text, query }: { text: string; query: string }): JSX.Element {
  // Split on quoted strings and paths
  const parts: JSX.Element[] = []
  const regex = /(\"(?:[^\"\\]|\\.)*\")|(\/([\w./-]+))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`t${lastIndex}`} color="#cdd6f4">
          {text.slice(lastIndex, match.index)}
        </Text>,
      )
    }
    if (match[1]) {
      // Quoted string — green
      parts.push(
        <Text key={`q${match.index}`} color="#a6e3a1">
          {match[1]}
        </Text>,
      )
    } else if (match[2]) {
      // Path — underline
      parts.push(
        <Text key={`p${match.index}`} color="#94e2d5" underline>
          {match[2]}
        </Text>,
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`e${lastIndex}`} color="#cdd6f4">
        {text.slice(lastIndex)}
      </Text>,
    )
  }

  // If there's an active query, we wrap matching segments with inverse
  if (query) {
    // Simple approach: highlight in the plain text segments
    const highlighted: JSX.Element[] = []
    for (const part of parts) {
      const props = part.props as { color?: string; underline?: boolean; children: string }
      const content = props.children
      if (typeof content !== "string") {
        highlighted.push(part)
        continue
      }
      const lc = content.toLowerCase()
      const qi = lc.indexOf(query)
      if (qi === -1) {
        highlighted.push(part)
      } else {
        const key = part.key as string
        highlighted.push(
          <Text key={key}>
            <Text color={props.color}>{content.slice(0, qi)}</Text>
            <Text inverse color="#f9e2af">
              {content.slice(qi, qi + query.length)}
            </Text>
            <Text color={props.color}>{content.slice(qi + query.length)}</Text>
          </Text>,
        )
      }
    }
    return <Text wrap="truncate">{highlighted}</Text>
  }

  return <Text wrap="truncate">{parts}</Text>
}

// --- Main component ---

export function DevToolsShowcase(): JSX.Element {
  const [typedQuery, setTypedQuery] = useState("")
  const [scrollOffset, setScrollOffset] = useState(0)

  // Scroll navigation and escape-to-clear (TextInput handles text editing)
  useInput((_input, key) => {
    if (key.escape) {
      setTypedQuery("")
      setScrollOffset(0)
    }
    if (key.upArrow) setScrollOffset((o) => Math.max(0, o - 1))
    if (key.downArrow) setScrollOffset((o) => o + 1)
  })

  const handleQueryChange = (newQuery: string) => {
    setTypedQuery(newQuery)
    setScrollOffset(0)
  }

  const query = typedQuery.toLowerCase()
  const filtered = query
    ? ALL_LOGS.filter(
        (l) => l.message.toLowerCase().includes(query) || l.level.toLowerCase().includes(query),
      )
    : ALL_LOGS

  const maxVisible = 10
  const maxOffset = Math.max(0, filtered.length - maxVisible)
  const clampedOffset = Math.min(scrollOffset, maxOffset)
  const visibleLogs = filtered.slice(clampedOffset, clampedOffset + maxVisible)

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text>
          <Text bold color="#cdd6f4">
            Log Viewer
          </Text>
          <Text color="#6c7086">
            {" "}
            {"\u2014"} {filtered.length} entries
          </Text>
        </Text>
      </Box>

      {/* Search box — TextInput handles readline shortcuts */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={typedQuery ? "#f9e2af" : "#45475a"}
        paddingX={1}
        marginBottom={1}
      >
        <TextInput
          value={typedQuery}
          onChange={handleQueryChange}
          prompt="/ "
          promptColor="#89dceb"
          color="#cdd6f4"
          placeholder="type to filter..."
        />
      </Box>

      {/* Log entries */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleLogs.map((log, i) => (
          <Box
            key={clampedOffset + i}
            flexDirection="row"
            gap={1}
            backgroundColor={levelBg[log.level]}
          >
            <Text color="#94e2d5">{log.time}</Text>
            <Box width={7} backgroundColor={levelBg[log.level]}>
              <Text bold color={levelColors[log.level]}>
                {log.level.padEnd(5)}
              </Text>
            </Box>
            <LogMessage text={log.message} query={query} />
          </Box>
        ))}
      </Box>

      <KeyHints hints={"type to filter  Esc clear  \u2191\u2193 scroll  Ctrl+A/E begin/end"} />
    </Box>
  )
}
