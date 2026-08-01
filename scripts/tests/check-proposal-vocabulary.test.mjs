import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

const checker = resolve("scripts/check-proposal-vocabulary.mjs")

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "voyant-proposal-vocabulary-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function write(root, path, source) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, source)
}

function run(root) {
  return execFileSync("node", [checker, "--root", root], { encoding: "utf8" })
}

function failure(root) {
  try {
    run(root)
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`
  }
  assert.fail("expected vocabulary checker to fail")
}

test("allows Booking Platform pricing quote vocabulary in approved contexts", (t) => {
  const root = fixture(t)
  write(
    root,
    "packages/catalog/src/booking-engine/quote.ts",
    "const quoteId = 'cquo_1'; const quotedAt = new Date(); const table = 'catalog_quotes';\n",
  )
  write(root, "packages/commerce/src/markets/schema.ts", "const quoteCurrency = 'EUR'\n")
  write(
    root,
    "packages/core/src/links.ts",
    "function quoteIdent(identifier) { return identifier }\n",
  )
  write(root, "docs/architecture/catalog-booking-engine.md", "request-for-quote uses quoteEntity\n")
  assert.match(run(root), /OK proposal vocabulary/)
})

test("rejects bespoke Quote Version names and tables", (t) => {
  const root = fixture(t)
  write(
    root,
    "packages/proposals/src/legacy.ts",
    "export type QuoteVersion = { id: string }; const table = 'quote_versions'\n",
  )
  const output = failure(root)
  assert.match(output, /QuoteVersion/)
  assert.match(output, /quote_versions/)
})

test("rejects removed packages and bespoke admin routes", (t) => {
  const root = fixture(t)
  write(
    root,
    "packages/operator-standard/src/routes.ts",
    "import '@voyant-travel/quotes'; const path = '/v1/admin/quotes'\n",
  )
  const output = failure(root)
  assert.match(output, /@voyant-travel\/quotes/)
  assert.match(output, /\/v1\/admin\/quotes/)
})

test("rejects relationship entity quote outside pricing contexts", (t) => {
  const root = fixture(t)
  write(
    root,
    "packages/relationships/src/schema.ts",
    'export const entityTypes = ["organization", "person", "quote", "activity"]\n',
  )
  assert.match(failure(root), /quote/)
})

test("rejects active bespoke quote residues from proposal migration", (t) => {
  const root = fixture(t)
  write(
    root,
    "examples/operator-demo/scripts/seed.ts",
    "import { bookingQuoteDetails } from '@voyant-travel/proposals/booking-extension'; const QUOTE_SEEDS = []\n",
  )
  write(
    root,
    "packages/i18n/src/admin/crm-operator.ts",
    "export const messages = { quoteOpen: 'Open', quoteWon: 'Won', quoteLost: 'Lost', quoteArchived: 'Archived' }\n",
  )
  write(root, "starters/operator/scripts/seed-demo.mjs", 'console.log("\\nquote:")\n')
  write(
    root,
    "packages/admin-host/src/admin-presentation.ts",
    'export const defaultAdminHostNavMessages = { quotes: "Quotes" }\n',
  )
  write(
    root,
    "packages/operator-settings/src/service.ts",
    "// contract variables, quotes proposal, commerce checkout tax\n",
  )
  write(
    root,
    "packages/commerce/src/accepted-proposal-version-reservation-golden-flow.test.ts",
    "interface QuoteState { id: string }\n",
  )
  write(
    root,
    "scripts/check-operator-booking-finance-runtime-authority.mjs",
    "const quotesContributor = await read('packages/proposals/src/runtime-contributor.ts')\n",
  )
  write(root, "packages/mcp/src/guide.ts", "function quotesSection() { return '' }\n")
  write(
    root,
    "packages/framework/src/operator-distribution.test.ts",
    '"@voyant-travel/realtime/quotes-invalidation-extension"\n',
  )
  write(
    root,
    "packages/core/src/events.ts",
    "// Examples: `booking.created`, `quote.accepted`, `payment.received`.\n",
  )
  const output = failure(root)
  assert.match(output, /bookingQuoteDetails/)
  assert.match(output, /QUOTE_SEEDS/)
  assert.match(output, /quoteOpen/)
  assert.match(output, /QuoteState/)
  assert.match(output, /quotesContributor/)
  assert.match(output, /quotesSection/)
  assert.match(output, /quotes-invalidation-extension/)
  assert.match(output, /quotes: \\"Quotes\\"/)
  assert.match(output, /quote\.accepted/)
})
