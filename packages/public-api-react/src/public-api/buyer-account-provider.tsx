"use client"

import {
  type CustomerAuthFetcher,
  type CustomerAuthSession,
  type CustomerBusinessAccountCreateInput,
  type CustomerBusinessAccountDto,
  type CustomerBusinessAccountRequestDto,
  type CustomerBusinessInvitationAcceptInput,
  type CustomerBuyerAccount,
  type CustomerBuyerAccountList,
  createCustomerAuthClient,
} from "@voyant-travel/public-api/customer-auth-client"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { VoyantFetcher } from "../customer-portal/client.js"

export type BuyerAccountPolicy = CustomerBuyerAccountList["policy"]

export interface BuyerAccountContextValue {
  accounts: CustomerBuyerAccount[]
  businessAccountRequests: CustomerBusinessAccountRequestDto[]
  active: CustomerBuyerAccount | null
  requiresSelection: boolean
  policy: BuyerAccountPolicy | null
  session: CustomerAuthSession
  loading: boolean
  selecting: boolean
  creatingBusinessAccount: boolean
  requestingBusinessAccount: boolean
  cancelingBusinessAccountRequest: boolean
  acceptingBusinessInvitation: boolean
  error: Error | null
  refresh: () => Promise<void>
  selectAccount: (accountId: string) => Promise<void>
  createBusinessAccount: (
    input: CustomerBusinessAccountCreateInput,
  ) => Promise<CustomerBusinessAccountDto>
  requestBusinessAccount: (
    input: CustomerBusinessAccountCreateInput,
  ) => Promise<CustomerBusinessAccountRequestDto>
  cancelBusinessAccountRequest: (requestId: string) => Promise<CustomerBusinessAccountRequestDto>
  acceptBusinessInvitation: (
    input: CustomerBusinessInvitationAcceptInput,
  ) => Promise<CustomerBusinessAccountDto>
}

const BuyerAccountContext = createContext<BuyerAccountContextValue | null>(null)

/** Force cookie-backed customer auth through the storefront's same-origin BFF. */
export function createBuyerAccountFetcher(fetcher: VoyantFetcher): CustomerAuthFetcher {
  return (url, init) => fetcher(url, { ...init, credentials: "include" })
}

