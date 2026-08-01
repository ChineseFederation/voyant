"use client"

import {
  createLocaleFormatters,
  createPackageMessagesContext,
  type LocaleMessageDefinitions,
  type LocaleMessageOverrides,
  type PackageI18nValue,
  resolvePackageMessages,
} from "@voyant-travel/i18n"
import type { ReactNode } from "react"

import { crmUiEn } from "./en.js"
import type { CrmUiMessages } from "./messages.js"
import { crmUiRo } from "./ro.js"

const fallbackLocale = "en"

export const crmUiMessageDefinitions = {
  en: crmUiEn,
  ro: crmUiRo,
} satisfies LocaleMessageDefinitions<CrmUiMessages>

export type CrmUiMessageOverrides = LocaleMessageOverrides<CrmUiMessages>

const crmUiContext = createPackageMessagesContext<CrmUiMessages>("CrmUiMessages")

const defaultCrmUiI18n: PackageI18nValue<CrmUiMessages> = {
  messages: crmUiEn,
  ...createLocaleFormatters(fallbackLocale),
}

export function resolveCrmUiMessages({
  locale,
  overrides,
}: {
  locale: string | null | undefined
  overrides?: CrmUiMessageOverrides | null
}) {
  return resolvePackageMessages({
    definitions: crmUiMessageDefinitions,
    fallbackLocale,
    locale,
    overrides,
  })
}

export function getCrmUiI18n({
  locale,
  overrides,
}: {
  locale?: string | null | undefined
  overrides?: CrmUiMessageOverrides | null
}): PackageI18nValue<CrmUiMessages> {
  const resolvedLocale = locale ?? fallbackLocale

  return {
    messages: resolveCrmUiMessages({
      locale: resolvedLocale,
      overrides,
    }),
    ...createLocaleFormatters(resolvedLocale),
  }
}

export function CrmUiMessagesProvider({
  children,
  locale,
  timeZone,
  overrides,
}: {
  children: ReactNode
  locale: string | null | undefined
  timeZone?: string | null
  overrides?: CrmUiMessageOverrides | null
}) {
  return (
    <crmUiContext.ResolvedMessagesProvider
      definitions={crmUiMessageDefinitions}
      fallbackLocale={fallbackLocale}
      locale={locale}
      timeZone={timeZone}
      overrides={overrides}
    >
      {children}
    </crmUiContext.ResolvedMessagesProvider>
  )
}

export const useCrmUiI18n = crmUiContext.useI18n
export const useCrmUiMessages = crmUiContext.useMessages

export function useCrmUiI18nOrDefault() {
  return crmUiContext.useOptionalI18n() ?? defaultCrmUiI18n
}

export function useCrmUiMessagesOrDefault() {
  return useCrmUiI18nOrDefault().messages
}
