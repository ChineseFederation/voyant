import { customerVerificationChallengeRecordWireSchema } from "@voyant-travel/identity/verification/validation"
import {
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
} from "@voyant-travel/tools"
import { z } from "zod"

import {
  bootstrapCustomerPortalResultSchema,
  bootstrapCustomerPortalSchema,
  createCustomerPortalCompanionSchema,
  createCustomerPortalProfileDocumentSchema,
  customerPortalBookingDetailSchema,
  customerPortalBookingSummarySchema,
  customerPortalCompanionSchema,
  customerPortalProfileDocumentSchema,
  customerPortalProfileSchema,
  importCustomerPortalBookingTravelersResultSchema,
  importCustomerPortalBookingTravelersSchema,
  updateCustomerPortalCompanionSchema,
  updateCustomerPortalProfileDocumentSchema,
  updateCustomerPortalProfileSchema,
} from "./customer-portal/validation-public.js"

const OWNER = "@voyant-travel/public-api"
const CUSTOMER_PORTAL_OWNER = `${OWNER}#customer-portal`
const VERSION = "v1"
const READ_SCOPES = ["public-api:read"] as const
const WRITE_SCOPES = ["public-api:write"] as const
const CUSTOMER_AUDIENCE = { source: "grant", allowed: ["customer"] } as const
const idSchema = z.string().trim().min(1)
const bookingInputSchema = z.object({ bookingId: idSchema })
const updateCompanionInputSchema = z
  .object({ companionId: idSchema })
  .extend(updateCustomerPortalCompanionSchema.shape)
const updateDocumentInputSchema = z
  .object({ documentId: idSchema })
  .extend(updateCustomerPortalProfileDocumentSchema.shape)
const documentIdInputSchema = z.object({ documentId: idSchema })

const _paymentSessionStatusSchema = z.enum([
  "pending",
  "requires_redirect",
  "processing",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "expired",
])

export interface PublicApiCustomerPortalToolServices {
  getProfile(): Promise<z.infer<typeof customerPortalProfileSchema>>
  updateProfile(
    input: z.infer<typeof updateCustomerPortalProfileSchema>,
  ): Promise<z.infer<typeof customerPortalProfileSchema>>
  bootstrap(
    input: z.infer<typeof bootstrapCustomerPortalSchema>,
  ): Promise<z.infer<typeof bootstrapCustomerPortalResultSchema>>
  listBookings(): Promise<z.infer<typeof customerPortalBookingSummarySchema>[]>
  getBooking(bookingId: string): Promise<z.infer<typeof customerPortalBookingDetailSchema>>
  listCompanions(): Promise<z.infer<typeof customerPortalCompanionSchema>[]>
  createCompanion(
    input: z.infer<typeof createCustomerPortalCompanionSchema>,
  ): Promise<z.infer<typeof customerPortalCompanionSchema>>
  updateCompanion(
    companionId: string,
    input: z.infer<typeof updateCustomerPortalCompanionSchema>,
  ): Promise<z.infer<typeof customerPortalCompanionSchema>>
  importBookingTravelers(
    input: z.infer<typeof importCustomerPortalBookingTravelersSchema>,
  ): Promise<z.infer<typeof importCustomerPortalBookingTravelersResultSchema>>
  listDocuments(): Promise<z.infer<typeof customerPortalProfileDocumentSchema>[]>
  createDocument(
    input: z.infer<typeof createCustomerPortalProfileDocumentSchema>,
  ): Promise<z.infer<typeof customerPortalProfileDocumentSchema>>
  updateDocument(
    documentId: string,
    input: z.infer<typeof updateCustomerPortalProfileDocumentSchema>,
  ): Promise<z.infer<typeof customerPortalProfileDocumentSchema>>
  setPrimaryDocument(
    documentId: string,
  ): Promise<z.infer<typeof customerPortalProfileDocumentSchema>>
}

export type PublicApiToolContext = ToolContext & {
  customerVerification?: CustomerVerificationToolServices
  publicApiCustomerPortal?: PublicApiCustomerPortalToolServices
}