export function BuyerAccountProvider({
  baseUrl,
  children,
  fetcher,
}: {
  baseUrl: string
  children: ReactNode
  fetcher: VoyantFetcher
}) {
  const client = useMemo(
    () =>
      createCustomerAuthClient({
        baseUrl,
        fetcher: createBuyerAccountFetcher(fetcher),
      }),
    [baseUrl, fetcher],
  )
  const requestVersion = useRef(0)
  const businessRequestVersion = useRef(0)
  const [accounts, setAccounts] = useState<CustomerBuyerAccount[]>([])
  const [businessAccountRequests, setBusinessAccountRequests] = useState<
    CustomerBusinessAccountRequestDto[]
  >([])
  const [active, setActive] = useState<CustomerBuyerAccount | null>(null)
  const [requiresSelection, setRequiresSelection] = useState(false)
  const [policy, setPolicy] = useState<BuyerAccountPolicy | null>(null)
  const [session, setSession] = useState<CustomerAuthSession>(null)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [creatingBusinessAccount, setCreatingBusinessAccount] = useState(false)
  const [requestingBusinessAccount, setRequestingBusinessAccount] = useState(false)
  const [cancelingBusinessAccountRequest, setCancelingBusinessAccountRequest] = useState(false)
  const [acceptingBusinessInvitation, setAcceptingBusinessInvitation] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    setError(null)
    try {
      const [accountState, sessionState] = await Promise.all([
        client.listBuyerAccounts(),
        client.getSession(),
      ])
      const requestState =
        accountState.policy.businessOnboarding === "request"
          ? await client.listBusinessAccountRequests()
          : []
      if (version !== requestVersion.current) return
      setAccounts(accountState.accounts)
      setActive(accountState.activeAccount)
      setRequiresSelection(accountState.requiresSelection)
      setPolicy(accountState.policy)
      setSession(sessionState)
      setBusinessAccountRequests(requestState)
    } catch (cause) {
      if (version !== requestVersion.current) return
      setError(cause instanceof Error ? cause : new Error(String(cause)))
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void refresh()
    return () => {
      requestVersion.current += 1
      businessRequestVersion.current += 1
    }
  }, [refresh])

  const selectAccount = useCallback(
    async (accountId: string) => {
      setSelecting(true)
      setError(null)
      try {
        await client.selectBuyerAccount(accountId)
        await refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)))
        throw cause
      } finally {
        setSelecting(false)
      }
    },
    [client, refresh],
  )

  const refreshBusinessAccountRequests = useCallback(async () => {
    const version = ++businessRequestVersion.current
    const requests = await client.listBusinessAccountRequests()
    if (version === businessRequestVersion.current) setBusinessAccountRequests(requests)
  }, [client])

  const assertBusinessOnboardingMode = useCallback(
    (expected: "open" | "request", action: string) => {
      if (policy?.businessOnboarding !== expected) {
        throw new Error(`${action} is not available for the current business onboarding policy`)
      }
    },
    [policy],
  )

  const createBusinessAccount = useCallback(
    async (input: CustomerBusinessAccountCreateInput) => {
      assertBusinessOnboardingMode("open", "Creating a business account")
      setCreatingBusinessAccount(true)
      setError(null)
      try {
        const account = await client.createBusinessAccount(input)
        await client.selectBuyerAccount(account.id)
        await refresh()
        return account
      } catch (cause) {
        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        setError(nextError)
        throw nextError
      } finally {
        setCreatingBusinessAccount(false)
      }
    },
    [assertBusinessOnboardingMode, client, refresh],
  )

  const requestBusinessAccount = useCallback(
    async (input: CustomerBusinessAccountCreateInput) => {
      assertBusinessOnboardingMode("request", "Requesting a business account")
      setRequestingBusinessAccount(true)
      setError(null)
      try {
        const request = await client.requestBusinessAccount(input)
        await refreshBusinessAccountRequests()
        return request
      } catch (cause) {
        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        setError(nextError)
        throw nextError
      } finally {
        setRequestingBusinessAccount(false)
      }
    },
    [assertBusinessOnboardingMode, client, refreshBusinessAccountRequests],
  )

  const cancelBusinessAccountRequest = useCallback(
    async (requestId: string) => {
      assertBusinessOnboardingMode("request", "Canceling a business account request")
      setCancelingBusinessAccountRequest(true)
      setError(null)
      try {
        const request = await client.cancelBusinessAccountRequest(requestId)
        await refreshBusinessAccountRequests()
        return request
      } catch (cause) {
        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        setError(nextError)
        throw nextError
      } finally {
        setCancelingBusinessAccountRequest(false)
      }
    },
    [assertBusinessOnboardingMode, client, refreshBusinessAccountRequests],
  )

  const acceptBusinessInvitation = useCallback(
    async (input: CustomerBusinessInvitationAcceptInput) => {
      if (policy?.businessOnboarding === "disabled") {
        throw new Error("Business invitations are disabled for this storefront")
      }
      setAcceptingBusinessInvitation(true)
      setError(null)
      try {
        const { account } = await client.acceptBusinessInvitation(input)
        await refresh()
        return account
      } catch (cause) {
        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        setError(nextError)
        throw nextError
      } finally {
        setAcceptingBusinessInvitation(false)
      }
    },
    [client, policy?.businessOnboarding, refresh],
  )

  const value = useMemo<BuyerAccountContextValue>(
    () => ({
      accounts,
      businessAccountRequests,
      active,
      requiresSelection,
      policy,
      session,
      loading,
      selecting,
      creatingBusinessAccount,
      requestingBusinessAccount,
      cancelingBusinessAccountRequest,
      acceptingBusinessInvitation,
      error,
      refresh,
      selectAccount,
      createBusinessAccount,
      requestBusinessAccount,
      cancelBusinessAccountRequest,
      acceptBusinessInvitation,
    }),
    [
      accounts,
      businessAccountRequests,
      active,
      requiresSelection,
      policy,
      session,
      loading,
      selecting,
      creatingBusinessAccount,
      requestingBusinessAccount,
      cancelingBusinessAccountRequest,
      acceptingBusinessInvitation,
      error,
      refresh,
      selectAccount,
      createBusinessAccount,
      requestBusinessAccount,
      cancelBusinessAccountRequest,
      acceptBusinessInvitation,
    ],
  )

  return <BuyerAccountContext.Provider value={value}>{children}</BuyerAccountContext.Provider>
}

export function useBuyerAccounts(): BuyerAccountContextValue {
  const value = useContext(BuyerAccountContext)
  if (!value) {
    throw new Error("useBuyerAccounts must be used inside BuyerAccountProvider")
  }
  return value
}

export function BuyerAccountSelector({
  className,
  disabled = false,
}: {
  className?: string
  disabled?: boolean
}) {
  const { accounts, active, selectAccount, selecting } = useBuyerAccounts()
  return (
    <fieldset className={className} aria-label="Buyer account">
      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          aria-pressed={active?.id === account.id}
          disabled={disabled || selecting}
          onClick={() => void selectAccount(account.id)}
        >
          <span>{account.name}</span>
          <span>{account.kind === "business" ? "Business" : "Personal"}</span>
        </button>
      ))}
    </fieldset>
  )
}

export function BuyerAccountSelectionGate({
  children,
  errorFallback,
  loadingFallback = null,
  selectionFallback,
}: {
  children: ReactNode
  errorFallback?: (error: Error) => ReactNode
  loadingFallback?: ReactNode
  selectionFallback?: ReactNode
}) {
  const state = useBuyerAccounts()
  if (state.loading) return loadingFallback
  if (state.error) return errorFallback?.(state.error) ?? null
  if (state.requiresSelection) {
    return selectionFallback ?? <BuyerAccountSelector />
  }
  return children
}
