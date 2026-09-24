import { readFileSync, writeFileSync } from "node:fs"

const path = new URL("../dist/bin/silvery.js", import.meta.url)
const output = readFileSync(path, "utf8")
const bunShebang = "#!/usr/bin/env bun\n"
if (!output.startsWith(bunShebang)) {
  throw new Error("Built silvery CLI is missing its expected Bun shebang")
}
writeFileSync(path, `#!/usr/bin/env node\n${output.slice(bunShebang.length)}`)
