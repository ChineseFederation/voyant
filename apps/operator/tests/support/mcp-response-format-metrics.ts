export interface RecordedMcpCall {
  name: string
  args: Record<string, unknown>
  responseBytes: number
}

export interface ResponseFormatMetrics {
  queryCalls: number
  explicitConcise: number
  explicitDetailed: number
  defaultConcise: number
  immediateDetailedRefetches: number
  searchToolsMaxBytes: number
  describeToolMaxBytes: number
}

export function measureResponseFormats(calls: readonly RecordedMcpCall[]): ResponseFormatMetrics {
  const metrics: ResponseFormatMetrics = {
    queryCalls: 0,
    explicitConcise: 0,
    explicitDetailed: 0,
    defaultConcise: 0,
    immediateDetailedRefetches: 0,
    searchToolsMaxBytes: 0,
    describeToolMaxBytes: 0,
  }
  let previousQuery: { fingerprint: string; format: string | undefined } | undefined

  for (const call of calls) {
    if (call.name === "search_tools") {
      metrics.searchToolsMaxBytes = Math.max(metrics.searchToolsMaxBytes, call.responseBytes)
    }
    if (call.name === "describe_tool") {
      metrics.describeToolMaxBytes = Math.max(metrics.describeToolMaxBytes, call.responseBytes)
    }

    const query = queryInvocation(call)
    if (!query) {
      previousQuery = undefined
      continue
    }
    metrics.queryCalls += 1
    if (query.format === "concise") metrics.explicitConcise += 1
    else if (query.format === "detailed") metrics.explicitDetailed += 1
    else metrics.defaultConcise += 1

    if (
      query.format === "detailed" &&
      previousQuery?.fingerprint === query.fingerprint &&
      previousQuery.format !== "detailed"
    ) {
      metrics.immediateDetailedRefetches += 1
    }
    previousQuery = query
  }
  return metrics
}

function queryInvocation(call: RecordedMcpCall) {
  const toolName = call.name === "call_tool" ? call.args.name : call.name
  const input = call.name === "call_tool" ? call.args.arguments : call.args
  if (typeof toolName !== "string" || !toolName.endsWith("_query")) return undefined
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined
  const args = input as Record<string, unknown>
  const format = typeof args.response_format === "string" ? args.response_format : undefined
  const fingerprint = JSON.stringify(
    Object.fromEntries(
      Object.entries({ toolName, ...args })
        .filter(([key]) => key !== "response_format")
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  )
  return { fingerprint, format }
}
