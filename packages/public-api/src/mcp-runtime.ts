import { executeAdmittedExistingTargetCommand } from "@voyant-travel/action-ledger"
import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger/request-context"
import { buildConfiguredPaymentLinkUrl, financeService } from "@voyant-travel/finance"
import {
  type CustomerBuyerContext,
  type CustomerIdentityContext,
  requireCustomerBuyerContext,
  requireCustomerIdentityContext,
} from "@voyant-travel/hono"
import { customerVerificationRuntimePort } from "@voyant-travel/identity/runtime-port"
import {
  buildCustomerVerificationSenders,
  type CustomerVerificationRoutesOptions,
  enforceVerificationStartLimits,
} from "@voyant-travel/identity/verification/public-routes"
import {
  CustomerVerificationError,
  createCustomerVerificationService,
} from "@voyant-travel/identity/verification/service"
import {
  defineToolContextContribution,
  requireService,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { buildPublicCustomerPortalRouteRuntime } from "./customer-portal/route-runtime.js"
import type { PublicCustomerPortalRouteOptions } from "./customer-portal/routes-public.js"
import { publicCustomerPortalService } from "./customer-portal/service-public.js"
import type { PaymentLinkRoutesOptions } from "./payment-link/routes.js"
import {
  publicApiCustomerPortalRuntimePort,
  publicApiPaymentLinkRuntimePort,
} from "./runtime-port.js"
import type {
  CustomerVerificationToolServices,
  PublicApiCustomerPortalToolServices,
  PublicApiPaymentLinkToolServices,
} from "./tools.js"

export * from "./tools.js"

type PublicApiMcpContext = Context<{
  Bindings: Record<string, unknown>
  Variables: { db?: PostgresJsDatabase; userId?: string }
}>

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["publicApiCustomerPortal", "publicApiPaymentLink", "customerVerification"],
  async contribute({ request, context, resources }) {
    const c = request as PublicApiMcpContext
    const db = requireService((c.get("db") ?? context.db) as PostgresJsDatabase | undefined, "db")
    const customerPortalOptions = resources[publicApiCustomerPortalRuntimePort.id] as
      | PublicCustomerPortalRouteOptions
      | undefined
    const paymentLinkOptions = resources[publicApiPaymentLinkRuntimePort.id] as
      | PaymentLinkRoutesOptions
      | undefined
    const verificationOptions = resources[customerVerificationRuntimePort.id] as
      | CustomerVerificationRoutesOptions
      | undefined
    const portalRuntime = buildPublicCustomerPortalRouteRuntime(c.env, customerPortalOptions)

    return {
      publicApiCustomerPortal: createCustomerPortalToolServices({
        db,
        identity: () => requireToolCustomerIdentity(c),
        buyer: () => requireToolCustomerBuyer(c),
        runtime: portalRuntime,
      }),
      ...(paymentLinkOptions
        ? {
            publicApiPaymentLink: createPaymentLinkToolServices({
              db,
              request: c,
              runtime: paymentLinkOptions,
            }),
          }
        : {}),
      ...(verificationOptions
        ? {
            customerVerification: createVerificationToolServices({
              db,
              request: c,
              userId: () => requireCustomerUserId(c),
              options: verificationOptions,
            }),
          }
        : {}),
    }
  },
})

function requireCustomerUserId(c: PublicApiMcpContext): string {
  const userId = c.get("userId")?.trim()
  if (!userId) {
    throw new ToolError(
      "Customer self-service Tools require an authenticated user identity from the grant.",
      "AUTHORIZATION_DENIED",
    )
  }
  return userId
}

function requireToolCustomerIdentity(c: PublicApiMcpContext): CustomerIdentityContext {
  try {
    return requireCustomerIdentityContext(c)
  } catch {
    throw new ToolError(
      "Customer self-service Tools require an authenticated customer identity.",
      "AUTHORIZATION_DENIED",
    )
  }
}

