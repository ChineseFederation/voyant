import type {
  TransportEligibilityInput,
  TransportEligibilityIssue,
  TransportEligibilityResult,
  TransportEligibilityRule,
  TransportEligibilityRuleInput,
} from "./validation-transport-eligibility.js"
import { transportEligibilityRuleSchema } from "./validation-transport-eligibility.js"

type EligibilityTarget = {
  departureId: string
  productId?: string | null
  travelStartsOn?: string | null
  travelEndsOn?: string | null
}

type NormalizedDocument = TransportEligibilityInput["travelers"][number]["documents"][number]
type NormalizedTraveler = TransportEligibilityInput["travelers"][number]

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(value: string, days: number): string {
  const date = parseDate(value)
  if (!date) return value
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function getAgeOn(dateOfBirth: string, onDate: string): number | null {
  const birth = parseDate(dateOfBirth)
  const reference = parseDate(onDate)
  if (!birth || !reference) return null

  let age = reference.getUTCFullYear() - birth.getUTCFullYear()
  const birthdayThisYear = Date.UTC(
    reference.getUTCFullYear(),
    birth.getUTCMonth(),
    birth.getUTCDate(),
  )

  if (reference.getTime() < birthdayThisYear) {
    age -= 1
  }

  return age
}

function isBeforeDate(left: string, right: string): boolean {
  const leftDate = parseDate(left)
  const rightDate = parseDate(right)
  if (!leftDate || !rightDate) return false
  return leftDate.getTime() < rightDate.getTime()
}

function findDocuments(
  traveler: NormalizedTraveler,
  rule: TransportEligibilityRule,
): NormalizedDocument[] {
  if (rule.requiredDocumentType === "none") return []
  if (rule.requiredDocumentType === "passport_or_id_card") {
    return traveler.documents.filter(
      (document) => document.type === "passport" || document.type === "id_card",
    )
  }

  return traveler.documents.filter((document) => document.type === rule.requiredDocumentType)
}

function documentTypeLabel(rule: TransportEligibilityRule): string {
  switch (rule.requiredDocumentType) {
    case "passport_or_id_card":
      return "passport or ID card"
    case "id_card":
      return "ID card"
    case "passport":
      return "passport"
    case "none":
      return "travel document"
  }
}

function buildIssue(
  code: TransportEligibilityIssue["code"],
  traveler: NormalizedTraveler,
  rule: TransportEligibilityRule,
  message: string,
): TransportEligibilityIssue {
  return {
    code,
    severity: rule.severity,
    message: rule.message ?? message,
    travelerRef: traveler.travelerRef,
    ruleId: rule.id,
    destinationCountries: rule.destinationCountries,
    requiredDocumentType: rule.requiredDocumentType,
  }
}

function pushIssue(
  target: {
    blockingIssues: TransportEligibilityIssue[]
    warnings: TransportEligibilityIssue[]
  },
  issue: TransportEligibilityIssue,
) {
  if (issue.severity === "warning") {
    target.warnings.push(issue)
  } else {
    target.blockingIssues.push(issue)
  }
}

function appliesToTarget(rule: TransportEligibilityRule, target: EligibilityTarget) {
  if (rule.productId && rule.productId !== target.productId) return false
  if (rule.departureId && rule.departureId !== target.departureId) return false
  return true
}

function appliesToTraveler(
  rule: TransportEligibilityRule,
  traveler: NormalizedTraveler,
  travelStartsOn: string | null,
) {
  if (rule.nationalityCountries.length > 0) {
    if (!traveler.nationalityCountry) return "missing_nationality" as const
    if (!rule.nationalityCountries.includes(traveler.nationalityCountry)) return false
  }

  if (rule.minAge == null && rule.maxAge == null) return true
  if (!traveler.dateOfBirth || !travelStartsOn) return "missing_age_basis" as const

  const age = getAgeOn(traveler.dateOfBirth, travelStartsOn)
  if (age == null) return "missing_age_basis" as const
  if (rule.minAge != null && age < rule.minAge) return false
  if (rule.maxAge != null && age > rule.maxAge) return false

  return true
}

function evaluateTravelerRule(
  traveler: NormalizedTraveler,
  rule: TransportEligibilityRule,
  target: { travelStartsOn: string | null; travelEndsOn: string | null },
) {
  const blockingIssues: TransportEligibilityIssue[] = []
  const warnings: TransportEligibilityIssue[] = []
  const resultTarget = { blockingIssues, warnings }

  const travelerApplicability = appliesToTraveler(rule, traveler, target.travelStartsOn)
  if (travelerApplicability === false) {
    return null
  }

  if (travelerApplicability === "missing_nationality") {
    pushIssue(
      resultTarget,
      buildIssue(
        "nationality_required",
        traveler,
        rule,
        "Traveler nationality is required to evaluate destination document rules.",
      ),
    )
  }

  if (travelerApplicability === "missing_age_basis") {
    pushIssue(
      resultTarget,
      buildIssue(
        "date_of_birth_required",
        traveler,
        rule,
        "Traveler date of birth and travel start date are required to evaluate age rules.",
      ),
    )
  }

  const documents = findDocuments(traveler, rule)
  if (rule.requiredDocumentType !== "none" && documents.length === 0) {
    pushIssue(
      resultTarget,
      buildIssue(
        "document_required",
        traveler,
        rule,
        `Traveler needs a ${documentTypeLabel(rule)} for this destination.`,
      ),
    )
  }

  if (rule.minValidityDaysAfterReturn > 0) {
    if (!target.travelEndsOn) {
      pushIssue(
        resultTarget,
        buildIssue(
          "travel_dates_required",
          traveler,
          rule,
          "Travel end date is required to evaluate document validity after return.",
        ),
      )
    } else if (documents.length === 0) {
      // Missing documents are already reported through document_required.
    } else {
      const requiredValidUntil = addDays(target.travelEndsOn, rule.minValidityDaysAfterReturn)
      const documentsWithExpiry = documents.filter(
        (document): document is NormalizedDocument & { expiresOn: string } =>
          typeof document.expiresOn === "string",
      )
      const hasValidDocument = documentsWithExpiry.some(
        (document) => !isBeforeDate(document.expiresOn, requiredValidUntil),
      )

      if (hasValidDocument) {
        // Any acceptable document can satisfy a passport-or-ID-card validity rule.
      } else if (documentsWithExpiry.length > 0) {
        pushIssue(
          resultTarget,
          buildIssue(
            "document_validity",
            traveler,
            rule,
            `Traveler ${documentTypeLabel(rule)} must be valid until at least ${requiredValidUntil}.`,
          ),
        )
      } else {
        pushIssue(
          resultTarget,
          buildIssue(
            "document_expiry_required",
            traveler,
            rule,
            `Traveler ${documentTypeLabel(rule)} expiry date is required.`,
          ),
        )
      }
    }
  }

  if (rule.visaRequired) {
    const hasVisa =
      traveler.hasVisa || traveler.documents.some((document) => document.type === "visa")
    if (!hasVisa) {
      pushIssue(
        resultTarget,
        buildIssue("visa_required", traveler, rule, "Traveler needs a visa for this destination."),
      )
    }
  }

  if (rule.minorConsentRequired) {
    const age =
      traveler.dateOfBirth && target.travelStartsOn
        ? getAgeOn(traveler.dateOfBirth, target.travelStartsOn)
        : null
    const isMinor = age == null ? true : age < 18
    const hasConsent =
      traveler.hasMinorConsent ||
      traveler.travelingWithGuardian ||
      traveler.documents.some((document) => document.type === "minor_consent")

    if (isMinor && !hasConsent) {
      pushIssue(
        resultTarget,
        buildIssue(
          "minor_consent_required",
          traveler,
          rule,
          "Minor traveler needs guardian travel consent for this departure.",
        ),
      )
    }
  }

  return { blockingIssues, warnings }
}

export function evaluateTransportEligibility(input: {
  departureId: string
  productId?: string | null
  travelStartsOn?: string | null
  travelEndsOn?: string | null
  travelers: TransportEligibilityInput["travelers"]
  rules: TransportEligibilityRuleInput[]
}): TransportEligibilityResult {
  const travelStartsOn = input.travelStartsOn ?? null
  const travelEndsOn = input.travelEndsOn ?? null
  const rules = input.rules
    .map((rule) => transportEligibilityRuleSchema.parse(rule))
    .filter((rule) => appliesToTarget(rule, input))
  const travelerResults = input.travelers.map((traveler) => {
    const blockingIssues: TransportEligibilityIssue[] = []
    const warnings: TransportEligibilityIssue[] = []
    const matchedRuleIds: string[] = []

    for (const rule of rules) {
      const result = evaluateTravelerRule(traveler, rule, { travelStartsOn, travelEndsOn })
      if (!result) continue

      matchedRuleIds.push(rule.id)
      blockingIssues.push(...result.blockingIssues)
      warnings.push(...result.warnings)
    }

    return {
      travelerRef: traveler.travelerRef,
      eligible: blockingIssues.length === 0,
      matchedRuleIds,
      blockingIssues,
      warnings,
    }
  })

  const blockingIssues = travelerResults.flatMap((traveler) => traveler.blockingIssues)
  const warnings = travelerResults.flatMap((traveler) => traveler.warnings)

  return {
    departureId: input.departureId,
    productId: input.productId ?? null,
    travelStartsOn,
    travelEndsOn,
    eligible: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    travelers: travelerResults,
  }
}
