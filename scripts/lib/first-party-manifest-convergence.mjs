import path from "node:path"

import { isToolDeploymentRiskCompatible } from "../../packages/tools/src/risk.ts"

const PRIVILEGED_ACCESS_ACTIONS = new Set([
  "cancel",
  "delete",
  "publish",
  "refund",
  "relay",
  "send",
  "void",
])

export function standardSelectionsFromPolicy(source) {
  const start = source.indexOf("export const STANDARD_OPERATOR_DISTRIBUTION_POLICY")
  const end = source.indexOf("export const STANDARD_OPERATOR_PRODUCT_BOM", start)
  if (start < 0 || end < 0) throw new Error("standard Operator distribution policy not found")
  const policy = source.slice(start, end)
  const extensionsStart = policy.indexOf("extensions: [")
  if (extensionsStart < 0) throw new Error("standard Operator extension policy not found")
  return {
    modules: resolveSpecifiers(policy.slice(0, extensionsStart)),
    extensions: resolveSpecifiers(policy.slice(extensionsStart)),
  }
}

export function inspectFirstPartyManifestConvergence({
  graph,
  selections,
  workspacePackages,
  sources,
  toolRuntimeDefinitions = new Map(),
}) {
  const failures = []
  const expected = {
    module: new Map(selections.modules.map((specifier) => [graphId(specifier), specifier])),
    extension: new Map(selections.extensions.map((specifier) => [graphId(specifier), specifier])),
  }
  const actual = {
    module: new Map((graph.modules ?? []).map((unit) => [unit.id, unit])),
    extension: new Map((graph.extensions ?? []).map((unit) => [unit.id, unit])),
  }

  for (const kind of ["module", "extension"]) {
    for (const [id, specifier] of expected[kind]) {
      const unit = actual[kind].get(id)
      if (!unit) {
        failures.push(`standard ${kind} ${specifier} is missing from the resolved graph`)
        continue
      }
      const owner = packageName(specifier)
      if (unit.packageName !== owner) {
        failures.push(
          `${id}: expected package owner ${owner}, got ${unit.packageName ?? "<missing>"}`,
        )
      }
      inspectUnit(unit, kind, failures)
    }
    for (const id of actual[kind].keys()) {
      if (!expected[kind].has(id))
        failures.push(`resolved graph contains undeclared standard ${kind} ${id}`)
    }
  }
  if ((graph.plugins ?? []).length > 0) {
    failures.push("standard product graph must not reclassify first-party extensions as plugins")
  }

  const selectedPackageNames = new Set(
    [...selections.modules, ...selections.extensions].map(packageName),
  )
  for (const name of [...selectedPackageNames].sort()) {
    const pkg = workspacePackages.get(name)
    if (!pkg) {
      failures.push(`${name}: selected standard package is not a workspace package`)
      continue
    }
    inspectPackageEnvelope(name, pkg, expected, sources, failures)
    inspectRuntimeContributorAuthority(name, pkg, sources, failures)
  }

  const runtimeReferences = collectRuntimeReferences([
    ...(graph.modules ?? []),
    ...(graph.extensions ?? []),
    ...(graph.plugins ?? []),
    ...(graph.adapters ?? []),
    ...(graph.providers ?? []),
  ])
  for (const reference of runtimeReferences) {
    inspectRuntimeReference(reference, workspacePackages, failures)
  }

  inspectToolParity(graph, workspacePackages, sources, toolRuntimeDefinitions, failures)
  inspectCreatedTargetExecutorAuthority(sources, failures)
  inspectExecutableAccessAuthority(graph, failures)
  inspectWebhookParity(graph, failures)
  return failures.sort()
}

function inspectCreatedTargetExecutorAuthority(sources, failures) {
  for (const [sourcePath, source] of sources) {
    if (!/\bexecuteCreatedTargetCommand\b/.test(source)) continue
    if (
      sourcePath === "packages/action-ledger/src/created-command-internal.ts" ||
      sourcePath.startsWith("packages/action-ledger/tests/")
    ) {
      continue
    }
    failures.push(
      `${sourcePath}: raw created-target executor bypasses selected Tool admission authority`,
    )
  }
}

