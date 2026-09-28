/** #15111: browser grammar oracle, deliberately outside the default Vitest gate. */
import { parseLength, LengthError } from "flexily"
import { chromium } from "playwright"

// Matches the declared frame browser in the CODE flake; never download a substitute.
const expectedVersion = "149.0.7827.55"
const properties = [
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "flex-basis",
]
const controls = [
  ["calc(10ch + 5%)", true],
  ["min(10ch, 50%)", true],
  ["max(1ch, 10cqi)", true],
  ["clamp(1ch, 50%, 20ch)", true],
  ["calc((10ch + 2ch)*2/3)", true],
  ["calc(2lh + 10%)", true],
  ["calc(100%-2ch)", false],
  ["calc(100%+2ch)", false],
  ["max(50%, 2)", false],
  ["calc(2)", false],
  ["calc(2ch*3ch)", false],
  ["min(1ch,)", false],
] as const

const corpus = new Set<string>(controls.map(([input]) => input))
for (const unit of ["ch", "lh", "%", "cqi"]) {
  for (const number of ["0", "1", "2.5", "1e1"]) {
    const leaf = `${number}${unit}`
    for (const input of [leaf, leaf.toUpperCase(), `calc(${leaf})`, `calc((${leaf})*2/3)`])
      corpus.add(input)
    for (const otherUnit of ["ch", "lh", "%", "cqi"]) {
      const other = `2${otherUnit}`
      for (const input of [
        `min(${leaf}, ${other})`,
        `MAX(${leaf}, ${other})`,
        `clamp(${leaf}, ${other}, 10${unit})`,
        `calc(${leaf} + ${other})`,
        `calc(${leaf} - ${other})`,
        `min(max(${leaf}, ${other}), calc(10${unit} / 2))`,
        `calc((${leaf} + ${other}) * 2 - 1${unit})`,
      ])
        corpus.add(input)
    }
  }
}

const accepted: string[] = []
const rejected: Array<{ input: string; reason: string }> = []
for (const input of corpus) {
  try {
    parseLength(input, { ch: 3, lh: 5 })
    accepted.push(input)
  } catch (error) {
    if (!(error instanceof LengthError)) throw error
    rejected.push({ input, reason: error.message })
  }
}
if (accepted.length < 400) {
  throw new Error(
    `CSS length oracle: expected generated accepted corpus; got ${accepted.length} of ${corpus.size}`,
  )
}

const browser = await chromium.launch({ headless: true }).catch((cause: unknown) => {
  throw new Error(
    `CSS length oracle: Chromium ${expectedVersion} is required; Playwright browser path is ${process.env.PLAYWRIGHT_BROWSERS_PATH ?? "its default cache"}. Use the declared CODE flake browser environment.`,
    { cause },
  )
})
try {
  const version = browser.version()
  if (version !== expectedVersion) {
    throw new Error(
      `CSS length oracle: Chromium version ${version}; required declared version ${expectedVersion}`,
    )
  }
  const page = await browser.newPage()
  const results = await page.evaluate(
    ({ accepted, controls, properties }) => ({
      accepted: properties.flatMap((property) =>
        accepted.map((input) => ({ property, input, actual: CSS.supports(property, input) })),
      ),
      controls: properties.flatMap((property) =>
        controls.map(([input, expected]) => ({
          property,
          input,
          expected,
          actual: CSS.supports(property, input),
        })),
      ),
    }),
    { accepted, controls, properties },
  )
  const failures = [
    ...results.accepted.filter((row) => !row.actual),
    ...results.controls.filter((row) => row.actual !== row.expected),
  ]
  process.stdout.write(
    JSON.stringify({
      version,
      corpusSize: corpus.size,
      acceptedInputs: accepted.length,
      rejected,
      grammarChecks: results.accepted.length,
      controlChecks: results.controls.length,
      failures,
    }) + "\n",
  )
  if (failures.length) {
    throw new Error(
      `CSS length oracle: ${failures.length} grammar mismatches; exact property/input rows are in the JSON receipt`,
    )
  }
} finally {
  await browser.close()
}