function customerPortal(ctx: PublicApiToolContext) {
  if (ctx.actor !== "customer" || ctx.audience !== "customer") {
    throw new ToolError(
      "Customer-portal Tools require the authenticated customer's own grant.",
      "AUTHORIZATION_DENIED",
    )
  }
  return requireService(ctx.publicApiCustomerPortal, "publicApiCustomerPortal")
}

const customerRead = {
  owner: CUSTOMER_PORTAL_OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: CUSTOMER_AUDIENCE,
  tier: "sensitive" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}
const customerWrite = {
  owner: CUSTOMER_PORTAL_OWNER,
  capabilityVersion: VERSION,
  requiredScopes: WRITE_SCOPES,
  audience: CUSTOMER_AUDIENCE,
  tier: "write" as const,
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"] as const,
  },
}

export const getMyCustomerPortalProfileTool = defineTool({
  ...customerRead,
  capabilityId: `${OWNER}#tool.get-my-customer-portal-profile`,
  name: "get_my_customer_portal_profile",
  description: "Read the authenticated customer's own portal profile and linked customer record.",
  inputSchema: z.object({}),
  outputSchema: customerPortalProfileSchema,
  handler: (_input, ctx: PublicApiToolContext) => customerPortal(ctx).getProfile(),
})
export const updateMyCustomerPortalProfileTool = defineTool({
  ...customerWrite,
  capabilityId: `${OWNER}#tool.update-my-customer-portal-profile`,
  name: "update_my_customer_portal_profile",
  description:
    "Update the authenticated customer's own profile. Customer identity is derived from the grant and cannot be overridden.",
  inputSchema: updateCustomerPortalProfileSchema,
  outputSchema: customerPortalProfileSchema,
  handler: (input, ctx: PublicApiToolContext) => customerPortal(ctx).updateProfile(input),
})
export const bootstrapMyCustomerPortalTool = defineTool({
  ...customerWrite,
  capabilityId: `${OWNER}#tool.bootstrap-my-customer-portal`,
  name: "bootstrap_my_customer_portal",
  description:
    "Link or create the authenticated customer's own CRM record using the portal's claim-conflict protections.",
  inputSchema: bootstrapCustomerPortalSchema,
  outputSchema: bootstrapCustomerPortalResultSchema,
  riskPolicy: { ...customerWrite.riskPolicy, reversible: false },
  handler: (input, ctx: PublicApiToolContext) => customerPortal(ctx).bootstrap(input),
})
export const listMyCustomerPortalBookingsTool = defineTool({
  ...customerRead,
  capabilityId: `${OWNER}#tool.list-my-customer-portal-bookings`,
  name: "list_my_customer_portal_bookings",
  description: "List bookings authorized for the authenticated customer.",
  inputSchema: z.object({}),
  outputSchema: z.array(customerPortalBookingSummarySchema),
  handler: (_input, ctx: PublicApiToolContext) => customerPortal(ctx).listBookings(),
})
export const getMyCustomerPortalBookingTool = defineTool({
  ...customerRead,
  capabilityId: `${OWNER}#tool.get-my-customer-portal-booking`,
  name: "get_my_customer_portal_booking",
  description:
    "Read one booking only after the portal service proves it belongs to the authenticated customer.",
  inputSchema: bookingInputSchema,
  outputSchema: customerPortalBookingDetailSchema,
  handler: ({ bookingId }, ctx: PublicApiToolContext) => customerPortal(ctx).getBooking(bookingId),
})
export const listMyCustomerPortalCompanionsTool = defineTool({
  ...customerRead,
  capabilityId: `${OWNER}#tool.list-my-customer-portal-companions`,
  name: "list_my_customer_portal_companions",
  description: "List saved companions belonging to the authenticated customer.",
  inputSchema: z.object({}),
  outputSchema: z.array(customerPortalCompanionSchema),
  handler: (_input, ctx: PublicApiToolContext) => customerPortal(ctx).listCompanions(),
})
export const createMyCustomerPortalCompanionTool = defineTool({
  ...customerWrite,
  capabilityId: `${OWNER}#tool.create-my-customer-portal-companion`,
  name: "create_my_customer_portal_companion",
  description: "Create a saved companion under the authenticated customer's linked record.",
  inputSchema: createCustomerPortalCompanionSchema,
  outputSchema: customerPortalCompanionSchema,
  handler: (input, ctx: PublicApiToolContext) => customerPortal(ctx).createCompanion(input),
})
export const updateMyCustomerPortalCompanionTool = defineTool({
  ...customerWrite,
  capabilityId: `${OWNER}#tool.update-my-customer-portal-companion`,
  name: "update_my_customer_portal_companion",
  description: "Update a saved companion only after the portal service proves customer ownership.",
  inputSchema: updateCompanionInputSchema,
  outputSchema: customerPortalCompanionSchema,
  handler: ({ companionId, ...input }, ctx: PublicApiToolContext) =>
    customerPortal(ctx).updateCompanion(companionId, input),
})
export const importMyBookingTravelersAsCompanionsTool = defineTool({
  ...customerWrite,
  capabilityId: `${OWNER}#tool.import-my-booking-travelers-as-companions`,
  name: "import_my_booking_travelers_as_companions",
  description:
    "Import travelers only from bookings already authorized for the authenticated customer.",
  inputSchema: importCustomerPortalBookingTravelersSchema,
  outputSchema: importCustomerPortalBookingTravelersResultSchema,
  handler: (input, ctx: PublicApiToolContext) => customerPortal(ctx).importBookingTravelers(input),
})
export const listMyCustomerPortalDocumentsTool = defineTool({
  ...customerRead,
  capabilityId: `${OWNER}#tool.list-my-customer-portal-documents`,
  name: "list_my_customer_portal_documents",
  description: "List the authenticated customer's decrypted identity-document projections.",
  inputSchema: z.object({}),
  outputSchema: z.array(customerPortalProfileDocumentSchema),
  handler: (_input, ctx: PublicApiToolContext) => customerPortal(ctx).listDocuments(),
})
export const createMyCustomerPortalDocumentTool = defineTool({
  ...customerWrite,
  capabilityId: `${OWNER}#tool.create-my-customer-portal-document`,
  name: "create_my_customer_portal_document",
  description:
    "Create an encrypted identity document for the authenticated customer's own linked person.",
  inputSchema: createCustomerPortalProfileDocumentSchema,
  outputSchema: customerPortalProfileDocumentSchema,
  handler: (input, ctx: PublicApiToolContext) => customerPortal(ctx).createDocument(input),
})
export const updateMyCustomerPortalDocumentTool = defineTool({
  ...customerWrite,
  capabilityId: `${OWNER}#tool.update-my-customer-portal-document`,
  name: "update_my_customer_portal_document",
  description:
    "Update an identity document only after the portal service proves customer ownership.",
  inputSchema: updateDocumentInputSchema,
  outputSchema: customerPortalProfileDocumentSchema,
  handler: ({ documentId, ...input }, ctx: PublicApiToolContext) =>
    customerPortal(ctx).updateDocument(documentId, input),
})
export const setMyPrimaryCustomerPortalDocumentTool = defineTool({
  ...customerWrite,
  capabilityId: `${OWNER}#tool.set-my-primary-customer-portal-document`,
  name: "set_my_primary_customer_portal_document",
  description: "Mark one owned identity document as the authenticated customer's primary document.",
  inputSchema: documentIdInputSchema,
  outputSchema: customerPortalProfileDocumentSchema,
  handler: ({ documentId }, ctx: PublicApiToolContext) =>
    customerPortal(ctx).setPrimaryDocument(documentId),
})