function inspectUnit(unit, kind, failures) {
  const executableFacets = [
    unit.runtime,
    ...(unit.api ?? []),
    ...(unit.schema ?? []),
    ...(unit.migrations ?? []),
    ...(unit.links ?? []),
    ...(unit.subscribers ?? []),
    ...(unit.events ?? []),
    ...(unit.resources ?? []),
    ...(unit.providers ?? []),
    ...(unit.tools ?? []),
    ...(unit.webhooks ?? []),
    ...(unit.actions ?? []),
    unit.access,
    unit.admin,
    ...(unit.presentations ?? []),
  ].filter(Boolean)
  if (executableFacets.length === 0)
    failures.push(`${unit.id}: selected ${kind} has no owned facets`)

  for (const api of unit.api ?? []) {
    if (!api.runtime) failures.push(`${unit.id}: API ${api.id} must own an executable runtime`)
  }
  for (const provider of unit.providers ?? []) {
    if (!nonEmpty(provider.selection?.role) || !nonEmpty(provider.selection?.value)) {
      failures.push(`${provider.id}: first-party provider must declare an explicit selection`)
    }
  }
  for (const link of unit.links ?? []) {
    if (link.kind !== "linkable" && link.kind !== "definition") {
      failures.push(`${link.id}: first-party link must declare its contribution kind`)
    }
    if (link.kind === "definition" && !nonEmpty(link.export)) {
      failures.push(`${link.id}: executable link definition must declare its named export`)
    }
  }
  for (const event of unit.events ?? []) {
    if (!isConcreteEventPayloadSchema(event.payloadSchema)) {
      failures.push(`${event.id}: first-party event must declare a concrete payload schema`)
    }
  }
  if (
    kind === "module" &&
    ((unit.schema?.length ?? 0) > 0 ||
      (unit.migrations?.length ?? 0) > 0 ||
      (unit.resources?.length ?? 0) > 0) &&
    !unit.lifecycle
  ) {
    failures.push(`${unit.id}: stateful modules must declare lifecycle semantics`)
  }
  if ((unit.schema?.length ?? 0) !== (unit.migrations?.length ?? 0)) {
    failures.push(`${unit.id}: schema and migration ownership must be declared together`)
  }
  inspectAccess(unit, failures)
}

function inspectAccess(unit, failures) {
  for (const resource of unit.access?.resources ?? []) {
    if (!nonEmpty(resource.label))
      failures.push(`${resource.id}: first-party access resource needs a label`)
    if (!nonEmpty(resource.description)) {
      failures.push(`${resource.id}: first-party access resource needs a description`)
    }
    for (const action of resource.actions ?? []) {
      const descriptor = typeof action === "string" ? undefined : action
      const name = typeof action === "string" ? action : action.action
      if (!descriptor || !nonEmpty(descriptor.label) || !nonEmpty(descriptor.description)) {
        failures.push(
          `${resource.id}:${name}: first-party access action needs label and description`,
        )
      }
      if (PRIVILEGED_ACCESS_ACTIONS.has(name) && descriptor?.sensitive !== true) {
        failures.push(
          `${resource.id}:${name}: privileged access action must declare sensitive: true`,
        )
      }
    }
  }
}

