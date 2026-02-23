#!/usr/bin/env bun
/**
 * Bundle size measurement for inkx entry points.
 *
 * Builds each export entry point with `Bun.build({ minify, target: "bun" })`
 * and reports raw + gzipped sizes in a markdown table.
 *
 * Usage:
 *   bun vendor/beorn-inkx/scripts/measure-bundle.ts
 *   bun vendor/beorn-inkx/scripts/measure-bundle.ts --json   # JSON output
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")

// Entry points derived from package.json exports map.
// Key = public import path, value = source file relative to ROOT.
const ENTRY_POINTS: Record<string, string> = {
	"inkx": "src/index.ts",
	"inkx/ink": "src/ink.ts",
	"inkx/layout": "src/layout.ts",
	"inkx/components": "src/components.ts",
	"inkx/focus": "src/focus.ts",
	"inkx/input": "src/input.ts",
	"inkx/theme": "src/theme.ts",
	"inkx/animation": "src/animation.ts",
	"inkx/images": "src/images.ts",
	"inkx/plugins": "src/plugins.ts",
	"inkx/testing": "src/testing/index.tsx",
	"inkx/runtime": "src/runtime/index.ts",
	"inkx/canvas": "src/canvas/index.ts",
	"inkx/dom": "src/dom/index.ts",
	"inkx/scroll-utils": "src/scroll-utils.ts",
	"inkx/toolbelt": "src/toolbelt/index.ts",
	"inkx/core": "src/core/index.ts",
	"inkx/store": "src/store/index.ts",
	"inkx/react": "src/react/index.ts",
}

// Peer / optional deps that consumers provide — excluded from the bundle.
const EXTERNALS = [
	"react",
	"react-reconciler",
	"react-devtools-core",
	"@beorn/flexx",
	"yoga-wasm-web",
	"chalkx",
	"zustand",
	"shiki",
	"graphemer",
	"slice-ansi",
	"string-width",
	"playwright",
	"playwright-core",
]

interface Measurement {
	name: string
	rawBytes: number
	gzipBytes: number
}

async function gzipSize(data: Uint8Array): Promise<number> {
	const cs = new CompressionStream("gzip")
	const writer = cs.writable.getWriter()
	writer.write(data)
	writer.close()

	let total = 0
	const reader = cs.readable.getReader()
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		total += value.byteLength
	}
	return total
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	const kb = bytes / 1024
	return `${kb.toFixed(1)} KB`
}

async function measureEntry(
	name: string,
	srcFile: string,
	tmpDir: string,
): Promise<Measurement> {
	const entrypoint = join(ROOT, srcFile)
	const outdir = join(tmpDir, name.replace(/\//g, "_"))

	const result = await Bun.build({
		entrypoints: [entrypoint],
		minify: true,
		target: "bun",
		external: EXTERNALS,
		outdir,
	})

	if (!result.success) {
		const errors = result.logs.map((l) => String(l)).join("; ")
		throw new Error(errors || "unknown build error")
	}

	// Sum all output artifacts (usually one file).
	let totalRaw = 0
	const chunks: Uint8Array[] = []

	for (const artifact of result.outputs) {
		const buf = await artifact.arrayBuffer()
		const arr = new Uint8Array(buf)
		totalRaw += arr.byteLength
		chunks.push(arr)
	}

	// Concatenate for gzip measurement.
	const combined = new Uint8Array(totalRaw)
	let offset = 0
	for (const c of chunks) {
		combined.set(c, offset)
		offset += c.byteLength
	}

	const gz = await gzipSize(combined)

	return { name, rawBytes: totalRaw, gzipBytes: gz }
}

async function main() {
	const jsonMode = process.argv.includes("--json")
	const tmpDir = await mkdtemp(join(tmpdir(), "inkx-bundle-"))

	try {
		const measurements: Measurement[] = []

		for (const [name, src] of Object.entries(ENTRY_POINTS)) {
			try {
				const m = await measureEntry(name, src, tmpDir)
				measurements.push(m)
			} catch (err) {
				console.error(`  SKIP ${name}: ${(err as Error).message}`)
				measurements.push({ name, rawBytes: 0, gzipBytes: 0 })
			}
		}

		if (jsonMode) {
			console.log(JSON.stringify(measurements, null, 2))
			return
		}

		// Markdown table output.
		const lines: string[] = [
			"## inkx Bundle Sizes",
			"",
			`Externals: ${EXTERNALS.join(", ")}`,
			"",
			"| Entry Point | Raw (minified) | Gzipped |",
			"| --- | ---: | ---: |",
		]

		for (const m of measurements) {
			if (m.rawBytes === 0) {
				lines.push(`| \`${m.name}\` | _build failed_ | - |`)
			} else {
				lines.push(
					`| \`${m.name}\` | ${formatBytes(m.rawBytes)} | ${formatBytes(m.gzipBytes)} |`,
				)
			}
		}

		// Summary row for the full bundle.
		const full = measurements.find((m) => m.name === "inkx")
		const ink = measurements.find((m) => m.name === "inkx/ink")
		if (full && ink && full.rawBytes > 0 && ink.rawBytes > 0) {
			const savings = (
				((full.gzipBytes - ink.gzipBytes) / full.gzipBytes) *
				100
			).toFixed(0)
			lines.push("")
			lines.push(
				`**Tree-shaking savings**: \`inkx/ink\` is ${savings}% smaller than full \`inkx\` (gzipped).`,
			)
		}

		lines.push("")
		lines.push(
			`_Measured with Bun.build, minify=true, target=bun. ${new Date().toISOString().slice(0, 10)}_`,
		)

		console.log(lines.join("\n"))
	} finally {
		await rm(tmpDir, { recursive: true, force: true })
	}
}

await main()
