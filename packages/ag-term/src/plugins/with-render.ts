/**
 * withRender(term) -- extends a Term with render pipeline capabilities.
 *
 * Creates term-scoped pipeline config (width measurer + output phase) from caps,
 * then returns an extended term with render() and renderStatic() methods.
 *
 * Usage:
 *   const term = withRender(createTerm())
 *   const { output, buffer } = term.render(root, 80, 24, null, { mode: "fullscreen" })
 *   const html = await term.renderStatic(<Report />)
 */

import type { Term } from "../ansi"
import type { ReactElement } from "react"
import type { TerminalBuffer } from "../buffer"
import { createPipeline, type MeasuredTerm } from "../measurer"
import type { PipelineConfig, ExecuteRenderOptions } from "../pipeline"
import { outputPhase } from "../pipeline/output-phase"
import { createAg } from "../ag"
import { runWithMeasurer } from "../unicode"
import type { AgNode } from "@silvery/create/types"

/**
 * Extended Term with render pipeline capabilities.
 *
 * Extends MeasuredTerm (Term + Measurer methods) with render/renderStatic.
 */
export interface RenderTerm extends MeasuredTerm {
  /** Pipeline configuration (measurer + output phase) */
  readonly pipelineConfig: PipelineConfig
  /**
   * Run the full render pipeline.
   */
  render(
    root: AgNode,
    width: number,
    height: number,
    prevBuffer: TerminalBuffer | null,
    options?: ExecuteRenderOptions | "fullscreen" | "inline",
  ): { output: string; buffer: TerminalBuffer }
  /**
   * Render a React element to a string using this terminal's caps.
   * Uses the term's width measurer for correct text measurement.
   */
  renderStatic(
    element: ReactElement,
    options?: { width?: number; height?: number; plain?: boolean },
  ): Promise<string>
}

/**
 * Extend a Term with render pipeline capabilities.
 *
 * Creates a pipeline config (width measurer + output phase) from the term's caps,
 * and adds render() and renderStatic() methods plus measurer methods.
 *
 * @param term - A Term instance (from createTerm)
 * @returns Extended term with render and measurement capabilities
 */
export function withRender(term: Term): RenderTerm {
  const pipelineConfig = createPipeline({ caps: term.caps })
  const { measurer } = pipelineConfig

  function renderPipeline(
    root: AgNode,
    width: number,
    height: number,
    prevBuffer: TerminalBuffer | null,
    options?: ExecuteRenderOptions | "fullscreen" | "inline",
  ): { output: string; buffer: TerminalBuffer } {
    const opts: ExecuteRenderOptions =
      typeof options === "string" ? { mode: options } : (options ?? {})
    const {
      mode = "fullscreen",
      skipLayoutNotifications = false,
      skipScrollStateUpdates = false,
      scrollbackOffset = 0,
      termRows,
      cursorPos,
    } = opts

    const doRender = () => {
      const ag = createAg(root, { measurer })
      ag.layout({ cols: width, rows: height }, { skipLayoutNotifications, skipScrollStateUpdates })
      const { buffer, overlay } = ag.render({ prevBuffer })

      const outputFn = pipelineConfig.outputPhaseFn ?? outputPhase
      let output = outputFn(prevBuffer, buffer, mode, scrollbackOffset, termRows, cursorPos)
      // Append Kitty emoji-scrim overlay when backdrop-fade produced one.
      if (overlay) output += overlay

      return { output, buffer }
    }

    return measurer ? runWithMeasurer(measurer, doRender) : doRender()
  }

  async function renderStaticFn(
    element: ReactElement,
    options?: { width?: number; height?: number; plain?: boolean },
  ): Promise<string> {
    const { renderString } = await import("@silvery/ag-react/render-string")
    return renderString(element, { ...options, pipelineConfig })
  }

  // Return a proxy that extends the original term with measurer methods and render capabilities
  return Object.create(term, {
    // Measurer methods (from pipeline config)
    textEmojiWide: { get: () => measurer.textEmojiWide, enumerable: true },
    textSizingEnabled: { get: () => measurer.textSizingEnabled, enumerable: true },
    displayWidth: { value: measurer.displayWidth.bind(measurer), enumerable: true },
    displayWidthAnsi: { value: measurer.displayWidthAnsi.bind(measurer), enumerable: true },
    graphemeWidth: { value: measurer.graphemeWidth.bind(measurer), enumerable: true },
    wrapText: { value: measurer.wrapText.bind(measurer), enumerable: true },
    sliceByWidth: { value: measurer.sliceByWidth.bind(measurer), enumerable: true },
    sliceByWidthFromEnd: { value: measurer.sliceByWidthFromEnd.bind(measurer), enumerable: true },
    // Pipeline config and render methods
    pipelineConfig: { value: pipelineConfig, enumerable: true },
    render: { value: renderPipeline, enumerable: true },
    renderStatic: { value: renderStaticFn, enumerable: true },
  }) as RenderTerm
}