function inspectPackageEnvelope(name, pkg, expected, sources, failures) {
  if (
    pkg.manifest.voyant?.schemaVersion !== "voyant.package.v1" ||
    pkg.manifest.voyant?.kind !== "module" ||
    pkg.manifest.voyant?.manifest !== "./voyant"
  ) {
    failures.push(`${name}: package.json#voyant must select a voyant.package.v1 module manifest`)
  }
  const manifestTarget = exportTarget(pkg.manifest.exports?.["./voyant"])
  if (!manifestTarget) {
    failures.push(`${name}: package exports must expose ./voyant`)
    return
  }
  const manifestPath = path.posix.normalize(path.posix.join(pkg.directory, manifestTarget))
  const source = sources.get(manifestPath)
  if (source === undefined) {
    failures.push(`${name}: ./voyant export target ${manifestPath} does not exist`)
    return
  }
  for (const [kind, declarations] of Object.entries(expected)) {
    for (const [id, specifier] of declarations) {
      if (packageName(specifier) !== name) continue
      const helper = kind === "module" ? "defineModule" : "defineExtension"
      if (!source.includes(helper) || !source.includes(`"${id}"`)) {
        failures.push(`${name}: ${manifestPath} must declare selected ${kind} ${id} with ${helper}`)
      }
    }
  }
  inspectOwnerRelativeExport(name, pkg, pkg.manifest.voyant?.runtime?.entry, failures)
  inspectOwnerRelativeExport(name, pkg, pkg.manifest.voyant?.schema, failures)
}

function inspectRuntimeReference(reference, workspacePackages, failures) {
  if (!reference.entry.startsWith("@")) {
    failures.push(
      `${reference.location}: runtime entry ${reference.entry} must use a published package specifier`,
    )
    return
  }
  const owner = packageName(reference.entry)
  const pkg = workspacePackages.get(owner)
  if (!pkg) return
  const key = reference.entry === owner ? "." : `.${reference.entry.slice(owner.length)}`
  if (!exportTarget(pkg.manifest.exports?.[key])) {
    failures.push(`${reference.location}: runtime entry ${reference.entry} is not a package export`)
  }
}

function inspectRuntimeContributorAuthority(name, pkg, sources, failures) {
  const entry = pkg.manifest.voyant?.runtime?.entry
  if (!entry) return
  const target = exportTarget(pkg.manifest.exports?.[entry])
  const manifestTarget = exportTarget(pkg.manifest.exports?.["./voyant"])
  if (!target || !manifestTarget) return

  const contributorPath = path.posix.normalize(path.posix.join(pkg.directory, target))
  const manifestPath = path.posix.normalize(path.posix.join(pkg.directory, manifestTarget))
  const contributor = sources.get(contributorPath)
  const manifest = sources.get(manifestPath)
  if (!contributor || !manifest) return

  const outputs = new Set(
    [...contributor.matchAll(/\[([A-Za-z_$][\w$]*)\.id\]\s*:/g)].map((match) => match[1]),
  )
  const provided = providedPortSymbols(manifest)
  for (const output of outputs) {
    if (!provided.has(output)) {
      failures.push(
        `${name}: runtime contributor output ${output}.id is absent from provides.ports`,
      )
    }
  }
}

