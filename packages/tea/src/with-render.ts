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

import type { Term } from "@silvery/term/ansi"
import type { ReactElement } from "react"
import type { TerminalBuffer } from "@silvery/term/buffer"
import { createPipeline, type MeasuredTerm } from "@silvery/term/measurer"
import {
  executeRender,
  type ExecuteRenderOptions,
  type PipelineConfig,
} from "@silvery/term/pipeline"
import type { TeaNode } from "./types"

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
    root: TeaNode,
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
    root: TeaNode,
    width: number,
    height: number,
    prevBuffer: TerminalBuffer | null,
    options?: ExecuteRenderOptions | "fullscreen" | "inline",
  ): { output: string; buffer: TerminalBuffer } {
    return executeRender(root, width, height, prevBuffer, options, pipelineConfig)
  }

  async function renderStaticFn(
    element: ReactElement,
    options?: { width?: number; height?: number; plain?: boolean },
  ): Promise<string> {
    const { renderString } = await import("@silvery/react/render-string")
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
