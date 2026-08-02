export interface BookingSessionStaffAuthorities {
  staffAuthority?: { admitted: true; reason: string }
  staffBookingAuthority?: { admitted: true; reason: string }
}

/**
 * Resolve trusted staff authority for the admin Booking Session transport.
 *
 * The canonical Catalog scope admits general Session lifecycle operations.
 * The established Bookings + Finance write scopes also admit the write route
 * and are required for the richer operator booking payload.
 */
export function resolveBookingSessionStaffAuthorities(
  scopes: readonly string[],
  requiredScope: string,
): BookingSessionStaffAuthorities {
  const hasSessionAuthority = hasScope(scopes, requiredScope)
  const hasStaffBookingAuthority =
    hasScope(scopes, "bookings:write") && hasScope(scopes, "finance:write")
  const legacyWriteAuthority =
    requiredScope === "catalog:booking-session-write" && hasStaffBookingAuthority

  if (!hasSessionAuthority && !legacyWriteAuthority) return {}
  return {
    staffAuthority: {
      admitted: true,
      reason: hasSessionAuthority
        ? `scope:${requiredScope}`
        : "scopes:bookings:write+finance:write",
    },
    ...(hasStaffBookingAuthority
      ? {
          staffBookingAuthority: {
            admitted: true as const,
            reason: "scopes:bookings:write+finance:write",
          },
        }
      : {}),
  }
}

function hasScope(scopes: readonly string[], required: string): boolean {
  if (scopes.includes("*") || scopes.includes("*:*") || scopes.includes(required)) return true
  const separator = required.indexOf(":")
  return separator > 0 && scopes.includes(`${required.slice(0, separator)}:*`)
}
