import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  adminRoutePageModule,
  defineAdminExtension,
} from "@voyant-travel/admin/extensions"
import type { AdminCoreSettingsExtraPage } from "@voyant-travel/admin-app/core-extension"
import { Building, CreditCard } from "lucide-react"
import { type ComponentType, createElement } from "react"

import {
  OPERATOR_PROFILE_SETUP_STEP_ID,
  parseOperatorProfileSetupPrefill,
} from "./operator-profile-setup-prefill.js"
import type { PaymentsSettingsPageProps } from "./payments-settings-page.js"

/**
 * Options for {@link createOperatorProfileSettingsExtraPage}. All optional —
 * the defaults reproduce the operator starter's placement (General group,
 * leading order 10, Building icon) so a source-free admin renders the page
 * identically.
 */
export interface OperatorProfileSettingsExtraPageOptions {
  /** Path relative to the settings base path. Default `"/operator"`. */
  path?: string
  /** Position within the General group. Default `10` (leads the group). */
  order?: number
}

/**
 * The packaged Organization settings page as an
 * {@link AdminCoreSettingsExtraPage} descriptor. Spread the result into
 * `createAdminCoreExtension({ settings: { extraPages: [...] } })` to mount the
 * page — the same shape the operator starter uses, but source-free so the
 * managed (package-only) admin can render it.
 *
 * The `page` thunk lazy-imports the heavy React page so it stays out of the
 * chunk that evaluates the extension registry.
 */
export function createOperatorProfileSettingsExtraPage(
  options: OperatorProfileSettingsExtraPageOptions = {},
): AdminCoreSettingsExtraPage {
  return {
    id: "operator",
    path: options.path ?? "/operator",
    title: "Organization",
    label: (messages) => messages.settings.operator,
    icon: Building,
    group: "general",
    order: options.order ?? 10,
    page: () =>
      import("./operator-profile-settings-page.js").then((module) =>
        adminRoutePageModule(module.OperatorProfileSettingsPage),
      ),
  }
}

/**
 * The packaged Settings → Payments page descriptor. Placed in the General group
 * after Invoicing (order 47). Lets the operator browse and connect a first-party
 * payment processor. See
 * `docs/adr/0015-payment-adapter-transports-and-managed-connect.md`.
 */
export function createPaymentsSettingsExtraPage(
  options: { path?: string; order?: number } = {},
): AdminCoreSettingsExtraPage {
  return {
    id: "payments",
    path: options.path ?? "/payments",
    title: "Payments",
    label: (messages) => messages.settings.payments,
    icon: CreditCard,
    group: "general",
    order: options.order ?? 47,
    page: () =>
      Promise.all([
        import("./payments-settings-page.js"),
        import("./stripe-connect-onboarding.js"),
      ]).then(([payments, stripe]) => {
        const PaymentsSettingsRoute = () =>
          createElement(payments.PaymentsSettingsPage as ComponentType<PaymentsSettingsPageProps>, {
            embeddedOnboardingClient: stripe.StripeConnectEmbeddedOnboarding,
          })
        return adminRoutePageModule(PaymentsSettingsRoute)
      }),
  }
}

/** Selected-graph admin contribution owned by the operator-settings package. */
export function createSelectedOperatorSettingsAdminExtension(): AdminExtension {
  return defineAdminExtension({
    id: "operator-settings",
    settingsPages: [createOperatorProfileSettingsExtraPage(), createPaymentsSettingsExtraPage()],
    setupSteps: [
      {
        id: OPERATOR_PROFILE_SETUP_STEP_ID,
        order: 10,
        skippable: true,
        href: "/settings/operator",
        messages: {
          en: {
            title: "Business profile",
            description:
              "Add the business name and contact details used across customer documents.",
            action: "Open operator settings",
          },
          ro: {
            title: "Profilul companiei",
            description: "Adauga numele si datele de contact folosite in documentele clientilor.",
            action: "Deschide setarile operatorului",
          },
        },
        prefill: parseOperatorProfileSetupPrefill,
        isComplete: hasBusinessProfile,
      },
    ],
  })
}

async function hasBusinessProfile({ runtime }: AdminRouteLoaderContext): Promise<boolean> {
  const response = await (runtime.fetcher ?? fetch)(
    `${runtime.baseUrl}/v1/admin/settings/operator-profile`,
  )
  if (!response.ok) return false
  const profile = ((await response.json()) as { data?: Record<string, unknown> | null }).data
  return Boolean(profile?.name && (profile.email || profile.phone || profile.address))
}
