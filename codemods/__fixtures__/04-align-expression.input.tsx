// @ts-nocheck
/**
 * Fixture 04 — align={expr} dynamic → runtime ternary, with codemod TODO.
 * The exact shape of the silvercode AutoLane call site at Content.tsx:631
 * BEFORE manual cleanup. In real use, hand-rewrite this site to avoid the
 * double-evaluation of the expression (see TODO[autofit-codemod] note in
 * the codemod's emitted ternary).
 */
import React from "react"
import { AutoFit, Box } from "silvery"

type Ctx = { align: "start" | "center" | "stretch" }

export function ConditionalAlign({
  ctx,
  lanes,
  children,
}: {
  ctx: Ctx
  lanes: number[]
  children: React.ReactNode
}): React.ReactElement {
  return (
    <AutoFit lanes={lanes} align={ctx.align === "center" ? "center" : "start"}>
      {children}
    </AutoFit>
  )
}
