import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const violations = []
const expected = {
  accommodations: ["program-room-block", "room-block-property", "room-block-supplier"],
  inventory: ["organization-product", "person-product"],
  legal: [
    "contract-booking",
    "contract-organization",
    "contract-person",
    "contract-supplier",
    "policy-acceptance-booking",
    "policy-product",
  ],
  mice: [
    "bid-supplier",
    "delegate-booking",
    "delegate-person",
    "organization-program",
    "program-space-block",
    "rooming-room-block",
    "session-function-space",
  ],
}

const starterLinks = path.join(root, "starters/operator/src/links")
if (existsSync(starterLinks)) {
  const copied = readdirSync(starterLinks).filter((file) => file.endsWith(".ts"))
  if (copied.length > 0) violations.push(`starter still owns links: ${copied.join(", ")}`)
}

for (const [owner, links] of Object.entries(expected)) {
  const manifest = readFileSync(path.join(root, `packages/${owner}/src/voyant.ts`), "utf8")
  const definitions = readFileSync(
    path.join(root, `packages/${owner}/src/standard-links.ts`),
    "utf8",
  )
  for (const link of links) {
    if (!manifest.includes(`#link.${link}"`)) {
      violations.push(`${owner} manifest does not own ${link}`)
    }
  }
  for (const match of manifest.matchAll(/#link\.([^"\s]+)"[^\n]+export: "([^"]+)"/g)) {
    if (!definitions.includes(`export const ${match[2]} = defineLink(`)) {
      violations.push(`${owner} manifest link ${match[1]} points at missing export ${match[2]}`)
    }
  }
}

const bom = readFileSync(path.join(root, "packages/operator-standard/src/index.ts"), "utf8")
const neutral = [
  ["legal", "contract-invoice"],
  ["mice", "proposal-program"],
]
for (const [owner, link] of neutral) {
  if (!bom.includes(`@voyant-travel/${owner}/standard-product-links`)) {
    violations.push(`standard BOM does not select neutral ${link} link extension`)
  }
  const manifest = readFileSync(path.join(root, `packages/${owner}/src/voyant.ts`), "utf8")
  if (!manifest.includes(`#link.${link}"`) || !manifest.includes('ownership: "standard-product"')) {
    violations.push(`${link} is not declared by its standard-product extension`)
  }
}

if (violations.length > 0) {
  console.error("Standard link authority violations:")
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log("check-standard-link-authority: OK (18 package-owned, 2 standard-product links)")
}