function requireToolCustomerBuyer(c: PublicApiMcpContext): CustomerBuyerContext {
  try {
    return requireCustomerBuyerContext(c)
  } catch {
    throw new ToolError(
      "Customer self-service Tools require an active buyer account.",
      "AUTHORIZATION_DENIED",
    )
  }
}

export function createCustomerPortalToolServices(input: {
  db: PostgresJsDatabase
  identity: () => CustomerIdentityContext
  buyer: () => CustomerBuyerContext
  runtime: ReturnType<typeof buildPublicCustomerPortalRouteRuntime>
}): PublicApiCustomerPortalToolServices {
  const options = {
    kms: input.runtime.getOptionalKmsProvider(),
    resolveDocumentDownloadUrl: input.runtime.resolveDocumentDownloadUrl,
  }
  const userId = () => input.identity().userId

  return {
    async getProfile() {
      const profile = await publicCustomerPortalService.getProfileWithOptions(
        input.db,
        userId(),
        options,
      )
      if (!profile) throw new ToolError("Customer profile was not found.", "NOT_FOUND")
      return profile
    },
    async updateProfile(update) {
      const result = await publicCustomerPortalService.updateProfileWithOptions(
        input.db,
        userId(),
        update,
        options,
      )
      if ("error" in result) {
        throw new ToolError(
          result.error === "not_found"
            ? "Customer profile was not found."
            : "A linked customer record is required for this profile update.",
          result.error === "not_found" ? "NOT_FOUND" : "INVALID_INPUT",
        )
      }
      return result.profile
    },
    async bootstrap(command) {
      const result = await publicCustomerPortalService.bootstrap(input.db, userId(), command)
      if ("error" in result) {
        const notFound =
          result.error === "not_found" || result.error === "customer_record_not_found"
        throw new ToolError(
          result.error === "customer_record_claimed"
            ? "The selected customer record is already linked to another account."
            : "Customer profile or selected customer record was not found.",
          notFound ? "NOT_FOUND" : "AUTHORIZATION_DENIED",
        )
      }
      return result
    },
    async listBookings() {
      const rows = await publicCustomerPortalService.listBookings(input.db, input.buyer())
      if (!rows) throw new ToolError("Customer profile was not found.", "NOT_FOUND")
      return rows
    },
    async getBooking(bookingId) {
      const booking = await publicCustomerPortalService.getBooking(
        input.db,
        input.buyer(),
        bookingId,
        options,
      )
      if (!booking) {
        throw new ToolError(
          "Booking was not found or is not owned by this customer.",
          "NOT_FOUND",
          {
            bookingId,
          },
        )
      }
      return booking
    },
    listCompanions() {
      return publicCustomerPortalService.listCompanions(input.db, userId())
    },
    async createCompanion(command) {
      const row = await publicCustomerPortalService.createCompanion(input.db, userId(), command)
      if (!row) {
        throw new ToolError(
          "A linked customer record is required to create companions.",
          "INVALID_INPUT",
        )
      }
      return row
    },
    async updateCompanion(companionId, command) {
      const row = await publicCustomerPortalService.updateCompanion(
        input.db,
        userId(),
        companionId,
        command,
      )
      if (row === "forbidden") {
        throw new ToolError("Companion does not belong to this customer.", "AUTHORIZATION_DENIED", {
          companionId,
        })
      }
      if (!row) throw new ToolError("Companion was not found.", "NOT_FOUND", { companionId })
      return row
    },
    async importBookingTravelers(command) {
      const buyer = input.buyer()
      if (buyer.kind !== "personal") {
        throw new ToolError(
          "Importing travelers as personal companions requires a personal buyer account.",
          "AUTHORIZATION_DENIED",
        )
      }
      const result = await publicCustomerPortalService.importBookingTravelersAsCompanions(
        input.db,
        buyer,
        command,
      )
      if (!result) {
        throw new ToolError(
          "A linked customer record is required to import companions.",
          "INVALID_INPUT",
        )
      }
      return result
    },
    listDocuments() {
      return publicCustomerPortalService.listMyDocuments(input.db, userId(), options)
    },
    async createDocument(command) {
      const row = await publicCustomerPortalService.createMyDocument(
        input.db,
        userId(),
        command,
        options,
      )
      if (!row) throw new ToolError("Customer profile was not found.", "NOT_FOUND")
      return row
    },
    async updateDocument(documentId, command) {
      const row = await publicCustomerPortalService.updateMyDocument(
        input.db,
        userId(),
        documentId,
        command,
        options,
      )
      if (!row) {
        throw new ToolError(
          "Identity document was not found or is not owned by this customer.",
          "NOT_FOUND",
          {
            documentId,
          },
        )
      }
      return row
    },
    async setPrimaryDocument(documentId) {
      const row = await publicCustomerPortalService.setPrimaryMyDocument(
        input.db,
        userId(),
        documentId,
        options,
      )
      if (!row) {
        throw new ToolError(
          "Identity document was not found or is not owned by this customer.",
          "NOT_FOUND",
          {
            documentId,
          },
        )
      }
      return row
    },
  }
}

