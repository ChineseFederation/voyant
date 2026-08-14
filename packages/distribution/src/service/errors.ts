/**
 * Service-level refusals: the operation was understood, addressed a row that
 * exists, and was declined on a domain rule. They are deliberately separate
 * from "not found" and from faults — a route maps them to 409 and a batch
 * endpoint may echo their message, which no internal error is safe to do.
 */
export class DistributionServiceRefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DistributionServiceRefusalError"
  }
}

export function isDistributionServiceRefusal(
  error: unknown,
): error is DistributionServiceRefusalError {
  return error instanceof DistributionServiceRefusalError
}
