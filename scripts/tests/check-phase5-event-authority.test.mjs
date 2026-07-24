import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..")
const checker = path.join(repoRoot, "scripts/check-phase5-event-authority.mjs")

const validManifest = `
defineModule({
  events: [{
    id: "@acme/example#event.changed",
    eventType: "example.changed",
    version: "1.0.0",
    payloadSchema: { type: "object" },
    visibility: "external",
    audit: { sourceModule: "example", category: "domain" },
  }],
  webhooks: [{
    id: "@acme/example#webhook.changed",
    direction: "outbound",
    eventId: "@acme/example#event.changed",
  }],
})
`

async function runFixture(source) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-phase5-events-"))
  const file = path.join(root, "packages/example/src/voyant.ts")
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, source)
  return execFileAsync(process.execPath, [checker, "--root", root])
}

async function runMultiPackageFixture(sources) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-phase5-events-"))
  for (const [name, source] of Object.entries(sources)) {
    const file = path.join(root, `packages/${name}/src/voyant.ts`)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, source)
  }
  return execFileAsync(process.execPath, [checker, "--root", root])
}

describe("Phase 5 event authority checker", () => {
  it("pins the package-owned Quotes proposal feedback event contract", async () => {
    const manifest = await readFile(path.join(repoRoot, "packages/quotes/src/voyant.ts"), "utf8")
    const runtime = await readFile(path.join(repoRoot, "packages/quotes/src/runtime.ts"), "utf8")
    const contract = manifest.match(
      /\{\s*id: "@voyant-travel\/quotes#event\.proposal-feedback-requested",[\s\S]*?\n\s{4}\},/,
    )?.[0]
    const emittedPayload = runtime.match(
      /"quote\.proposal_feedback\.requested",\s*\{([\s\S]*?)\n\s{10}\},\s*\{ category:/,
    )?.[1]

    assert.ok(contract, "Quotes must own the proposal feedback event declaration")
    assert.ok(emittedPayload, "Quotes must emit the declared proposal feedback event")
    assert.match(contract, /eventType: "quote\.proposal_feedback\.requested"/)
    assert.match(contract, /version: "1\.0\.0"/)
    assert.match(
      contract,
      /required: \["quoteId", "quoteVersionId", "activityId", "message", "proposalUrl"\]/,
    )
    const properties = ["quoteId", "quoteVersionId", "activityId", "message", "proposalUrl"]
    assert.deepEqual(
      [...emittedPayload.matchAll(/^\s+(\w+):/gm)].map((match) => match[1]),
      properties,
    )
    for (const property of properties) assert.match(contract, new RegExp(`${property}: \\{`))
    assert.match(contract, /message: \{ type: "string", minLength: 1, maxLength: 4000 \}/)
    assert.match(contract, /additionalProperties: false/)
    assert.match(contract, /visibility: "internal"/)
    assert.match(contract, /audit: \{ sourceModule: "quotes", category: "domain" \}/)
  })

  it("accepts an external versioned event with schema and audit metadata", async () => {
    const result = await runFixture(validManifest)
    assert.match(result.stdout, /Phase 5 event authority: OK/)
  })

  it("rejects name-only outbound event eligibility", async () => {
    const invalid = validManifest
      .replace('version: "1.0.0",', "")
      .replace('visibility: "external",', "")
      .replace('payloadSchema: { type: "object" },', "")
      .replace('audit: { sourceModule: "example", category: "domain" },', "")
    await assert.rejects(runFixture(invalid), (error) => {
      assert.match(error.stderr, /must declare visibility/)
      assert.match(error.stderr, /must declare a semantic version/)
      assert.match(error.stderr, /must declare payloadSchema/)
      assert.match(error.stderr, /must declare audit sourceModule and category/)
      return true
    })
  })

  it("rejects an outbound reference without a package-owned event", async () => {
    const invalid = validManifest.replace(
      /events:\s*\[[\s\S]*?\],\n {2}webhooks:/,
      "events: [],\n  webhooks:",
    )
    await assert.rejects(runFixture(invalid), /must reference an event declared/)
  })

  it("rejects name-only internal event declarations", async () => {
    const invalid = validManifest
      .replace('direction: "outbound",', 'direction: "inbound",')
      .replace('version: "1.0.0",', "")
      .replace('visibility: "external",', "")
      .replace('payloadSchema: { type: "object" },', "")
      .replace('audit: { sourceModule: "example", category: "domain" },', "")
    await assert.rejects(runFixture(invalid), /event .* must declare a semantic version/)
  })

  it("rejects emitters without package-owned contracts", async () => {
    const invalid = `${validManifest}\neventBus.emit("example.undeclared", {})\n`
    await assert.rejects(runFixture(invalid), /emitter publishes undeclared event type/)
  })

  it("rejects duplicate event type authorities", async () => {
    await assert.rejects(
      runMultiPackageFixture({
        first: validManifest,
        second: validManifest
          .replaceAll("@acme/example", "@acme/other")
          .replace('sourceModule: "example"', 'sourceModule: "other"'),
      }),
      /event type "example.changed" has duplicate package authorities/,
    )
  })

  it("accepts multiple event versions from one package authority", async () => {
    const multiVersion = validManifest.replace(
      "  }],\n  webhooks:",
      `  }, {
    id: "@acme/example#event.changed-v2",
    eventType: "example.changed",
    version: "2.0.0",
    payloadSchema: { type: "object" },
    visibility: "external",
    audit: { sourceModule: "example", category: "domain" },
  }],
  webhooks:`,
    )
    const result = await runFixture(multiVersion)
    assert.match(result.stdout, /Phase 5 event authority: OK/)
  })

  it("rejects a new persistence mutation package without a declared event emission", async () => {
    const invalid = `${validManifest}\nasync function save(db) { await db.insert(records).values({}) }\n`
    await assert.rejects(runFixture(invalid), /persistence mutations but emits no declared event/)
  })

  it("accepts persistence mutations covered by a declared event emission", async () => {
    const covered = `${validManifest}\nasync function save(db, eventBus) {\n  await db.insert(records).values({})\n  await eventBus.emit("example.changed", {})\n}\n`
    const result = await runFixture(covered)
    assert.match(result.stdout, /1\/1 mutation packages covered/)
  })

  it("accepts persistence mutations covered by a durable outbox append", async () => {
    const covered = `${validManifest}
const EXAMPLE_CHANGED = "example.changed"
async function save(db) {
  await db.insert(records).values({})
  await insertOutboxEvents(db, [{ name: EXAMPLE_CHANGED, data: {} }])
}
`
    const result = await runFixture(covered)
    assert.match(result.stdout, /1\/1 mutation packages covered/)
    assert.match(result.stdout, /1 emitted types/)
  })

  it("rejects durable outbox appends without package-owned contracts", async () => {
    const invalid = `${validManifest}
async function save(db) {
  await db.insert(records).values({})
  await insertOutboxEvents(db, [{ name: "example.undeclared", data: {} }])
}
`
    await assert.rejects(runFixture(invalid), /emitter publishes undeclared event type/)
  })

  it("does not mistake nested outbox payload names for event types", async () => {
    const covered = `${validManifest}
async function save(db) {
  await db.insert(records).values({})
  await insertOutboxEvents(db, [{
    name: "example.changed",
    data: { name: "customer.display-name" },
  }])
}
`
    const result = await runFixture(covered)
    assert.match(result.stdout, /1 emitted types/)
    assert.doesNotMatch(result.stdout, /customer\.display-name/)
  })

  it("does not let a nested payload name cover a dynamic outbox event", async () => {
    const invalid = `${validManifest}
async function save(db) {
  await db.insert(records).values({})
  await insertOutboxEvents(db, [{
    name: resolveEventName(),
    data: { name: "example.changed" },
  }])
}
`
    await assert.rejects(runFixture(invalid), /persistence mutations but emits no declared event/)
  })

  it("reports runtime subscriptions without manifest owners", async () => {
    const result = await runFixture(
      `${validManifest}\neventBus.subscribe("example.changed", handler)\n`,
    )
    assert.match(result.stdout, /1 unowned runtime subscription types/)
    assert.match(result.stdout, /Unowned runtime subscriptions: example.changed/)
  })
})
