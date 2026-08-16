import {
  type CustomerBusinessAccountCreateInput,
  type CustomerBusinessAccountDto,
  type CustomerBusinessAccountRequestDto,
  type CustomerBusinessInvitationAcceptInput,
  type CustomerBusinessInvitationAcceptResult,
  customerBusinessAccountRequestSchema,
  customerBusinessAccountSchema,
  customerBusinessInvitationAcceptResultSchema,
} from "@voyant-travel/auth/customer-business-accounts"
import { z } from "zod"

export type CustomerAuthFetcher = (url: string, init?: RequestInit) => Promise<Response>

const accountPolicySchema = z.object({
  allowedKinds: z.array(z.enum(["personal", "business"])),
  personalSignup: z.enum(["open", "disabled"]),
  businessOnboarding: z.enum(["disabled", "open", "request", "invite-only"]),
})

const customerAuthConfigSchema = z.union([
  z.object({
    disabled: z.literal(true),
    methods: z.object({
      emailCode: z.literal(false),
      emailPassword: z.literal(false),
      google: z.literal(false),
      facebook: z.literal(false),
      apple: z.literal(false),
    }),
  }),
  z.object({
    disabled: z.literal(false).optional().default(false),
    methods: z.object({
      emailCode: z.boolean(),
      emailPassword: z.boolean(),
      google: z.boolean(),
      facebook: z.boolean(),
      apple: z.boolean(),
    }),
    accountPolicy: accountPolicySchema,
  }),
])

const buyerAccountBase = z.object({ id: z.string(), name: z.string() })
const personalBuyerAccountSchema = buyerAccountBase.extend({
  kind: z.literal("personal"),
  authOrganizationId: z.null(),
  relationshipOrganizationId: z.null(),
  relationshipPersonId: z.string().nullable(),
  membershipId: z.null(),
  membershipRole: z.null(),
})
const businessBuyerAccountSchema = buyerAccountBase.extend({
  kind: z.literal("business"),
  authOrganizationId: z.string(),
  relationshipOrganizationId: z.string(),
  relationshipPersonId: z.null(),
  membershipId: z.string(),
  membershipRole: z.string(),
})
export const customerBuyerAccountSchema = z.discriminatedUnion("kind", [
  personalBuyerAccountSchema,
  businessBuyerAccountSchema,
])

const buyerAccountListSchema = z.object({
  accounts: z.array(customerBuyerAccountSchema),
  activeAccount: customerBuyerAccountSchema.nullable(),
  policy: accountPolicySchema,
  requiresSelection: z.boolean(),
})
const selectedBuyerAccountSchema = z.object({ activeAccount: customerBuyerAccountSchema })
const customerSessionSchema = z
  .object({
    session: z.object({ id: z.string(), userId: z.string() }).passthrough(),
    user: z.object({ id: z.string() }).passthrough(),
  })
  .passthrough()
  .nullable()

export type CustomerAuthConfiguration = z.infer<typeof customerAuthConfigSchema>
export type CustomerBuyerAccount = z.infer<typeof customerBuyerAccountSchema>
export type CustomerBuyerAccountList = z.infer<typeof buyerAccountListSchema>
export type CustomerAuthSession = z.infer<typeof customerSessionSchema>
export interface CustomerAuthResponse<T> {
  data: T
  /** Preserve this response's headers when proxying from an SSR action/BFF. */
  response: Response
}

export interface CreateCustomerAuthClientOptions {
  /** Browser-visible same-origin BFF/API base, normally `/api`. */
  baseUrl: string
  fetcher?: CustomerAuthFetcher
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error =
      body && typeof body === "object" && "error" in body
        ? (body as { error: unknown }).error
        : null
    const message =
      typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : `Customer auth request failed (${response.status})`
    throw new Error(message)
  }
  return schema.parse(body)
}

async function readWithResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<CustomerAuthResponse<T>> {
  return { data: await read(response, schema), response }
}

