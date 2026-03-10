/**
 * Showcase Demo Entry Point
 *
 * Renders silvery showcase components in xterm.js for embedding in VitePress docs.
 * Usage: showcase.html?demo=dashboard
 */

import React from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { renderToXterm } from "@silvery/term/xterm/index.ts"
import { SHOWCASES, emitInput, emitMouse, setTermFocused } from "./showcases/index.js"

// Read demo name from URL params
const params = new URLSearchParams(window.location.search)
const demoName = params.get("demo") || "dashboard"

// Get the showcase component
const ShowcaseComponent = SHOWCASES[demoName]

if (!ShowcaseComponent) {
  document.body.innerHTML = `<p style="color: red; padding: 20px;">Unknown demo: ${demoName}. Available: ${Object.keys(SHOWCASES).join(", ")}</p>`
} else {
  // Set up xterm.js terminal
  const termContainer = document.getElementById("terminal") as HTMLElement
  if (termContainer) {
    const term = new Terminal({
      cursorBlink: false,
      convertEol: true,
      cols: 80,
      rows: 24,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
      fontSize: 14,
      theme: {
        background: "#1a1a2e",
        foreground: "#eee",
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termContainer)
    fitAddon.fit()

    const instance = renderToXterm(<ShowcaseComponent />, term, {
      input: {
        onKey: (data) => emitInput(data),
        onMouse: ({ x, y, button }) => emitMouse(x, y, button),
        onFocus: (focused) => setTermFocused(focused),
      },
    })

    // Signal to parent (LiveDemo.vue) that the demo loaded successfully
    window.parent.postMessage({ type: "silvery-ready" }, "*")

    // Click anywhere on the terminal container to ensure focus
    // (browsers restrict auto-focus in iframes, so click-to-focus is essential)
    termContainer.addEventListener("click", () => term.focus())

    // Auto-focus terminal so keyboard input works immediately
    term.focus()

    // Re-fit and re-render on window resize
    // Must use resize() (not refresh()) — clears the old buffer so the
    // next render does a full repaint at the new dimensions.
    window.addEventListener("resize", () => {
      fitAddon.fit()
      instance.resize(term.cols, term.rows)
    })

    // Clean up when parent frame navigates away (VitePress SPA navigation)
    window.addEventListener("message", (event) => {
      if (event.data?.type === "silvery-cleanup") {
        instance.unmount()
        term.dispose()
      }
    })

    // Also clean up if the iframe is being unloaded (e.g., src removed)
    window.addEventListener("pagehide", () => {
      instance.unmount()
      term.dispose()
    })

    // Expose for debugging
    ;(window as any).silveryInstance = instance
    ;(window as any).xtermTerminal = term
  }
}
