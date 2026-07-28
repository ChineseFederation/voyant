import type { VoyantFetcher } from "./client.js"

const MCP_PATH = "/v1/admin/mcp"
const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
}

export interface ManualBookingMcpClientOptions {
  baseUrl: string
  fetcher: VoyantFetcher
}

export interface ManualBookingToolAvailability {
  canCreate: boolean
  missingTools: string[]
}

export interface ManualBookingCreateResult {
  status: "created"
  bookingId: string
  replayed: boolean
}

interface JsonRpcResponse {
  error?: { code?: number; message?: string; data?: unknown }
  result?: {
    isError?: boolean
    content?: Array<{ type?: string; text?: string }>
    structuredContent?: Record<string, unknown>
  }
}

const REQUIRED_TOOLS = ["generate_booking_number", "create_booking"] as const

export async function getManualBookingToolAvailability(
  options: ManualBookingMcpClientOptions,
): Promise<ManualBookingToolAvailability> {
  const response = await options.fetcher(joinUrl(options.baseUrl, `${MCP_PATH}/manifest`), {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error(`Unable to check booking creation permissions (${response.status}).`)
  }
  const body = (await response.json()) as { tools?: Array<{ name?: unknown }> }
  const names = new Set(
    (body.tools ?? []).flatMap((tool) => (typeof tool.name === "string" ? [tool.name] : [])),
  )
  const missingTools = REQUIRED_TOOLS.filter((name) => !names.has(name))
  return { canCreate: missingTools.length === 0, missingTools }
}

export async function allocateManualBookingNumber(
  options: ManualBookingMcpClientOptions,
): Promise<string> {
  const result = await callTool(options, "generate_booking_number", {})
  if (typeof result.bookingNumber !== "string" || result.bookingNumber.length === 0) {
    throw new Error("The booking number Tool returned an invalid reference.")
  }
  return result.bookingNumber
}

export async function createManualBookingThroughTool(
  options: ManualBookingMcpClientOptions,
  input: {
    booking: Record<string, unknown>
    idempotencyKey: string
  },
): Promise<ManualBookingCreateResult> {
  const result = await callTool(options, "create_booking", {
    booking: input.booking,
    _voyant: {
      confirmed: true,
      idempotencyKey: input.idempotencyKey,
      reasonCode: "operator-manual-booking",
    },
  })
  if (
    result.status !== "created" ||
    typeof result.bookingId !== "string" ||
    typeof result.replayed !== "boolean"
  ) {
    throw new Error("The booking creation Tool returned an invalid result.")
  }
  return {
    status: "created",
    bookingId: result.bookingId,
    replayed: result.replayed,
  }
}

async function callTool(
  options: ManualBookingMcpClientOptions,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await options.fetcher(joinUrl(options.baseUrl, MCP_PATH), {
    method: "POST",
    credentials: "include",
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: createRequestId(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  })
  const body = await readRpcResponse(response)
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Booking Tool request failed (${response.status}).`)
  }
  if (body.error) throw new Error(body.error.message ?? "Booking Tool request failed.")
  if (body.result?.isError) {
    const message = body.result.content?.find((entry) => entry.type === "text")?.text
    throw new Error(message ?? "Booking Tool rejected the request.")
  }
  if (!body.result?.structuredContent) {
    throw new Error("Booking Tool response did not include structured content.")
  }
  return body.result.structuredContent
}

async function readRpcResponse(response: Response): Promise<JsonRpcResponse> {
  const text = await response.text()
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = text
      .split("\n")
      .find((line) => line.startsWith("data:"))
      ?.slice("data:".length)
      .trim()
    return JSON.parse(data || "{}") as JsonRpcResponse
  }
  return JSON.parse(text || "{}") as JsonRpcResponse
}

function createRequestId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `manual-booking-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`
}
