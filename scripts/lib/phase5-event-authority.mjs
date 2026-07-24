function extractArrayAt(source, start) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character
      continue
    }
    if (character === "[") depth += 1
    if (character === "]" && --depth === 0) return source.slice(start + 1, index)
  }
  return ""
}

function extractArrays(source, property) {
  const arrays = []
  const pattern = new RegExp(`\\b${property}\\s*:\\s*\\[`, "g")
  for (const match of source.matchAll(pattern)) {
    const start = source.indexOf("[", match.index)
    arrays.push(extractArrayAt(source, start))
  }
  return arrays
}

function objectEntries(arraySource) {
  const entries = []
  let depth = 0
  let start = -1
  let quote = null
  let escaped = false
  for (let index = 0; index < arraySource.length; index += 1) {
    const character = arraySource[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character
      continue
    }
    if (character === "{") {
      if (depth === 0) start = index
      depth += 1
    } else if (character === "}" && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) entries.push(arraySource.slice(start, index + 1))
    }
  }
  return entries
}

function stringProperty(source, property) {
  return new RegExp(`\\b${property}\\s*:\\s*["']([^"']+)["']`).exec(source)?.[1]
}

export function collectPhase5EventAuthority(source, location = "voyant.ts") {
  const events = new Map(
    extractArrays(source, "events")
      .flatMap(objectEntries)
      .map((entry) => [
        stringProperty(entry, "id"),
        { entry, eventType: stringProperty(entry, "eventType"), location },
      ])
      .filter(([id]) => id),
  )
  const webhooks = extractArrays(source, "webhooks")
    .flatMap(objectEntries)
    .filter((entry) => stringProperty(entry, "direction") === "outbound")
    .map((entry) => ({
      entry,
      id: stringProperty(entry, "id") ?? "<unknown webhook>",
      eventId: stringProperty(entry, "eventId"),
      location,
    }))
  const subscribers = extractArrays(source, "subscribers")
    .flatMap(objectEntries)
    .map((entry) => ({
      entry,
      eventType: stringProperty(entry, "eventType"),
      id: stringProperty(entry, "id") ?? "<unknown subscriber>",
      location,
    }))
    .filter((subscriber) => subscriber.eventType)
  return { events, subscribers, webhooks }
}

export function inspectPhase5EventAuthority(
  source,
  location = "voyant.ts",
  eventCatalog = collectPhase5EventAuthority(source, location).events,
) {
  const { events, subscribers, webhooks } = collectPhase5EventAuthority(source, location)
  const failures = []

  for (const [id, { entry }] of events) {
    const prefix = `${location}: event "${id}"`
    if (!stringProperty(entry, "eventType")) {
      failures.push(`${prefix} must declare eventType`)
    }
    if (!/^\d+\.\d+\.\d+$/.test(stringProperty(entry, "version") ?? "")) {
      failures.push(`${prefix} must declare a semantic version`)
    }
    if (!/\bpayloadSchema\s*:/.test(entry)) {
      failures.push(`${prefix} must declare payloadSchema`)
    }
    if (!/^(internal|external)$/.test(stringProperty(entry, "visibility") ?? "")) {
      failures.push(`${prefix} must declare internal or external visibility`)
    }
    const audit = /\baudit\s*:\s*\{([\s\S]*?)\}/.exec(entry)?.[1] ?? ""
    if (!stringProperty(audit, "sourceModule") || !stringProperty(audit, "category")) {
      failures.push(`${prefix} must declare audit sourceModule and category`)
    }
  }

  const declaredEventTypes = new Set(
    [...eventCatalog.values()].map((event) => event.eventType).filter(Boolean),
  )
  for (const subscriber of subscribers) {
    if (!declaredEventTypes.has(subscriber.eventType)) {
      failures.push(
        `${subscriber.location}: subscriber "${subscriber.id}" consumes undeclared event type "${subscriber.eventType}"`,
      )
    }
  }

  for (const webhook of webhooks) {
    const event = webhook.eventId ? eventCatalog.get(webhook.eventId)?.entry : undefined
    const prefix = `${webhook.location}: outbound webhook "${webhook.id}"`
    if (!webhook.eventId || !event) {
      failures.push(`${prefix} must reference an event declared in a package manifest`)
      continue
    }
    if (stringProperty(event, "visibility") !== "external") {
      failures.push(`${prefix} event "${webhook.eventId}" must declare visibility: "external"`)
    }
    if (!/^\d+\.\d+\.\d+$/.test(stringProperty(event, "version") ?? "")) {
      failures.push(`${prefix} event "${webhook.eventId}" must declare a semantic version`)
    }
    if (!/\bpayloadSchema\s*:/.test(event)) {
      failures.push(`${prefix} event "${webhook.eventId}" must declare payloadSchema`)
    }
    const audit = /\baudit\s*:\s*\{([\s\S]*?)\}/.exec(event)?.[1] ?? ""
    if (!stringProperty(audit, "sourceModule") || !stringProperty(audit, "category")) {
      failures.push(
        `${prefix} event "${webhook.eventId}" must declare audit sourceModule and category`,
      )
    }
  }
  return failures
}

