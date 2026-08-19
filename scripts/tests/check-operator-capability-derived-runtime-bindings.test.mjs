import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..")
const checker = path.join(
  repoRoot,
  "scripts/check-operator-capability-derived-runtime-bindings.mjs",
)

async function write(root, relativePath, contents) {
  const target = path.join(root, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, contents)
}

async function fixture(deploymentResources) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-capability-runtime-bindings-"))
  await write(root, "packages/runtime/src/deployment-resources.ts", deploymentResources)
  await write(
    root,
    "packages/custom-fields/src/runtime-contributor.ts",
    "customFieldsRuntimePort.id\n",
  )
  await write(
    root,
    "packages/auth/src/runtime-contributor.ts",
    "host.primitives.config.read\ncloudAdminMembersConfigFromRevalidate\nauth.invitation\n",
  )
  await write(
    root,
    "packages/mice/src/runtime-contributor.ts",
    "host.getRuntimePort(relationshipsMiceRuntimePort)\nresolveDelegatePersonById\n",
  )
  await write(
    root,
    "packages/proposals/src/runtime-contributor.ts",
    "createProposalsRuntime(host)\n",
  )
  await write(
    root,
    "packages/relationships/src/runtime-contributor.ts",
    "customFieldValueReaderRuntimePort.id\nrelationshipsMiceRuntimePort.id\n",
  )
  await write(
    root,
    "packages/trips/src/runtime-contributor.ts",
    "host.primitives\nhost.getRuntimePort(catalogRuntimeServicesPort)\n",
  )
  return root
}

it("accepts package bindings derived from primitives and static ports", async () => {
  const root = await fixture("return options.createRuntimePorts({ primitives })\n")
  const result = await execFileAsync(process.execPath, [checker, "--root", root])
  assert.match(result.stdout, /6 package bindings derived from primitives and static ports/)
})

it("accepts provider-neutral graph ports as contributor inputs", async () => {
  const root = await fixture(`
    providerPorts?: VoyantGraphRuntimePorts
    return options.createRuntimePorts({
      primitives,
      ...(options.providerPorts ? { runtimePorts: options.providerPorts } : {}),
    })
  `)
  const result = await execFileAsync(process.execPath, [checker, "--root", root])
  assert.match(result.stdout, /6 package bindings derived from primitives and static ports/)
})

it("accepts Relationships-owned configuration unrelated to custom fields", async () => {
  const root = await fixture("return options.createRuntimePorts({ primitives })\n")
  await write(
    root,
    "packages/relationships/src/runtime-contributor.ts",
    'customFieldValueReaderRuntimePort.id\nrelationshipsMiceRuntimePort.id\nhost.primitives.config.read(bindings, "inquiryFirstResponseSla")\n',
  )
  const result = await execFileAsync(process.execPath, [checker, "--root", root])
  assert.match(result.stdout, /6 package bindings derived from primitives and static ports/)
})

it("rejects deployment-configured Relationships custom fields", async () => {
  const root = await fixture("return options.createRuntimePorts({ primitives })\n")
  await write(
    root,
    "packages/relationships/src/runtime-contributor.ts",
    'customFieldValueReaderRuntimePort.id\nrelationshipsMiceRuntimePort.id\nhost.primitives.config.read(bindings, "customFields")\n',
  )
  await assert.rejects(
    execFileAsync(process.execPath, [checker, "--root", root]),
    /must not restore deployment-configured custom fields/,
  )
})

it("rejects starter-side assembly of a migrated binding", async () => {
  const root = await fixture(
    "return options.createRuntimePorts({ primitives, mice: { resolveDelegatePersonById } })\n",
  )
  await assert.rejects(
    execFileAsync(process.execPath, [checker, "--root", root]),
    /must not assemble the mice binding/,
  )
})

it("rejects restored Proposals ownership of Trips route mutations", async () => {
  const root = await fixture("return options.createRuntimePorts({ primitives })\n")
  await write(
    root,
    "packages/proposals/src/runtime-contributor.ts",
    "host.getRuntimePort(tripsRoutesRuntimePort)\ncreateProposalsRuntime(host, trips)\n",
  )
  await assert.rejects(
    execFileAsync(process.execPath, [checker, "--root", root]),
    /proposals runtime contributor must not consume Trips route mutation authority/,
  )
})
