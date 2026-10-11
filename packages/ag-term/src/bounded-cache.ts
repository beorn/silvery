/**
 * Re-export of the one bounded-cache implementation, which lives in
 * @silvery/syntax (28632). ag-term already reaches syntax transitively through
 * @silvery/ag-react, so this direct re-export adds no new graph edge and no
 * cycle. The public "@silvery/ag-term/bounded-cache" subpath is preserved here,
 * so ag-term's internal callers, ink and ag-react are untouched.
 */
export * from "@silvery/syntax/bounded-cache"
