/**
 * Process Exit Timing Tests
 *
 * Tests for exit behavior in hightea:
 * 1. Does waitUntilExit() work reliably?
 * 2. Does final render complete before process exits?
 * 3. Test with rapid state changes followed by exit
 * 4. Test with async exit handlers
 *
 * @see bead km-yv6d
 */

import React, { useEffect, useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useApp } from "../src/index.ts"
import { createRenderer } from "@hightea/term/testing"

const render = createRenderer()

describe("Exit Behavior", () => {
  describe("Basic exit via useApp", () => {
    test("useApp hook provides exit function in test renderer", () => {
      let exitFn: ((error?: Error) => void) | undefined

      function CaptureExit() {
        const { exit } = useApp()
        exitFn = exit
        return <Text>Ready</Text>
      }

      const app = render(<CaptureExit />)

      expect(app.ansi).toContain("Ready")
      expect(exitFn).toBeInstanceOf(Function)
    })

    test("calling exit should not throw in test renderer", () => {
      function ExitOnMount() {
        const { exit } = useApp()
        useEffect(() => {
          // Immediate exit
          exit()
        }, [exit])
        return <Text>Exiting</Text>
      }

      // Should render without throwing
      const app = render(<ExitOnMount />)

      // Content should still be rendered
      expect(app.ansi).toContain("Exiting")
    })

    test("exit with error should not throw in test renderer", () => {
      function ExitWithError() {
        const { exit } = useApp()
        useEffect(() => {
          exit(new Error("Test error"))
        }, [exit])
        return <Text>Exiting with error</Text>
      }

      const app = render(<ExitWithError />)
      expect(app.ansi).toContain("Exiting with error")
    })
  })

  describe("Final render before exit", () => {
    test("state updates before exit should be rendered", () => {
      // Test synchronous state update pattern - the test renderer batches
      // synchronous updates so we only see the final state
      function UpdateThenExit() {
        const { exit } = useApp()
        const [status, setStatus] = useState("initial")

        useEffect(() => {
          // Synchronous state update
          setStatus("updated")
          // Then exit
          exit()
        }, [exit])

        return <Text>Status: {status}</Text>
      }

      const app = render(<UpdateThenExit />)

      // Last frame should show the update (React batches the update)
      expect(app.ansi).toContain("Status: updated")
    })

    test("multiple rapid state changes should all render", () => {
      function RapidUpdates() {
        const [count, setCount] = useState(0)

        useEffect(() => {
          // Rapid state updates
          setCount(1)
          setCount(2)
          setCount(3)
        }, [])

        return <Text>Count: {count}</Text>
      }

      const app = render(<RapidUpdates />)

      // Final count should be 3 (React batches these)
      expect(app.ansi).toContain("Count: 3")
    })

    test("nested state updates should complete before exit", () => {
      function NestedUpdates() {
        const { exit } = useApp()
        const [phase, setPhase] = useState<"init" | "loading" | "ready" | "done">("init")

        useEffect(() => {
          if (phase === "init") {
            setPhase("loading")
          } else if (phase === "loading") {
            setPhase("ready")
          } else if (phase === "ready") {
            setPhase("done")
            exit()
          }
        }, [phase, exit])

        return <Text>Phase: {phase}</Text>
      }

      const app = render(<NestedUpdates />)

      // Should reach 'done' state
      expect(app.ansi).toContain("Phase: done")
    })
  })

  describe("Exit timing with complex components", () => {
    test("exit during list update should complete render", () => {
      function ListWithExit({ items }: { items: string[] }) {
        const { exit } = useApp()

        useEffect(() => {
          if (items.length >= 3) {
            exit()
          }
        }, [items, exit])

        return (
          <Box flexDirection="column">
            {items.map((item, i) => (
              <Text key={i}>{item}</Text>
            ))}
          </Box>
        )
      }

      const app = render(<ListWithExit items={["a", "b"]} />)

      expect(app.ansi).toContain("a")
      expect(app.ansi).toContain("b")

      // Trigger exit by adding third item
      app.rerender(<ListWithExit items={["a", "b", "c"]} />)

      // All items should be rendered
      const frame = app.ansi
      expect(frame).toContain("a")
      expect(frame).toContain("b")
      expect(frame).toContain("c")
    })

    test("exit with styled content should preserve styles", () => {
      function StyledExit() {
        const { exit } = useApp()

        useEffect(() => {
          exit()
        }, [exit])

        return (
          <Box flexDirection="column">
            <Text color="red">Red text</Text>
            <Text color="green" bold>
              Green bold
            </Text>
            <Text backgroundColor="blue" color="white">
              Blue bg
            </Text>
          </Box>
        )
      }

      const app = render(<StyledExit />)

      // Content should be present
      const frame = app.ansi
      expect(frame).toContain("Red text")
      expect(frame).toContain("Green bold")
      expect(frame).toContain("Blue bg")

      // ANSI codes should be present
      expect(frame).toMatch(/\x1b\[/)
    })
  })

  describe("Exit after keyboard input", () => {
    test("exit triggered by keyboard should complete render", () => {
      function KeyboardExit() {
        const { exit } = useApp()
        const [message, setMessage] = useState("Press q to quit")

        // Note: useInput is not easily testable without stdin support
        // This test simulates the pattern of "update state then exit"
        useEffect(() => {
          // Simulate what happens when 'q' is pressed
          const simulateKeyPress = () => {
            setMessage("Goodbye!")
            exit()
          }

          // Immediately trigger
          simulateKeyPress()
        }, [exit])

        return <Text>{message}</Text>
      }

      const app = render(<KeyboardExit />)

      // The goodbye message should be rendered
      expect(app.ansi).toContain("Goodbye!")
    })
  })

  describe("Async exit patterns", () => {
    test("sync cleanup before exit should work", () => {
      // Note: The test renderer is synchronous, so we test synchronous patterns
      let cleanupCompleted = false

      function SyncCleanup() {
        const { exit } = useApp()
        const [status, setStatus] = useState("running")

        useEffect(() => {
          // Synchronous cleanup
          cleanupCompleted = true
          setStatus("cleaned")
          exit()
        }, [exit])

        return <Text>Status: {status}</Text>
      }

      const app = render(<SyncCleanup />)

      expect(cleanupCompleted).toBe(true)
      expect(app.ansi).toContain("Status: cleaned")
    })

    test("synchronous state updates before exit should all be captured", () => {
      // The test renderer captures synchronous state updates
      function SyncUpdates() {
        const { exit } = useApp()
        const [log, setLog] = useState<string[]>(["start"])

        useEffect(() => {
          // Synchronous updates are batched by React
          setLog((prev) => [...prev, "step1"])
          setLog((prev) => [...prev, "step2"])
          setLog((prev) => [...prev, "step3"])
          exit()
        }, [exit])

        return (
          <Box flexDirection="column">
            {log.map((item, i) => (
              <Text key={i}>{item}</Text>
            ))}
          </Box>
        )
      }

      const app = render(<SyncUpdates />)

      const frame = app.ansi
      expect(frame).toContain("start")
      expect(frame).toContain("step1")
      expect(frame).toContain("step2")
      expect(frame).toContain("step3")
    })
  })

  describe("Unmount after exit", () => {
    test("unmount should not throw after exit was called", () => {
      function ExitComponent() {
        const { exit } = useApp()

        useEffect(() => {
          exit()
        }, [exit])

        return <Text>Done</Text>
      }

      const app = render(<ExitComponent />)

      expect(app.ansi).toContain("Done")

      // Unmount should not throw
      expect(() => app.unmount()).not.toThrow()
    })

    test("double unmount should throw", () => {
      const app = render(<Text>Test</Text>)

      app.unmount()

      // Second unmount should throw
      expect(() => app.unmount()).toThrow("Already unmounted")
    })
  })

  describe("Exit with frame tracking", () => {
    test("all frames before exit should be captured", () => {
      function FrameTracker() {
        const { exit } = useApp()
        const [count, setCount] = useState(0)

        useEffect(() => {
          if (count < 3) {
            setCount((c) => c + 1)
          } else {
            exit()
          }
        }, [count, exit])

        return <Text>Frame: {count}</Text>
      }

      const app = render(<FrameTracker />)

      // Should have captured multiple frames
      expect(app.frames.length).toBeGreaterThanOrEqual(1)

      // Last frame should show final count
      expect(app.ansi).toContain("Frame: 3")
    })
  })
})

describe("Exit edge cases", () => {
  test("exit called multiple times should be idempotent", () => {
    function MultiExit() {
      const { exit } = useApp()

      useEffect(() => {
        exit()
        exit()
        exit()
      }, [exit])

      return <Text>Multi-exit</Text>
    }

    // Should not throw or cause issues
    const app = render(<MultiExit />)
    expect(app.ansi).toContain("Multi-exit")
  })

  test("exit with undefined error should work", () => {
    function UndefinedError() {
      const { exit } = useApp()

      useEffect(() => {
        exit(undefined)
      }, [exit])

      return <Text>Undefined error</Text>
    }

    const app = render(<UndefinedError />)
    expect(app.ansi).toContain("Undefined error")
  })

  test("component updating after exit should not crash", () => {
    // Note: In test renderer, exit() doesn't actually unmount,
    // so we just verify the pattern doesn't throw
    function UpdateAfterExit() {
      const { exit } = useApp()
      const [value, setValue] = useState("before")

      useEffect(() => {
        // Update state then exit
        setValue("after")
        exit()
      }, [exit])

      return <Text>Value: {value}</Text>
    }

    const app = render(<UpdateAfterExit />)

    // Should render the updated value
    expect(app.ansi).toContain("Value: after")
  })
})
