"use client"

import { canonicalizeTimeZone } from "@voyant-travel/i18n"
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

export const DEFAULT_ADMIN_LOCALES = ["en", "ro"] as const
export const DEFAULT_ADMIN_LOCALE = "en"

export interface LocaleContextValue {
  locale: string
  resolvedLocale: string
  /** Locales this deployment is configured to serve, in preference order. */
  supportedLocales: readonly string[]
  setLocale: (locale: string) => Promise<void>
  timeZone: string | null
  setTimeZone: (timeZone: string | null) => Promise<void>
  isSavingPreferences: boolean
  preferenceError: Error | null
}

interface LocaleContextState extends LocaleContextValue {
  providerDepth: number
}

const LocaleContext = createContext<LocaleContextState | undefined>(undefined)
const documentLocaleProviders = new Map<symbol, { depth: number; locale: string; order: number }>()
let documentLocaleOrder = 0

function synchronizeDocumentLocale() {
  if (typeof document === "undefined") return

  let selected: { depth: number; locale: string; order: number } | undefined
  for (const candidate of documentLocaleProviders.values()) {
    if (
      !selected ||
      candidate.depth > selected.depth ||
      (candidate.depth === selected.depth && candidate.order > selected.order)
    ) {
      selected = candidate
    }
  }
  if (selected) document.documentElement.lang = selected.locale
}

function pickSupportedLocale(
  locale: string | null | undefined,
  supportedLocales: readonly string[],
  fallbackLocale: string,
): string {
  if (!locale) {
    return fallbackLocale
  }

  const normalized = locale.trim().toLowerCase()
  if (!normalized) {
    return fallbackLocale
  }

  const directMatch = supportedLocales.find((candidate) => candidate.toLowerCase() === normalized)
  if (directMatch) {
    return directMatch
  }

  const languageMatch = supportedLocales.find(
    (candidate) => candidate.toLowerCase() === normalized.split("-")[0],
  )
  return languageMatch ?? fallbackLocale
}

function readStoredValue(storageKey: string | null): string | null {
  if (typeof window === "undefined" || storageKey === null) {
    return null
  }

  return window.localStorage.getItem(storageKey)
}

function getBrowserLocale(): string | null {
  if (typeof navigator === "undefined") {
    return null
  }

  return navigator.language ?? null
}

export interface LocaleProviderProps {
  children: ReactNode
  defaultLocale?: string
  defaultTimeZone?: string | null
  localeStorageKey?: string | null
  timeZoneStorageKey?: string | null
  supportedLocales?: readonly string[]
  fallbackLocale?: string
  /**
   * Account preferences outrank device cache and browser defaults. Use this
   * for an authenticated user boundary whose defaults came from `/auth/me`.
   */
  preferenceAuthority?: "device" | "account"
  /** Persist an optimistic preference change to the authoritative profile. */
  onPreferenceChange?: (preference: {
    locale?: string
    timezone?: string | null
  }) => void | Promise<void>
}

