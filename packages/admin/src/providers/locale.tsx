"use client"

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

export const DEFAULT_ADMIN_LOCALES = ["zh-CN", "en"] as const
export const DEFAULT_ADMIN_LOCALE = "zh-CN"

export interface LocaleContextValue {
  locale: string
  resolvedLocale: string
  setLocale: (locale: string) => void
  timeZone: string | null
  setTimeZone: (timeZone: string | null) => void
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined)

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
}

export function LocaleProvider({
  children,
  defaultLocale,
  defaultTimeZone = null,
  localeStorageKey = "admin-locale",
  timeZoneStorageKey = "admin-timezone",
  supportedLocales = DEFAULT_ADMIN_LOCALES,
  fallbackLocale = DEFAULT_ADMIN_LOCALE,
}: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<string>(() => {
    const storedLocale = readStoredValue(localeStorageKey)
    if (storedLocale) {
      return storedLocale
    }

    if (defaultLocale) {
      return defaultLocale
    }

    const browserLocale = getBrowserLocale()
    return browserLocale ?? fallbackLocale
  })

  const [timeZone, setTimeZoneState] = useState<string | null>(() => {
    const storedTimeZone = readStoredValue(timeZoneStorageKey)
    if (storedTimeZone) {
      return storedTimeZone
    }

    if (defaultTimeZone !== undefined) {
      return defaultTimeZone
    }

    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  })

  const resolvedLocale = useMemo(
    () => pickSupportedLocale(locale, supportedLocales, fallbackLocale),
    [fallbackLocale, locale, supportedLocales],
  )

  const setLocale = useCallback(
    (nextLocale: string) => {
      setLocaleState(nextLocale)
      if (typeof window !== "undefined" && localeStorageKey !== null) {
        window.localStorage.setItem(localeStorageKey, nextLocale)
      }
    },
    [localeStorageKey],
  )

  const setTimeZone = useCallback(
    (nextTimeZone: string | null) => {
      setTimeZoneState(nextTimeZone)
      if (typeof window === "undefined" || timeZoneStorageKey === null) {
        return
      }

      if (nextTimeZone) {
        window.localStorage.setItem(timeZoneStorageKey, nextTimeZone)
      } else {
        window.localStorage.removeItem(timeZoneStorageKey)
      }
    },
    [timeZoneStorageKey],
  )

  useEffect(() => {
    if (typeof document === "undefined") {
      return
    }

    document.documentElement.lang = resolvedLocale
  }, [resolvedLocale])

  return (
    <LocaleContext.Provider
      value={{
        locale,
        resolvedLocale,
        setLocale,
        timeZone,
        setTimeZone,
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