export const publicApiCustomerPortalTools = [
  getMyCustomerPortalProfileTool,
  updateMyCustomerPortalProfileTool,
  bootstrapMyCustomerPortalTool,
  listMyCustomerPortalBookingsTool,
  getMyCustomerPortalBookingTool,
  listMyCustomerPortalCompanionsTool,
  createMyCustomerPortalCompanionTool,
  updateMyCustomerPortalCompanionTool,
  importMyBookingTravelersAsCompanionsTool,
  listMyCustomerPortalDocumentsTool,
  createMyCustomerPortalDocumentTool,
  updateMyCustomerPortalDocumentTool,
  setMyPrimaryCustomerPortalDocumentTool,
] as const

const verificationStartInputSchema = z.object({
  locale: z.string().trim().min(2).max(16).nullable().optional(),
})
const verificationConfirmInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/),
})
export interface CustomerVerificationToolServices {
  startEmail(
    input: z.infer<typeof verificationStartInputSchema>,
  ): Promise<z.infer<typeof customerVerificationChallengeRecordWireSchema>>
  confirmEmail(
    input: z.infer<typeof verificationConfirmInputSchema>,
  ): Promise<z.infer<typeof customerVerificationChallengeRecordWireSchema>>
  startSms(
    input: z.infer<typeof verificationStartInputSchema>,
  ): Promise<z.infer<typeof customerVerificationChallengeRecordWireSchema>>
  confirmSms(
    input: z.infer<typeof verificationConfirmInputSchema>,
  ): Promise<z.infer<typeof customerVerificationChallengeRecordWireSchema>>
}
function verification(ctx: PublicApiToolContext) {
  if (ctx.actor !== "customer" || ctx.audience !== "customer") {
    throw new ToolError(
      "Verification Tools require the authenticated customer's own grant.",
      "AUTHORIZATION_DENIED",
    )
  }
  return requireService(ctx.customerVerification, "customerVerification")
}
const verificationReadWrite = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: WRITE_SCOPES,
  audience: CUSTOMER_AUDIENCE,
  tier: "write" as const,
}
const startVerificationRisk = {
  destructive: false,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: true,
}
export const startMyEmailVerificationTool = defineTool({
  ...verificationReadWrite,
  capabilityId: `${OWNER}#tool.start-my-email-verification`,
  name: "start_my_email_verification",
  description:
    "Send a contact-confirmation challenge to the authenticated customer's own account email. Destination and purpose cannot be overridden.",
  inputSchema: verificationStartInputSchema,
  outputSchema: customerVerificationChallengeRecordWireSchema,
  riskPolicy: { ...startVerificationRisk, sideEffects: ["data-write", "email"] },
  handler: (input, ctx: PublicApiToolContext) => verification(ctx).startEmail(input),
})
export const confirmMyEmailVerificationTool = defineTool({
  ...verificationReadWrite,
  capabilityId: `${OWNER}#tool.confirm-my-email-verification`,
  name: "confirm_my_email_verification",
  description:
    "Confirm the latest contact-confirmation challenge for the authenticated customer's own email.",
  inputSchema: verificationConfirmInputSchema,
  outputSchema: customerVerificationChallengeRecordWireSchema,
  riskPolicy: {
    ...startVerificationRisk,
    confirmationRequired: false,
    sideEffects: ["data-write"],
  },
  handler: (input, ctx: PublicApiToolContext) => verification(ctx).confirmEmail(input),
})
export const startMySmsVerificationTool = defineTool({
  ...verificationReadWrite,
  capabilityId: `${OWNER}#tool.start-my-sms-verification`,
  name: "start_my_sms_verification",
  description:
    "Send a contact-confirmation challenge to the authenticated customer's own account phone. Destination and purpose cannot be overridden.",
  inputSchema: verificationStartInputSchema,
  outputSchema: customerVerificationChallengeRecordWireSchema,
  riskPolicy: { ...startVerificationRisk, sideEffects: ["data-write", "sms"] },
  handler: (input, ctx: PublicApiToolContext) => verification(ctx).startSms(input),
})
export const confirmMySmsVerificationTool = defineTool({
  ...verificationReadWrite,
  capabilityId: `${OWNER}#tool.confirm-my-sms-verification`,
  name: "confirm_my_sms_verification",
  description:
    "Confirm the latest contact-confirmation challenge for the authenticated customer's own phone.",
  inputSchema: verificationConfirmInputSchema,
  outputSchema: customerVerificationChallengeRecordWireSchema,
  riskPolicy: {
    ...startVerificationRisk,
    confirmationRequired: false,
    sideEffects: ["data-write"],
  },
  handler: (input, ctx: PublicApiToolContext) => verification(ctx).confirmSms(input),
})
export const publicApiCustomerVerificationTools = [
  startMyEmailVerificationTool,
  confirmMyEmailVerificationTool,
  startMySmsVerificationTool,
  confirmMySmsVerificationTool,
] as const