export function createPaymentLinkToolServices(input: {
  db: PostgresJsDatabase
  request: Context
  runtime: PaymentLinkRoutesOptions
}): PublicApiPaymentLinkToolServices {
  const toDto = async (row: Awaited<ReturnType<typeof financeService.getPaymentSessionById>>) => {
    if (!row) throw new ToolError("Payment link was not found.", "NOT_FOUND")
    const paymentUrl = buildConfiguredPaymentLinkUrl(row.id, {
      paymentLinkUrlTemplate:
        (await input.runtime.resolvePaymentLinkUrlTemplate?.(input.request)) ?? null,
      publicCheckoutBaseUrl: input.runtime.resolvePublicCheckoutBaseUrl(input.request),
    })
    if (!paymentUrl) {
      throw new ToolError("The customer payment-link URL is not configured.", "MISSING_SERVICE")
    }
    return {
      id: row.id,
      status: row.status,
      invoiceId: row.invoiceId,
      bookingId: row.bookingId,
      currency: row.currency,
      amountCents: row.amountCents,
      paymentMethod: row.paymentMethod,
      provider: row.provider,
      redirectUrl: row.redirectUrl,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      paymentUrl,
    }
  }

  return {
    async createFromInvoice({ invoiceId, ...command }, admitted) {
      let created: Awaited<ReturnType<typeof financeService.createPaymentSessionFromInvoice>>
      const result = await executeAdmittedExistingTargetCommand(
        {
          db: input.db,
          context: actionLedgerContext(input.request),
          admitted: admitted as ToolHandlerActionPolicyContext,
          commandInput: { invoiceId, ...command },
          evaluatedRisk: "high",
        },
        {
          async prepare(tx) {
            created = await financeService.createPaymentSessionFromInvoice(
              tx as PostgresJsDatabase,
              invoiceId,
              command,
            )
            if (!created) {
              throw new ToolError(`Invoice "${invoiceId}" was not found.`, "NOT_FOUND", {
                invoiceId,
              })
            }
          },
          execute() {
            if (!created) throw new Error("Payment link creation produced no session")
            return toDto(created)
          },
          async replay() {
            const page = await financeService.listPaymentSessions(input.db, {
              invoiceId,
              idempotencyKey: command.idempotencyKey,
              limit: 2,
              offset: 0,
            })
            const row = page.data[0]
            if (!row) throw new ToolError("Payment link was not found.", "NOT_FOUND")
            return toDto(row)
          },
        },
      )
      return result.value
    },
    async get(sessionId) {
      return toDto(await financeService.getPaymentSessionById(input.db, sessionId))
    },
  }
}

