/**
 * Showcase Demo Entry Point
 *
 * Renders silvery showcase components in xterm.js for embedding in VitePress docs.
 * Usage: showcase.html?demo=dashboard
 */

import React from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { renderToXterm } from "@silvery/ag-term/xterm/index"
import { SHOWCASES } from "./showcases/index.js"

// Set theme at the earliest possible point — before any silvery rendering.
// Must use the same module path as the pipeline (render-helpers.ts imports from @silvery/theme/state)
// so the browser bundle resolves to the same module instance.
import { setActiveTheme } from "@silvery/theme/state"
import { catppuccinMocha } from "@silvery/theme/palettes"
import { deriveTheme } from "@silvery/theme"
setActiveTheme(deriveTheme(catppuccinMocha))

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

    // Forward mouse wheel events as arrow key presses.
    // xterm.js in iframes doesn't receive wheel events natively —
    // the browser scrolls the parent page instead.
    termContainer.addEventListener("wheel", (e) => {
      e.preventDefault()
      const lines = Math.max(1, Math.round(Math.abs(e.deltaY) / 40))
      const key = e.deltaY < 0 ? "\x1b[A" : "\x1b[B" // Up/Down arrow
      // Trigger xterm's onData (same path as keyboard input)
      const core = (term as any)._core
      if (core?._onData) {
        for (let i = 0; i < lines; i++) core._onData.fire(key)
      }
    }, { passive: false })

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
