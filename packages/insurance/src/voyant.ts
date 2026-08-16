import { ancillaryOfferSourceRuntimePort } from "@voyant-travel/commerce/runtime-port"
import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"

import { insuranceProviderSourcePort } from "./provider-ports.js"
import { insuranceCustomerPortalPort, insuranceRuntimePort } from "./runtime-port.js"

/**
 * Event payloads are id-shaped, plus the commercial facts an operator surface
 * needs without a second read.
 *
 * Two fields are marked `x-voyant-redact` and it is worth saying why, because
 * neither is obviously personal data:
 *
 * - `policyNumber` is the credential a claimant quotes to the insurer. It
 *   identifies one person's cover, and an outbound webhook subscription is
 *   exactly the sort of place it should not turn up.
 * - `failureMessage` is the insurer's own wording, passed through verbatim.
 *   Insurers routinely name the person or the declaration in a refusal, so the
 *   field cannot be assumed safe — and the safe assumption has to be encoded
 *   here, where external delivery reads it, not in whoever writes the message.
 *
 * Everything else is an id, a state, or money.
 */
const insurancePolicyIssuedPayloadSchema = {
  type: "object",
  properties: {
    policyId: { type: "string" },
    applicationId: { type: "string" },
    bookingId: { type: ["string", "null"] },
    providerId: { type: "string" },
    policyNumber: { type: ["string", "null"], "x-voyant-redact": true },
    premiumAmountMinor: { type: "integer" },
    premiumCurrency: { type: "string" },
  },
  required: [
    "policyId",
    "applicationId",
    "bookingId",
    "providerId",
    "premiumAmountMinor",
    "premiumCurrency",
  ],
  additionalProperties: false,
} as const

const insurancePolicyIssueFailedPayloadSchema = {
  type: "object",
  properties: {
    policyId: { type: "string" },
    applicationId: { type: "string" },
    bookingId: { type: ["string", "null"] },
    providerId: { type: "string" },
    failureCode: { type: "string" },
    failureMessage: { type: "string", "x-voyant-redact": true },
    retryable: { type: "boolean" },
    paid: { type: "boolean" },
  },
  required: [
    "policyId",
    "applicationId",
    "bookingId",
    "providerId",
    "failureCode",
    "retryable",
    "paid",
  ],
  additionalProperties: false,
} as const

const insurancePolicyCancelledPayloadSchema = {
  type: "object",
  properties: {
    policyId: { type: "string" },
    bookingId: { type: ["string", "null"] },
    providerId: { type: "string" },
    reason: { type: "string", "x-voyant-redact": true },
    refundAmountMinor: { type: ["integer", "null"] },
    refundCurrency: { type: ["string", "null"] },
  },
  required: ["policyId", "bookingId", "providerId"],
  additionalProperties: false,
} as const

const insuranceApplicationOpenedPayloadSchema = {
  type: "object",
  properties: {
    applicationId: { type: "string" },
    bookingSessionId: { type: ["string", "null"] },
    providerId: { type: "string" },
    premiumAmountMinor: { type: "integer" },
    premiumCurrency: { type: "string" },
    insuredPersonCount: { type: "integer" },
  },
  required: ["applicationId", "providerId", "premiumAmountMinor", "premiumCurrency"],
  additionalProperties: false,
} as const