function actionLedgerContext(c: Context): ActionLedgerRequestContextValues {
  const vars = c.var as Record<string, unknown>
  return {
    userId: (vars.userId as string | undefined) ?? null,
    agentId: (vars.agentId as string | undefined) ?? null,
    workflowPrincipalId: (vars.workflowPrincipalId as string | undefined) ?? null,
    principalSubtype: (vars.principalSubtype as string | undefined) ?? null,
    sessionId: (vars.sessionId as string | undefined) ?? null,
    apiTokenId: ((vars.apiTokenId ?? vars.apiKeyId) as string | undefined) ?? null,
    callerType: (vars.callerType as ActionLedgerRequestContextValues["callerType"]) ?? null,
    actor: (vars.actor as ActionLedgerRequestContextValues["actor"]) ?? null,
    isInternalRequest: (vars.isInternalRequest as boolean | undefined) ?? false,
    organizationId: (vars.organizationId as string | undefined) ?? null,
    workflowRunId: (vars.workflowRunId as string | undefined) ?? null,
    workflowStepId: (vars.workflowStepId as string | undefined) ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

export function createVerificationToolServices(input: {
  db: PostgresJsDatabase
  request: PublicApiMcpContext
  userId: () => string
  options: CustomerVerificationRoutesOptions
}): CustomerVerificationToolServices {
  const service = createCustomerVerificationService(input.options)
  const senders = buildCustomerVerificationSenders(input.request.env, input.options)
  const destination = async (channel: "email" | "sms") => {
    const profile = await publicCustomerPortalService.getProfile(input.db, input.userId())
    const value = channel === "email" ? profile?.email : profile?.phoneNumber
    if (!value) {
      throw new ToolError(
        `The authenticated customer has no ${channel === "email" ? "email" : "phone"} destination.`,
        "INVALID_INPUT",
      )
    }
    return value
  }
  const wire = (record: {
    id: string
    channel: "email" | "sms"
    destination: string
    purpose: string
    status: "pending" | "verified" | "expired" | "failed" | "cancelled"
    expiresAt: Date
    verifiedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }) => ({
    ...record,
    expiresAt: record.expiresAt.toISOString(),
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
  const enforceStartLimit = async (channel: "email" | "sms", value: string) => {
    const limited = await enforceVerificationStartLimits(input.request as never, channel, value)
    if (limited) {
      throw new ToolError("Verification challenge rate limit exceeded.", "PROVIDER_UNAVAILABLE", {
        retryAfter: limited.headers.get("retry-after"),
      })
    }
  }
  const mapVerificationError = (error: unknown): never => {
    if (error instanceof ToolError) throw error
    if (error instanceof CustomerVerificationError) {
      const code =
        error.code === "sender_not_configured"
          ? "MISSING_SERVICE"
          : error.code === "challenge_not_found"
            ? "NOT_FOUND"
            : "INVALID_INPUT"
      throw new ToolError(error.message, code, { verificationCode: error.code })
    }
    throw error
  }

  return {
    async startEmail({ locale }) {
      try {
        const email = await destination("email")
        await enforceStartLimit("email", email)
        return wire(
          await service.startEmailChallenge(
            input.db,
            { email, purpose: "contact_confirmation", locale },
            senders,
          ),
        )
      } catch (error) {
        return mapVerificationError(error)
      }
    },
    async confirmEmail({ code }) {
      try {
        const email = await destination("email")
        return wire(
          await service.confirmEmailChallenge(input.db, {
            email,
            code,
            purpose: "contact_confirmation",
          }),
        )
      } catch (error) {
        return mapVerificationError(error)
      }
    },
    async startSms({ locale }) {
      try {
        const phone = await destination("sms")
        await enforceStartLimit("sms", phone)
        return wire(
          await service.startSmsChallenge(
            input.db,
            { phone, purpose: "contact_confirmation", locale },
            senders,
          ),
        )
      } catch (error) {
        return mapVerificationError(error)
      }
    },
    async confirmSms({ code }) {
      try {
        const phone = await destination("sms")
        return wire(
          await service.confirmSmsChallenge(input.db, {
            phone,
            code,
            purpose: "contact_confirmation",
          }),
        )
      } catch (error) {
        return mapVerificationError(error)
      }
    },
  }
}
