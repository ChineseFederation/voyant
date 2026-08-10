const CONTENT_DIGEST_PREFIX = "booking-contract-acceptance:v1:sha256:"

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/** Bind a storefront acceptance to one exact template version and rendered body. */
export async function bookingContractAcceptanceContentDigest(input: {
  templateId: string
  templateVersionId: string
  renderedBody: string
}): Promise<string> {
  const payload = JSON.stringify([input.templateId, input.templateVersionId, input.renderedBody])
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))
  return `${CONTENT_DIGEST_PREFIX}${toHex(digest)}`
}

export function isBookingContractAcceptanceContentDigest(value: unknown): value is string {
  return (
    typeof value === "string" && /^booking-contract-acceptance:v1:sha256:[a-f0-9]{64}$/.test(value)
  )
}
