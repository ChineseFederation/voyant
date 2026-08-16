/**
 * Hierarchical TanStack query keys, rooted at `["voyant", "insurance", ...]`.
 *
 * Same convention as charters-react and cruises-react: one invalidation can
 * wipe everything insurance-related, and finer ones target a booking, an
 * application or a policy. Retrying an issue changes both the policy and the
 * booking's overview, so both are invalidated together — a UI that showed a
 * fresh policy next to a stale "issue failed" banner would be worse than one
 * that showed neither.
 */
export const insuranceQueryKeys = {
  all: ["voyant", "insurance"] as const,

  bookings: () => [...insuranceQueryKeys.all, "bookings"] as const,
  booking: (bookingId: string) => [...insuranceQueryKeys.bookings(), bookingId] as const,

  applications: () => [...insuranceQueryKeys.all, "applications"] as const,
  application: (applicationId: string) =>
    [...insuranceQueryKeys.applications(), applicationId] as const,

  policies: () => [...insuranceQueryKeys.all, "policies"] as const,
  policy: (policyId: string) => [...insuranceQueryKeys.policies(), policyId] as const,
} as const