function providedPortSymbols(source) {
  const symbols = new Set()
  let cursor = 0
  while (cursor < source.length) {
    const match = /provides\s*:\s*\{/.exec(source.slice(cursor))
    if (!match) break
    const start = cursor + match.index + match[0].length
    const end = matchingDelimiter(source, start - 1, "{", "}")
    if (end < 0) break
    const block = source.slice(start, end)
    const ports = /ports\s*:\s*\[/.exec(block)
    if (ports) {
      const arrayStart = start + ports.index + ports[0].length - 1
      const arrayEnd = matchingDelimiter(source, arrayStart, "[", "]")
      if (arrayEnd >= 0) {
        const values = source.slice(arrayStart + 1, arrayEnd)
        for (const symbol of values.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
          if (symbol[1] !== "providePort") symbols.add(symbol[1])
        }
      }
    }
    cursor = end + 1
  }
  return symbols
}

function matchingDelimiter(source, start, open, close) {
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1
    if (source[index] === close) depth -= 1
    if (depth === 0) return index
  }
  return -1
}

function inspectOwnerRelativeExport(name, pkg, entry, failures) {
  if (!entry) return
  const key = entry === "." ? "." : entry
  if (!exportTarget(pkg.manifest.exports?.[key])) {
    failures.push(`${name}: package metadata entry ${entry} is not exported`)
  }
}

function graphUnits(graph) {
  return [
    ...(graph.modules ?? []),
    ...(graph.extensions ?? []),
    ...(graph.plugins ?? []),
    ...(graph.adapters ?? []),
    ...(graph.providers ?? []),
  ]
}

function inspectToolParity(graph, workspacePackages, sources, toolRuntimeDefinitions, failures) {
  const units = graphUnits(graph)
  const contributedContext = new Set(
    [...toolRuntimeDefinitions.values()].flatMap(
      (runtime) => runtime?.contextContribution?.context ?? [],
    ),
  )
  const declared = new Set(
    units.flatMap((unit) =>
      (unit.tools ?? []).map((tool) => `${tool.runtime.entry}#${tool.runtime.export ?? "default"}`),
    ),
  )
  const defined = new Set()
  for (const [name, pkg] of workspacePackages) {
    const toolsPath = path.posix.join(pkg.directory, "src/tools.ts")
    const source = sources.get(toolsPath)
    if (!source) continue
    for (const match of source.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*defineTool/g)) {
      defined.add(`${name}/tools#${match[1]}`)
    }
  }
  for (const tool of defined)
    if (!declared.has(tool))
      failures.push(`${tool}: defineTool export is absent from the selected manifest`)
  for (const tool of declared)
    if (!defined.has(tool))
      failures.push(`${tool}: manifest tool does not reference a defineTool export`)

  for (const unit of units) {
    const actionTools = new Set((unit.actions ?? []).flatMap((action) => action.from?.tools ?? []))
    for (const tool of unit.tools ?? []) {
      if (!nonEmpty(tool.risk))
        failures.push(`${tool.id}: first-party tool must declare an explicit risk`)
      if (tool.risk !== "low" && !actionTools.has(tool.id)) {
        failures.push(`${tool.id}: ${tool.risk}-risk tool must bind to a graph action`)
      }
      const runtimeKey = `${tool.runtime.entry}#${tool.runtime.export ?? "default"}`
      const runtime = toolRuntimeDefinitions.get(runtimeKey)
      const definition = runtime?.definition ?? runtime
      if (!runtime) {
        failures.push(`${tool.id}: Tool runtime definition ${runtimeKey} was not loaded`)
      } else if (runtime.error) {
        failures.push(
          `${tool.id}: Tool runtime definition ${runtimeKey} failed to load: ${runtime.error}`,
        )
      } else if (!nonEmpty(definition.tier)) {
        failures.push(`${tool.id}: Tool runtime definition ${runtimeKey} must declare a tier`)
      } else {
        if (definition.name !== tool.name) {
          failures.push(
            `${tool.id}: graph name ${tool.name} does not match Tool name ${definition.name ?? "<missing>"} (${runtimeKey})`,
          )
        }
        if (definition.capabilityId && definition.capabilityId !== tool.id) {
          failures.push(
            `${tool.id}: graph capability id does not match Tool capability id ${definition.capabilityId} (${runtimeKey})`,
          )
        }
        if (definition.owner && definition.owner !== unit.id) {
          failures.push(
            `${tool.id}: graph unit owner ${unit.id} does not match Tool owner ${definition.owner} (${runtimeKey})`,
          )
        }
        if (!sameStringSet(definition.requiredScopes, tool.requiredScopes)) {
          failures.push(
            `${tool.id}: graph scopes [${(tool.requiredScopes ?? []).join(", ")}] do not match Tool scopes [${(definition.requiredScopes ?? []).join(", ")}] (${runtimeKey})`,
          )
        }
        if (nonEmpty(tool.risk) && !isToolDeploymentRiskCompatible(tool.risk, definition.tier)) {
          failures.push(
            `${tool.id}: graph risk ${tool.risk} is incompatible with Tool tier ${definition.tier} (${runtimeKey}, unit ${unit.id})`,
          )
        }
      }
      const requiredContext = tool.context ?? []
      if (requiredContext.length > 0) {
        const missingContext = requiredContext.filter((key) => !contributedContext.has(key))
        if (missingContext.length > 0) {
          failures.push(
            `${tool.id}: selected Tool runtimes do not contribute required context [${missingContext.join(", ")}]`,
          )
        }
      }
    }
  }
}

