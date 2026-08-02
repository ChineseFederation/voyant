import { createHash, createHmac } from "node:crypto"
import { isIP } from "node:net"

const DEFAULT_EXCERPT_BYTES = 4 * 1024
const REDACTION_MARKER = "[REDACTED]"
const REDACTED_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-api-token",
  "x-auth-token",
  "x-access-token",
  "x-voyant-signature",
  "api-key",
  "apikey",
])
const REDACTED_BODY_KEYS = new Set([
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "apitoken",
  "authorization",
  "email",
  "phone",
  "phonenumber",
  "mobile",
  "ssn",
  "passport",
  "passportnumber",
  "documentnumber",
  "nationalid",
  "taxid",
  "dob",
  "dateofbirth",
  "birthdate",
  "cardnumber",
  "pan",
  "cvv",
  "cvc",
  "iban",
  "bic",
  "accountnumber",
  "firstname",
  "lastname",
  "fullname",
  "middlename",
])
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g

export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`
}

export interface WebhookSigningKey {
  id: string
  secret: string
}

export function verifyWebhookPayloadSignature(input: {
  body: string
  timestamp: string
  signature: string
  keys: readonly WebhookSigningKey[]
  now?: Date
  toleranceSeconds?: number
}): { ok: true; keyId: string } | { ok: false; reason: string } {
  const timestampSeconds = Number(input.timestamp)
  if (!Number.isInteger(timestampSeconds)) return { ok: false, reason: "invalid_timestamp" }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000)
  const tolerance = input.toleranceSeconds ?? 300
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: "timestamp_outside_tolerance" }
  }
  for (const key of input.keys) {
    if (signWebhookPayload(key.secret, input.timestamp, input.body) === input.signature) {
      return { ok: true, keyId: key.id }
    }
  }
  return { ok: false, reason: "signature_mismatch" }
}

export function hashWebhookPayload(body: string): string {
  return createHash("sha256").update(body).digest("hex")
}

export function assertOutboundWebhookEndpointUrl(value: string): void {
  const url = new URL(value)
  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS.")
  }
  if (url.username || url.password) {
    throw new Error("Webhook URL must not include credentials.")
  }
  if (url.hash) {
    throw new Error("Webhook URL must not include a fragment.")
  }
  const hostname = url.hostname.toLowerCase()
  const address =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Webhook URL host is not allowed.")
  }
  const ipVersion = isIP(address)
  if (ipVersion === 4 && isPrivateIpv4(address)) {
    throw new Error("Webhook URL IP is not allowed.")
  }
  if (ipVersion === 6 && isPrivateIpv6(address)) {
    throw new Error("Webhook URL IP is not allowed.")
  }
}

export function redactWebhookHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!headers) return null
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      REDACTED_HEADERS.has(name.toLowerCase()) ? REDACTION_MARKER : value,
    ]),
  )
}

export function webhookBodyExcerpt(body: unknown, maxBytes = DEFAULT_EXCERPT_BYTES): string | null {
  if (body == null) return null
  let text: string
  if (typeof body === "string") {
    try {
      text = JSON.stringify(redactValue(JSON.parse(body)))
    } catch {
      text = redactString(body)
    }
  } else {
    try {
      text = JSON.stringify(redactValue(body))
    } catch {
      text = "[unserializable]"
    }
  }
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text
  return `${Buffer.from(text, "utf8")
    .subarray(0, Math.max(0, maxBytes - 3))
    .toString("utf8")}...`
}

function redactValue(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === "string") return redactString(value)
  if (typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(redactValue)
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, "")
    output[key] = REDACTED_BODY_KEYS.has(normalized) ? REDACTION_MARKER : redactValue(item)
  }
  return output
}

function redactString(value: string): string {
  return value.replace(EMAIL_PATTERN, REDACTION_MARKER).replace(PHONE_PATTERN, REDACTION_MARKER)
}

function isPrivateIpv4(value: string): boolean {
  const [a = 0, b = 0, c = 0] = value.split(".").map((part) => Number(part))
  return (
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 ||
    a === 0
  )
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fec") ||
    normalized.startsWith("fed") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("3fff:")
  )
}
