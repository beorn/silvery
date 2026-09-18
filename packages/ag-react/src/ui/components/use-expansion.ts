import { useCallback, useState } from "react"

/** Shared controlled/uncontrolled state for the package's disclosure controls. */
export function useExpansion(
  expanded: boolean | undefined,
  defaultExpanded: boolean,
  onExpandedChange: ((expanded: boolean) => void) | undefined,
) {
  const [internal, setInternal] = useState(defaultExpanded)
  const isExpanded = expanded ?? internal
  const setExpanded = useCallback(
    (next: boolean) => {
      if (expanded === undefined) setInternal(next)
      onExpandedChange?.(next)
    },
    [expanded, onExpandedChange],
  )
  return [isExpanded, setExpanded] as const
}