function inspectExecutableAccessAuthority(graph, failures) {
  const resources = new Map(
    (graph.accessCatalog?.resources ?? []).map((resource) => [
      resource.resource,
      new Set((resource.actions ?? []).map((action) => action.action)),
    ]),
  )
  const units = graphUnits(graph)

  for (const unit of units) {
    for (const api of unit.api ?? []) {
      if (api.anonymous === true || api.surface === "webhook") continue
      const resource = api.resource ?? firstPathSegment(api.mount)
      if (!resource) {
        failures.push(`${api.id}: protected API must declare a permission resource or mount`)
      } else if (!resources.has(resource)) {
        failures.push(
          `${api.id}: protected API resource ${resource} is absent from the access catalog`,
        )
      }
    }
    for (const tool of unit.tools ?? []) {
      for (const scope of tool.requiredScopes ?? []) {
        const separator = scope.lastIndexOf(":")
        const resource = separator > 0 ? scope.slice(0, separator) : ""
        const action = separator > 0 ? scope.slice(separator + 1) : ""
        if (!resources.get(resource)?.has(action)) {
          failures.push(`${tool.id}: required scope ${scope} is absent from the access catalog`)
        }
      }
    }
  }
}

function inspectWebhookParity(graph, failures) {
  const units = graphUnits(graph)
  const outbound = new Map()
  const inbound = new Map()
  for (const unit of units) {
    for (const webhook of unit.webhooks ?? []) {
      const target = webhook.direction === "outbound" ? webhook.eventId : webhook.apiId
      const map = webhook.direction === "outbound" ? outbound : inbound
      map.set(target, (map.get(target) ?? 0) + 1)
    }
  }
  for (const unit of units) {
    for (const event of unit.events ?? []) {
      if (event.visibility === "external" && outbound.get(event.id) !== 1) {
        failures.push(
          `${event.id}: external event must have exactly one outbound webhook declaration`,
        )
      }
    }
    for (const api of unit.api ?? []) {
      if (api.surface === "webhook" && inbound.get(api.id) !== 1) {
        failures.push(`${api.id}: webhook API must have exactly one inbound webhook declaration`)
      }
    }
  }
}

function collectRuntimeReferences(units) {
  const references = []
  const visit = (value, location) => {
    if (!value || typeof value !== "object") return
    if (typeof value.entry === "string") references.push({ ...value, location })
    for (const [key, child] of Object.entries(value)) visit(child, `${location}.${key}`)
  }
  for (const unit of units) visit(unit, unit.id)
  return references
}

function resolveSpecifiers(source) {
  return [...source.matchAll(/resolve:\s*"(@voyant-travel\/[^"]+)"/g)].map((match) => match[1])
}

function graphId(specifier) {
  const owner = packageName(specifier)
  const subpath = specifier.slice(owner.length + 1)
  return subpath ? `${owner}#${subpath.replaceAll("/", ".")}` : owner
}

function packageName(specifier) {
  return specifier.split("/").slice(0, 2).join("/")
}

function exportTarget(value) {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return undefined
  for (const key of ["development", "import", "default", "types", "require"]) {
    const target = exportTarget(value[key])
    if (target) return target
  }
  for (const candidate of Object.values(value)) {
    const target = exportTarget(candidate)
    if (target) return target
  }
  return undefined
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  const leftValues = [...new Set(left)].sort()
  const rightValues = [...new Set(right)].sort()
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  )
}

function firstPathSegment(value) {
  if (typeof value !== "string") return undefined
  return value.split("/").find(Boolean)
}

function isConcreteEventPayloadSchema(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  if (value.type !== "object") return true
  return (
    value.properties && typeof value.properties === "object" && !Array.isArray(value.properties)
  )
}