/** Import-cheap deployment declaration owned by the insurance package. */
export const insuranceVoyantModule = defineModule({
  id: "@voyant-travel/insurance",
  packageName: "@voyant-travel/insurance",
  localId: "insurance",
  provides: {
    ports: [
      // The cardinality change: commerce reads ONE ancillary source, and this
      // one fans out across every connected insurer.
      providePort(ancillaryOfferSourceRuntimePort),
      providePort(insuranceCustomerPortalPort),
    ],
  },
  // Both are resolved at run time, so both are declared here and neither in
  // `requires.ports`: cardinality is a property of a runtime read, and the
  // graph rejects it on a statically composed requirement.
  //
  // The insurer source is optional and many-valued from the start. Zero
  // connected insurers is a supported, silent state; one is a list of length
  // one. Building the fan-out later, after single-provider assumptions have
  // spread, is the expensive path.
  runtimePorts: [
    requirePort(insuranceRuntimePort),
    requirePort(insuranceProviderSourcePort, { optional: true, cardinality: "many" }),
  ],
  api: [
    {
      id: "@voyant-travel/insurance#api.admin",
      surface: "admin",
      mount: "insurance",
      transactional: true,
      openapi: { document: "insurance" },
      runtime: {
        entry: "@voyant-travel/insurance",
        export: "createInsuranceVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/insurance#schema",
      source: "@voyant-travel/insurance/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/insurance#migrations",
      source: "./migrations",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/insurance#access.insurance",
        resource: "insurance",
        label: "Insurance",
        description:
          "Travel insurance applications and issued policies attached to bookings, and the operator actions that retry or cancel an issue.",
        actions: [
          {
            action: "read",
            label: "View insurance",
            description:
              "View insurance applications and policies, their premiums, and their issue state. Does not include an insured person's identity data.",
          },
          {
            action: "write",
            label: "Manage insurance",
            description:
              "Retry a failed issue and cancel an issued policy at the insurer. Both act on a real contract with a real insurer.",
          },
        ],
      },
      {
        // A separate resource, not a third action on `insurance`. An operator
        // agent reconciling premiums needs to list policies and has no business
        // reading a passport number, and a permission editor should make that
        // difference visible rather than bundling it into "manage insurance".
        id: "@voyant-travel/insurance#access.insurance-pii",
        resource: "insurance-pii",
        label: "Insurance identity data",
        description:
          "Names, dates of birth, identity documents and underwriting answers held for the people a policy covers. Encrypted at rest; every decryption is audited.",
        wildcard: "explicit-resource",
        actions: [
          {
            action: "read",
            label: "View insurance identity data",
            description:
              "Decrypt and view an insured person's name, date of birth and identity documents.",
            sensitive: true,
            wildcard: "explicit",
          },
        ],
      },
    ],
  },
  events: [
    {
      id: "@voyant-travel/insurance#event.application-opened",
      eventType: "insurance.application.opened",
      version: "1.0.0",
      payloadSchema: insuranceApplicationOpenedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "insurance", category: "domain" },
    },
    {
      id: "@voyant-travel/insurance#event.policy-issued",
      eventType: "insurance.policy.issued",
      version: "1.0.0",
      payloadSchema: insurancePolicyIssuedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "insurance", category: "domain" },
    },
    {
      id: "@voyant-travel/insurance#event.policy-issue-failed",
      eventType: "insurance.policy.issue-failed",
      version: "1.0.0",
      payloadSchema: insurancePolicyIssueFailedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "insurance", category: "domain" },
    },
    {
      id: "@voyant-travel/insurance#event.policy-cancelled",
      eventType: "insurance.policy.cancelled",
      version: "1.0.0",
      payloadSchema: insurancePolicyCancelledPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "insurance", category: "domain" },
    },
  ],
  tools: [
    {
      id: "@voyant-travel/insurance#tool.get-booking-insurance",
      name: "get_booking_insurance",
      runtime: { entry: "@voyant-travel/insurance/tools", export: "getBookingInsuranceTool" },
      requiredScopes: ["insurance:read"],
      context: ["insurance"],
      risk: "low",
    },
    {
      id: "@voyant-travel/insurance#tool.get-insurance-policy",
      name: "get_insurance_policy",
      runtime: { entry: "@voyant-travel/insurance/tools", export: "getInsurancePolicyTool" },
      requiredScopes: ["insurance:read"],
      context: ["insurance"],
      risk: "low",
    },
    {
      id: "@voyant-travel/insurance#tool.retry-insurance-issue",
      name: "retry_insurance_issue",
      runtime: { entry: "@voyant-travel/insurance/tools", export: "retryInsuranceIssueTool" },
      requiredScopes: ["insurance:write"],
      context: ["insurance"],
      risk: "medium",
      adminWrites: ["/v1/admin/insurance/policies/{policyId}/retry-issue"],
    },
    {
      id: "@voyant-travel/insurance#tool.cancel-insurance-policy",
      name: "cancel_insurance_policy",
      runtime: { entry: "@voyant-travel/insurance/tools", export: "cancelInsurancePolicyTool" },
      requiredScopes: ["insurance:write"],
      context: ["insurance"],
      risk: "medium",
      adminWrites: ["/v1/admin/insurance/policies/{policyId}/cancel"],
    },
  ],
  actions: [
    {
      id: "@voyant-travel/insurance#action.get-booking-insurance",
      version: "v1",
      kind: "read",
      targetType: "booking",
      requiredScopes: ["insurance:read"],
      risk: "low",
      ledger: "optional",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/insurance#tool.get-booking-insurance"] },
    },
    {
      id: "@voyant-travel/insurance#action.get-insurance-policy",
      version: "v1",
      kind: "read",
      targetType: "insurance-policy",
      requiredScopes: ["insurance:read"],
      risk: "low",
      ledger: "optional",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/insurance#tool.get-insurance-policy"] },
    },
    {
      id: "@voyant-travel/insurance#action.retry-insurance-issue",
      version: "v1",
      kind: "execute",
      targetType: "insurance-policy",
      commandTargetField: "policyId",
      availability: { status: "available" },
      // The effect lands at the insurer, not in this database.
      effectBoundary: "external",
      targetLifecycle: "existing",
      // A saga, and the reference is what makes that a claim rather than a
      // word: the pending row is written before the insurer is called, and a
      // retry resumes it instead of buying a second policy.
      durability: {
        strategy: "saga",
        testReference: "packages/insurance/tests/integration/durable-issue-command.test.ts",
      },
      requiredScopes: ["insurance:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/insurance#tool.retry-insurance-issue"] },
    },
    {
      id: "@voyant-travel/insurance#action.cancel-insurance-policy",
      version: "v1",
      kind: "execute",
      targetType: "insurance-policy",
      commandTargetField: "policyId",
      availability: { status: "available" },
      effectBoundary: "external",
      targetLifecycle: "existing",
      // The compensating half of the same saga: the row is marked cancelled
      // only after the insurer confirms, because a local row saying "cancelled"
      // over a policy that is still live is the worse of the two errors.
      durability: {
        strategy: "saga",
        testReference: "packages/insurance/tests/integration/durable-issue-command.test.ts",
      },
      requiredScopes: ["insurance:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      // Reinstating a cancelled policy is the insurer's decision, not ours.
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/insurance#tool.cancel-insurance-policy"] },
    },
  ],
  lifecycle: {
    // An issued policy is a contract between a traveller and an insurer, and it
    // survives the module being removed from a deployment. Purging it would
    // destroy the only local record of cover the traveller still holds.
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export default insuranceVoyantModule
