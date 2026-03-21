/**
 * Showcase Demo Entry Point
 *
 * Renders silvery showcase components in xterm.js for embedding in VitePress docs.
 * Usage: showcase.html?demo=dashboard
 */

import React from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { renderToXterm } from "@silvery/term/xterm/index"
import { SHOWCASES } from "./showcases/index.js"

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
      cursorBlink: true,
      convertEol: true,
      cols: 80,
      rows: 24,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
      fontSize: 14,
      theme: {
        // Catppuccin Mocha palette — matches @silvery/theme's catppuccinMocha
        background: "#1E1E2E",
        foreground: "#CDD6F4",
        cursor: "#CDD6F4",
        cursorAccent: "#1E1E2E",
        selectionBackground: "#6C7086",
        selectionForeground: "#CDD6F4",
        black: "#11111B",
        red: "#F38BA8",
        green: "#A6E3A1",
        yellow: "#F9E2AF",
        blue: "#89B4FA",
        magenta: "#CBA6F7",
        cyan: "#94E2D5",
        white: "#A6ADC8",
        brightBlack: "#313244",
        brightRed: "#FAB387",
        brightGreen: "#BEF0B7",
        brightYellow: "#FFF0CD",
        brightBlue: "#A7C9FF",
        brightMagenta: "#F5C2E7",
        brightCyan: "#AFF0E4",
        brightWhite: "#CDD6F4",
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termContainer)
    fitAddon.fit()

    const instance = renderToXterm(<ShowcaseComponent />, term, {
      input: true, // enables useInput, useMouse, useTerminalFocused
      handleFocusCycling: false, // showcases handle Tab/Escape themselves
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