/** Framework-neutral customer auth/account client for Next.js, Astro SSR, and BFFs. */
export function createCustomerAuthClient(options: CreateCustomerAuthClientOptions) {
  const rawFetcher = options.fetcher ?? fetch
  const fetcher: CustomerAuthFetcher = (url, init) =>
    rawFetcher(url, { ...init, credentials: "include" })
  const createBusinessAccountWithResponse = async (
    input: CustomerBusinessAccountCreateInput,
  ): Promise<CustomerAuthResponse<CustomerBusinessAccountDto>> =>
    readWithResponse(
      await fetcher(joinUrl(options.baseUrl, "/auth/customer/business-accounts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
      customerBusinessAccountSchema,
    )
  const acceptBusinessInvitationWithResponse = async (
    input: CustomerBusinessInvitationAcceptInput,
  ): Promise<CustomerAuthResponse<CustomerBusinessInvitationAcceptResult>> =>
    readWithResponse(
      await fetcher(
        joinUrl(options.baseUrl, "/auth/customer/business-account-invitations/accept"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
      customerBusinessInvitationAcceptResultSchema,
    )

  return {
    /**
     * Low-level same-origin auth proxy for Better Auth endpoints not modeled by
     * this account client (for example sign-in/sign-up). SSR callers must
     * forward every `Set-Cookie` header from the returned response.
     */
    request(path: string, init?: RequestInit): Promise<Response> {
      const normalizedPath = path.startsWith("/") ? path : `/${path}`
      return fetcher(joinUrl(options.baseUrl, `/auth/customer${normalizedPath}`), init)
    },
    async getConfiguration(): Promise<CustomerAuthConfiguration> {
      return read(
        await fetcher(joinUrl(options.baseUrl, "/auth/customer/config"), { method: "GET" }),
        customerAuthConfigSchema,
      )
    },
    async getSession(): Promise<CustomerAuthSession> {
      return read(
        await fetcher(joinUrl(options.baseUrl, "/auth/customer/get-session"), { method: "GET" }),
        customerSessionSchema,
      )
    },
    async listBuyerAccounts(): Promise<CustomerBuyerAccountList> {
      return read(
        await fetcher(joinUrl(options.baseUrl, "/auth/customer/buyer-accounts"), {
          method: "GET",
        }),
        buyerAccountListSchema,
      )
    },
    async selectBuyerAccount(accountId: string): Promise<CustomerBuyerAccount> {
      const result = await read(
        await fetcher(joinUrl(options.baseUrl, "/auth/customer/buyer-accounts/active"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId }),
        }),
        selectedBuyerAccountSchema,
      )
      return result.activeAccount
    },
    async selectBuyerAccountWithResponse(
      accountId: string,
    ): Promise<CustomerAuthResponse<CustomerBuyerAccount>> {
      const result = await readWithResponse(
        await fetcher(joinUrl(options.baseUrl, "/auth/customer/buyer-accounts/active"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId }),
        }),
        selectedBuyerAccountSchema,
      )
      return { data: result.data.activeAccount, response: result.response }
    },
    async createBusinessAccount(
      input: CustomerBusinessAccountCreateInput,
    ): Promise<CustomerBusinessAccountDto> {
      return (await createBusinessAccountWithResponse(input)).data
    },
    createBusinessAccountWithResponse,
    async listBusinessAccountRequests(): Promise<CustomerBusinessAccountRequestDto[]> {
      return read(
        await fetcher(joinUrl(options.baseUrl, "/auth/customer/business-account-requests"), {
          method: "GET",
        }),
        z.array(customerBusinessAccountRequestSchema),
      )
    },
    async requestBusinessAccount(
      input: CustomerBusinessAccountCreateInput,
    ): Promise<CustomerBusinessAccountRequestDto> {
      return read(
        await fetcher(joinUrl(options.baseUrl, "/auth/customer/business-account-requests"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        customerBusinessAccountRequestSchema,
      )
    },
    async cancelBusinessAccountRequest(
      requestId: string,
    ): Promise<CustomerBusinessAccountRequestDto> {
      return read(
        await fetcher(
          joinUrl(
            options.baseUrl,
            `/auth/customer/business-account-requests/${encodeURIComponent(requestId)}`,
          ),
          { method: "DELETE" },
        ),
        customerBusinessAccountRequestSchema,
      )
    },
    async acceptBusinessInvitation(
      input: CustomerBusinessInvitationAcceptInput,
    ): Promise<CustomerBusinessInvitationAcceptResult> {
      return (await acceptBusinessInvitationWithResponse(input)).data
    },
    acceptBusinessInvitationWithResponse,
  }
}

export type {
  CustomerBusinessAccountCreateInput,
  CustomerBusinessAccountDto,
  CustomerBusinessAccountRequestDto,
  CustomerBusinessInvitationAcceptInput,
  CustomerBusinessInvitationAcceptResult,
}