export function collectEventConstants(source) {
  return new Map(
    [...source.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*["']([^"']+)["']/g)].map(
      (match) => [match[1], match[2]],
    ),
  )
}

export function collectEventCalls(source, method, knownConstants = new Map()) {
  const constants = new Map([...knownConstants, ...collectEventConstants(source)])
  return [
    ...source.matchAll(
      new RegExp(`\\.${method}(?:<[^;()]*>)?\\(\\s*(?:["']([^"']+)["']|([A-Z][A-Z0-9_]*))`, "g"),
    ),
  ]
    .map((match) => match[1] ?? constants.get(match[2]))
    .filter(Boolean)
}

function extractCallAt(source, start) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character
      continue
    }
    if (character === "(") depth += 1
    if (character === ")" && --depth === 0) return source.slice(start + 1, index)
  }
  return ""
}

function splitTopLevelArguments(source) {
  const argumentsList = []
  let start = 0
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character
      continue
    }
    if (character === "(" || character === "[" || character === "{") depth += 1
    else if (character === ")" || character === "]" || character === "}") depth -= 1
    else if (character === "," && depth === 0) {
      argumentsList.push(source.slice(start, index).trim())
      start = index + 1
    }
  }
  argumentsList.push(source.slice(start).trim())
  return argumentsList
}

function topLevelPropertyToken(source, property) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character
      continue
    }
    if (character === "{") {
      depth += 1
      continue
    }
    if (character === "}") {
      depth -= 1
      continue
    }
    if (depth !== 1 || !source.startsWith(property, index)) continue
    const before = source[index - 1]
    const after = source[index + property.length]
    if ((before && /[\w$]/.test(before)) || (after && /[\w$]/.test(after))) continue
    const remainder = source.slice(index + property.length)
    const separator = /^\s*:\s*/.exec(remainder)
    if (!separator) continue
    const value = remainder.slice(separator[0].length)
    const literal = /^(["'])([^"']+)\1/.exec(value)
    if (literal) return { literal: literal[2] }
    const constant = /^([A-Z][A-Z0-9_]*)\b/.exec(value)?.[1]
    if (constant) return { constant }
  }
}

/**
 * Find domain events appended through the transaction-bound outbox seam.
 * These are the durable equivalent of EventBus.emit(), not a coverage escape.
 */
export function collectOutboxEventCalls(source, knownConstants = new Map()) {
  const constants = new Map([...knownConstants, ...collectEventConstants(source)])
  const events = []
  for (const match of source.matchAll(/\binsertOutboxEvents\s*\(/g)) {
    const lineStart = source.lastIndexOf("\n", match.index) + 1
    if (/^\s*(?:\/\/|\*)/.test(source.slice(lineStart, match.index))) continue
    const start = source.indexOf("(", match.index)
    const call = extractCallAt(source, start)
    const eventsArgument = splitTopLevelArguments(call)[1] ?? ""
    for (const event of objectEntries(eventsArgument)) {
      const name = topLevelPropertyToken(event, "name")
      const eventType = name?.literal ?? constants.get(name?.constant)
      if (eventType) events.push(eventType)
    }
  }
  return events
}

/** Find direct Drizzle-style persistence mutations without treating array helpers as writes. */
export function collectPersistenceMutationCalls(source) {
  return [...source.matchAll(/\b(?:db|tx|trx|database)\.(insert|update|delete)\s*\(/g)].map(
    (match) => match[1],
  )
}
