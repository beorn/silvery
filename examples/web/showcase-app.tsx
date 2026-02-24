/**
 * Showcase Demo Entry Point
 *
 * Renders inkx showcase components in xterm.js for embedding in VitePress docs.
 * Usage: showcase.html?demo=dashboard
 */

import React from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { renderToXterm } from "../../src/xterm/index.js"
import { SHOWCASES, emitInput } from "./showcases.js"

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

    const instance = renderToXterm(<ShowcaseComponent />, term)

    // Signal to parent (LiveDemo.vue) that the demo loaded successfully
    window.parent.postMessage({ type: "inkx-ready" }, "*")

    // Wire keyboard input to showcase components
    term.onData((data) => emitInput(data))

    // Re-fit and re-render on window resize
    window.addEventListener("resize", () => {
      fitAddon.fit()
      instance.refresh()
    })

    // Expose for debugging
    ;(window as any).inkxInstance = instance
    ;(window as any).xtermTerminal = term
  }
}
