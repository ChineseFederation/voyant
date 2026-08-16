import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
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
import { publicApiVerificationChallengeRecordWireSchema } from "./verification/validation.js"

const OWNER = "@voyant-travel/public-api"
const CUSTOMER_PORTAL_OWNER = `${OWNER}#customer-portal`
const PAYMENT_LINK_OWNER = `${OWNER}#payment-link`
const VERIFICATION_OWNER = `${OWNER}#verification`
const VERSION = "v1"
const READ_SCOPES = ["public-api:read"] as const
const WRITE_SCOPES = ["public-api:write"] as const
const CUSTOMER_AUDIENCE = { source: "grant", allowed: ["customer"] } as const
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const idSchema = z.string().trim().min(1)
const bookingInputSchema = z.object({ bookingId: idSchema })
const updateCompanionInputSchema = z
  .object({ companionId: idSchema })
  .extend(updateCustomerPortalCompanionSchema.shape)
const updateDocumentInputSchema = z
  .object({ documentId: idSchema })
  .extend(updateCustomerPortalProfileDocumentSchema.shape)
const documentIdInputSchema = z.object({ documentId: idSchema })

const paymentSessionStatusSchema = z.enum([
  "pending",
  "requires_redirect",
  "processing",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "expired",
])
const paymentLinkSchema = z.object({
  id: z.string(),
  status: paymentSessionStatusSchema,
  invoiceId: z.string().nullable(),
  bookingId: z.string().nullable(),
  currency: z.string(),
  amountCents: z.number().int(),
  paymentMethod: z.string().nullable(),
  provider: z.string().nullable(),
  redirectUrl: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  paymentUrl: z.string().min(1),
})
const createInvoicePaymentLinkInputSchema = z.object({
  invoiceId: idSchema,
  idempotencyKey: z.string().trim().min(1).max(255),
  provider: z.string().trim().min(1).max(255).nullable().optional(),
  paymentMethod: z
    .enum([
      "bank_transfer",
      "credit_card",
      "debit_card",
      "cash",
      "cheque",
      "wallet",
      "direct_bill",
      "travel_credit",
      "other",
    ])
    .nullable()
    .optional(),
  returnUrl: z.string().url().nullable().optional(),
  cancelUrl: z.string().url().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})
const getPaymentLinkInputSchema = z.object({ sessionId: idSchema })
const verificationStartInputSchema = z.object({
  locale: z.string().trim().min(2).max(16).nullable().optional(),
})
const verificationConfirmInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/),
})

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

export interface PublicApiPaymentLinkToolServices {
  createFromInvoice(
    input: z.infer<typeof createInvoicePaymentLinkInputSchema>,
    admitted: import("@voyant-travel/tools").ToolHandlerActionPolicyContext,
  ): Promise<z.infer<typeof paymentLinkSchema>>
  get(sessionId: string): Promise<z.infer<typeof paymentLinkSchema>>
}

export interface PublicApiVerificationToolServices {
  startEmail(
    input: z.infer<typeof verificationStartInputSchema>,
  ): Promise<z.infer<typeof publicApiVerificationChallengeRecordWireSchema>>
  confirmEmail(
    input: z.infer<typeof verificationConfirmInputSchema>,
  ): Promise<z.infer<typeof publicApiVerificationChallengeRecordWireSchema>>
  startSms(
    input: z.infer<typeof verificationStartInputSchema>,
  ): Promise<z.infer<typeof publicApiVerificationChallengeRecordWireSchema>>
  confirmSms(
    input: z.infer<typeof verificationConfirmInputSchema>,
  ): Promise<z.infer<typeof publicApiVerificationChallengeRecordWireSchema>>
}

export type PublicApiToolContext = ToolContext & {
  publicApiCustomerPortal?: PublicApiCustomerPortalToolServices
  publicApiPaymentLink?: PublicApiPaymentLinkToolServices
  publicApiVerification?: PublicApiVerificationToolServices
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

function paymentLink(ctx: PublicApiToolContext) {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError("Payment-link Tools require a staff grant.", "AUTHORIZATION_DENIED")
  }
  return requireService(ctx.publicApiPaymentLink, "publicApiPaymentLink")
}

function verification(ctx: PublicApiToolContext) {
  if (ctx.actor !== "customer" || ctx.audience !== "customer") {
    throw new ToolError(
      "Verification Tools require the authenticated customer's own grant.",
      "AUTHORIZATION_DENIED",
    )
  }
  return requireService(ctx.publicApiVerification, "publicApiVerification")
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

const staffPaymentRead = {
  owner: PAYMENT_LINK_OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "sensitive" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}
export const getPaymentLinkTool = defineTool({
  ...staffPaymentRead,
  capabilityId: `${OWNER}#tool.get-payment-link`,
  name: "get_payment_link",
  description: "Inspect one payment link using a staff grant without exposing provider payloads.",
  inputSchema: getPaymentLinkInputSchema,
  outputSchema: paymentLinkSchema,
  handler: ({ sessionId }, ctx: PublicApiToolContext) => paymentLink(ctx).get(sessionId),
})
export const CREATE_INVOICE_PAYMENT_LINK_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.create-invoice-payment-link`,
  capabilityVersion: VERSION,
  canonicalName: "create_invoice_payment_link",
  actionPolicy: {
    id: `${OWNER}#action.create-invoice-payment-link`,
    capabilityId: `${OWNER}#action.create-invoice-payment-link`,
    version: VERSION,
    kind: "execute",
    targetType: "invoice",
    commandTargetField: "invoiceId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: true,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const createInvoicePaymentLinkTool = defineTool({
  owner: PAYMENT_LINK_OWNER,
  capabilityVersion: VERSION,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  capabilityId: `${OWNER}#tool.create-invoice-payment-link`,
  name: "create_invoice_payment_link",
  description:
    "Create an idempotent payment link for an invoice's authoritative outstanding balance. Amount and currency cannot be overridden.",
  inputSchema: createInvoicePaymentLinkInputSchema,
  outputSchema: paymentLinkSchema,
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  handler: (input, ctx: PublicApiToolContext) =>
    paymentLink(ctx).createFromInvoice(
      input,
      admitHandlerActionPolicy(ctx, CREATE_INVOICE_PAYMENT_LINK_HANDLER_POLICY),
    ),
})

const verificationReadWrite = {
  owner: VERIFICATION_OWNER,
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
  outputSchema: publicApiVerificationChallengeRecordWireSchema,
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
  outputSchema: publicApiVerificationChallengeRecordWireSchema,
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
  outputSchema: publicApiVerificationChallengeRecordWireSchema,
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
  outputSchema: publicApiVerificationChallengeRecordWireSchema,
  riskPolicy: {
    ...startVerificationRisk,
    confirmationRequired: false,
    sideEffects: ["data-write"],
  },
  handler: (input, ctx: PublicApiToolContext) => verification(ctx).confirmSms(input),
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
export const publicApiPaymentLinkTools = [getPaymentLinkTool, createInvoicePaymentLinkTool] as const
export const publicApiVerificationTools = [
  startMyEmailVerificationTool,
  confirmMyEmailVerificationTool,
  startMySmsVerificationTool,
  confirmMySmsVerificationTool,
] as const