export function LocaleProvider({
  children,
  defaultLocale,
  defaultTimeZone,
  localeStorageKey = "admin-locale",
  timeZoneStorageKey = "admin-timezone",
  supportedLocales = DEFAULT_ADMIN_LOCALES,
  fallbackLocale = DEFAULT_ADMIN_LOCALE,
  preferenceAuthority = "device",
  onPreferenceChange,
}: LocaleProviderProps) {
  const parentContext = useContext(LocaleContext)
  const providerDepth = (parentContext?.providerDepth ?? -1) + 1
  const documentLocaleId = useRef(Symbol("locale-provider"))
  const [locale, setLocaleState] = useState<string>(() => {
    // Account authority is derived from props alone, so narrow it here rather
    // than in the effect below. Doing it a render late meant every member
    // whose profile stores a regional tag (`en-GB`) mounted the whole
    // authenticated tree at `en-GB` and re-rendered it at `en` one tick later
    // — a wasted pass, and a re-key for anything derived from the locale
    // (voyant#4754). The device branch cannot do this: its inputs are
    // `localStorage` and `navigator`, which the server does not have.
    if (preferenceAuthority === "account") {
      return pickSupportedLocale(defaultLocale, supportedLocales, fallbackLocale)
    }
    if (defaultLocale) {
      return defaultLocale
    }
    return fallbackLocale
  })

  const [timeZone, setTimeZoneState] = useState<string | null>(() => {
    if (defaultTimeZone !== undefined) {
      return canonicalizeTimeZone(defaultTimeZone)
    }
    return null
  })
  const [pendingPreferenceUpdates, setPendingPreferenceUpdates] = useState(0)
  const [preferenceError, setPreferenceError] = useState<Error | null>(null)
  const localeRequest = useRef(0)
  const timeZoneRequest = useRef(0)

  const resolvedLocale = useMemo(
    () => pickSupportedLocale(locale, supportedLocales, fallbackLocale),
    [fallbackLocale, locale, supportedLocales],
  )

  const setLocale = useCallback(
    async (nextLocale: string) => {
      const resolvedNextLocale = pickSupportedLocale(nextLocale, supportedLocales, fallbackLocale)
      const previousLocale = locale
      const request = ++localeRequest.current
      setLocaleState(resolvedNextLocale)
      setPreferenceError(null)
      if (typeof window !== "undefined" && localeStorageKey !== null) {
        window.localStorage.setItem(localeStorageKey, resolvedNextLocale)
      }

      if (!onPreferenceChange) return

      setPendingPreferenceUpdates((count) => count + 1)
      try {
        await onPreferenceChange({ locale: resolvedNextLocale })
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error("Could not save locale preference")
        if (localeRequest.current === request) {
          setLocaleState(previousLocale)
          if (typeof window !== "undefined" && localeStorageKey !== null) {
            window.localStorage.setItem(localeStorageKey, previousLocale)
          }
          setPreferenceError(error)
        }
        throw error
      } finally {
        setPendingPreferenceUpdates((count) => Math.max(0, count - 1))
      }
    },
    [fallbackLocale, locale, localeStorageKey, onPreferenceChange, supportedLocales],
  )

  const setTimeZone = useCallback(
    async (nextTimeZone: string | null) => {
      const resolvedNextTimeZone = canonicalizeTimeZone(nextTimeZone)
      if (nextTimeZone && !resolvedNextTimeZone) {
        throw new RangeError(`Invalid time zone: ${nextTimeZone}`)
      }

      const previousTimeZone = timeZone
      const request = ++timeZoneRequest.current
      setTimeZoneState(resolvedNextTimeZone)
      setPreferenceError(null)
      if (typeof window !== "undefined" && timeZoneStorageKey !== null) {
        if (resolvedNextTimeZone) {
          window.localStorage.setItem(timeZoneStorageKey, resolvedNextTimeZone)
        } else {
          window.localStorage.removeItem(timeZoneStorageKey)
        }
      }

      if (!onPreferenceChange) return

      setPendingPreferenceUpdates((count) => count + 1)
      try {
        await onPreferenceChange({ timezone: resolvedNextTimeZone })
      } catch (cause) {
        const error =
          cause instanceof Error ? cause : new Error("Could not save time zone preference")
        if (timeZoneRequest.current === request) {
          setTimeZoneState(previousTimeZone)
          if (typeof window !== "undefined" && timeZoneStorageKey !== null) {
            if (previousTimeZone) {
              window.localStorage.setItem(timeZoneStorageKey, previousTimeZone)
            } else {
              window.localStorage.removeItem(timeZoneStorageKey)
            }
          }
          setPreferenceError(error)
        }
        throw error
      } finally {
        setPendingPreferenceUpdates((count) => Math.max(0, count - 1))
      }
    },
    [onPreferenceChange, timeZone, timeZoneStorageKey],
  )

  useEffect(() => {
    if (preferenceAuthority === "account") {
      const accountLocale = pickSupportedLocale(defaultLocale, supportedLocales, fallbackLocale)
      const accountTimeZone = canonicalizeTimeZone(defaultTimeZone)
      setLocaleState(accountLocale)
      setTimeZoneState(accountTimeZone)
      if (typeof window !== "undefined") {
        if (localeStorageKey !== null) window.localStorage.setItem(localeStorageKey, accountLocale)
        if (timeZoneStorageKey !== null) {
          if (accountTimeZone) window.localStorage.setItem(timeZoneStorageKey, accountTimeZone)
          else window.localStorage.removeItem(timeZoneStorageKey)
        }
      }
      return
    }

    const storedLocale = readStoredValue(localeStorageKey)
    const browserLocale = getBrowserLocale()
    setLocaleState(storedLocale ?? defaultLocale ?? browserLocale ?? fallbackLocale)

    const storedTimeZone = readStoredValue(timeZoneStorageKey)
    // Locale does not affect timezone discovery; this formatter never renders output.
    const browserTimeZone =
      Intl.DateTimeFormat() // i18n-format-ok
        .resolvedOptions().timeZone ?? null
    setTimeZoneState(canonicalizeTimeZone(storedTimeZone ?? defaultTimeZone ?? browserTimeZone))
  }, [
    defaultLocale,
    defaultTimeZone,
    fallbackLocale,
    localeStorageKey,
    preferenceAuthority,
    supportedLocales,
    timeZoneStorageKey,
  ])

  useEffect(() => {
    const id = documentLocaleId.current
    documentLocaleProviders.set(id, {
      depth: providerDepth,
      locale: resolvedLocale,
      order: ++documentLocaleOrder,
    })
    synchronizeDocumentLocale()
    return () => {
      documentLocaleProviders.delete(id)
      synchronizeDocumentLocale()
    }
  }, [providerDepth, resolvedLocale])

  return (
    <LocaleContext.Provider
      value={{
        locale,
        resolvedLocale,
        supportedLocales,
        setLocale,
        timeZone,
        setTimeZone,
        isSavingPreferences: pendingPreferenceUpdates > 0,
        preferenceError,
        providerDepth,
      }}
    >
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error("useLocale must be used within <LocaleProvider>")
  }

  return context
}

export function resolveAdminLocale(
  locale: string | null | undefined,
  supportedLocales: readonly string[] = DEFAULT_ADMIN_LOCALES,
  fallbackLocale = DEFAULT_ADMIN_LOCALE,
): string {
  return pickSupportedLocale(locale, supportedLocales, fallbackLocale)
}
