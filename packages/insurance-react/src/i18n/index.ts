"use client"

import {
  createLocaleFormatters,
  createPackageMessagesContext,
  type LocaleMessageDefinitions,
  type LocaleMessageOverrides,
  type PackageI18nValue,
  resolvePackageMessages,
} from "@voyant-travel/i18n"
import { createElement, type ReactNode } from "react"

import { insuranceUiEn } from "./en.js"
import type { InsuranceUiMessages } from "./messages.js"
import { insuranceUiRo } from "./ro.js"

export { insuranceUiEn } from "./en.js"
export type { InsuranceUiMessages } from "./messages.js"
export { insuranceUiRo } from "./ro.js"

const fallbackLocale = "en"

export const insuranceUiMessageDefinitions = {
  en: insuranceUiEn,
  ro: insuranceUiRo,
} satisfies LocaleMessageDefinitions<InsuranceUiMessages>

export type InsuranceUiMessageOverrides = LocaleMessageOverrides<InsuranceUiMessages>

const insuranceUiContext = createPackageMessagesContext<InsuranceUiMessages>("InsuranceUiMessages")

const defaultInsuranceUiI18n: PackageI18nValue<InsuranceUiMessages> = {
  messages: insuranceUiEn,
  ...createLocaleFormatters(fallbackLocale),
}

export function resolveInsuranceUiMessages({
  locale,
  overrides,
}: {
  locale: string | null | undefined
  overrides?: InsuranceUiMessageOverrides | null
}): InsuranceUiMessages {
  return resolvePackageMessages({
    definitions: insuranceUiMessageDefinitions,
    fallbackLocale,
    locale,
    overrides,
  })
}

export function getInsuranceUiI18n({
  locale,
  overrides,
}: {
  locale?: string | null | undefined
  overrides?: InsuranceUiMessageOverrides | null
}): PackageI18nValue<InsuranceUiMessages> {
  const resolvedLocale = locale ?? fallbackLocale
  return {
    messages: resolveInsuranceUiMessages({ locale: resolvedLocale, overrides }),
    ...createLocaleFormatters(resolvedLocale),
  }
}

/**
 * Written with `createElement` rather than JSX so this stays a `.ts` file.
 *
 * The catalogue is the package's public i18n surface and is imported by
 * non-React callers (the operator's message-merging build step among them); a
 * `.tsx` here would make that import pull the JSX runtime for nothing.
 */
export function InsuranceUiMessagesProvider({
  children,
  locale,
  timeZone,
  overrides,
}: {
  children: ReactNode
  locale: string | null | undefined
  timeZone?: string | null
  overrides?: InsuranceUiMessageOverrides | null
}) {
  return createElement(insuranceUiContext.ResolvedMessagesProvider, {
    definitions: insuranceUiMessageDefinitions,
    fallbackLocale,
    locale,
    timeZone,
    overrides,
    children,
  })
}

export const useInsuranceUiI18n = insuranceUiContext.useI18n
export const useInsuranceUiMessages = insuranceUiContext.useMessages

/**
 * The formatters and messages, falling back to English when no provider is
 * mounted.
 *
 * Money is formatted through the bound `formatCurrency` from here — never a
 * locally invented format. Two money formats on one page is a bug an operator
 * notices before anyone else does.
 */
export function useInsuranceUiI18nOrDefault(): PackageI18nValue<InsuranceUiMessages> {
  return insuranceUiContext.useOptionalI18n() ?? defaultInsuranceUiI18n
}

export function useInsuranceUiMessagesOrDefault(): InsuranceUiMessages {
  return useInsuranceUiI18nOrDefault().messages
}
