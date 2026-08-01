import { listResponse } from "@voyant-travel/types"
export async function paginate<T extends object>(
  rowsQuery: Promise<T[]>,
  countQuery: Promise<Array<{ count: number }>>,
  limit: number,
  offset: number,
) {
  const [data, countResult] = await Promise.all([rowsQuery, countQuery])

  return listResponse(data, { total: countResult[0]?.count ?? 0, limit, offset })
}

export function toDateOrNull(value: string | null | undefined) {
  return value ? new Date(value) : null
}

export function normalizeContactValue(kind: "email" | "phone" | "website", value: string) {
  if (kind === "email" || kind === "website") {
    return value.trim().toLowerCase()
  }
  return value.trim()
}

export function isManagedBySource(
  metadata: Record<string, unknown> | null | undefined,
  source: string,
) {
  return metadata?.managedBy === source
}

export function toNullableTrimmed(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function formatAddress(address: {
  fullText: string | null
  line1: string | null
  line2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  country: string | null
}) {
  if (address.fullText) {
    return address.fullText
  }
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : null
}
