import { describe, expect, it } from "vitest"

import { InvoicesPageSkeleton } from "../components/invoices-page-skeleton.js"
import { PaymentsPageSkeleton } from "../components/payments-page-skeleton.js"
import { BookingInvoicesWidget } from "./booking-invoices-widget.js"
import { BookingPaymentPolicyWidget } from "./booking-payment-policy-widget.js"
import { BookingPendingPaymentSessionsWidget } from "./booking-pending-payment-sessions-widget.js"
import { CreditNoteDialog } from "./credit-note-dialog.js"
import {
  createFinanceAdminExtension,
  createSelectedFinanceAdminExtension,
  InvoiceDetailSkeleton,
  PaymentDetailSkeleton,
} from "./index.js"
import { InvoiceDetailHost } from "./invoice-detail-host.js"
import { LineItemDialog } from "./line-item-dialog.js"
import { PaymentDetailHost } from "./payment-detail-host.js"
import { PaymentDialog } from "./payment-dialog.js"
import { RecordPaymentDialog } from "./record-payment-dialog.js"
import { SupplierPaymentPolicyWidget } from "./supplier-payment-policy-widget.js"

/** The contributions that ship their full route implementation (RFC §4.8). */
const IMPLEMENTED_ROUTE_IDS = [
  "finance-invoices-index",
  "finance-invoices-detail",
  "finance-invoice-number-series",
  "finance-payments-index",
  "finance-payments-detail",
  "finance-supplier-invoices-index",
  "finance-supplier-invoices-detail",
  "finance-profitability",
] as const

describe("createFinanceAdminExtension", () => {
  it("adds localized standard navigation only through the selected factory", () => {
    const extension = createFinanceAdminExtension()
    expect(extension.id).toBe("finance")
    expect(extension.navigation).toBeUndefined()

    const selected = createSelectedFinanceAdminExtension({
      navMessages: {
        finance: "Finante",
        invoices: "Facturi",
        invoiceNumberSeries: "Serii",
        payments: "Plati",
        supplierInvoices: "Facturi furnizori",
        profitability: "Profitabilitate",
      },
    })
    expect(selected.navigation?.[0]).toMatchObject({
      order: -50,
      items: [
        {
          id: "finance",
          title: "Finante",
          url: "/finance/invoices",
          items: [
            { id: "invoices", title: "Facturi", url: "/finance/invoices" },
            { id: "invoice-number-series", title: "Serii", url: "/finance/invoice-number-series" },
            { id: "payments", title: "Plati", url: "/finance/payments" },
            {
              id: "supplier-invoices",
              title: "Facturi furnizori",
              url: "/finance/supplier-invoices",
            },
            { id: "profitability", title: "Profitabilitate", url: "/finance/profitability" },
          ],
        },
      ],
    })
    expect(selected.navigation?.[0]?.items[0]?.icon).toBeDefined()
    expect(selected.setupSteps?.[0]).toMatchObject({
      id: "@voyant-travel/finance#setup.fiscal-settings",
      href: "/settings/taxes",
    })
  })

  it("falls back to stable English selected navigation copy", () => {
    const extension = createSelectedFinanceAdminExtension({ navMessages: {} })
    expect(extension.navigation?.[0]?.items[0]).toMatchObject({
      title: "Finance",
      items: [
        { title: "Invoices" },
        { title: "Invoice number series" },
        { title: "Payments" },
        { title: "Supplier invoices" },
        { title: "Profitability" },
      ],
    })
  })

  it("describes the finance routes with unique ids and paths", () => {
    const extension = createFinanceAdminExtension()
    const routes = extension.routes ?? []
    expect(routes).toHaveLength(9)
    expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length)
    expect(routes.map((route) => route.path)).toEqual([
      "/finance",
      "/finance/invoices",
      "/finance/invoices/$id",
      "/finance/invoice-number-series",
      "/finance/payments",
      "/finance/payments/$id",
      "/finance/supplier-invoices",
      "/finance/supplier-invoices/$id",
      "/finance/profitability",
    ])
  })

  it("redirects the finance index to the invoices page", () => {
    const extension = createFinanceAdminExtension()
    const index = extension.routes?.find((route) => route.id === "finance-index")
    expect(index?.path).toBe("/finance")
    expect(index?.redirectTo).toBe("/finance/invoices")
    expect(index?.page).toBeUndefined()
  })

  it("honors basePath and labels", () => {
    const extension = createFinanceAdminExtension({
      basePath: "/financiar",
      labels: { invoices: "Facturi", payments: "Plati" },
    })
    const invoicesIndex = extension.routes?.find((route) => route.id === "finance-invoices-index")
    expect(invoicesIndex?.path).toBe("/financiar/invoices")
    expect(invoicesIndex?.title).toBe("Facturi")
    const paymentsDetail = extension.routes?.find((route) => route.id === "finance-payments-detail")
    expect(paymentsDetail?.path).toBe("/financiar/payments/$id")
    expect(paymentsDetail?.title).toBe("Plati")
  })

  it("carries the full route implementation on all eight package-owned routes", () => {
    // Packaged-admin RFC §4.8 endgame: these contributions ship the lazy
    // page module loader + data loader + per-route SSR mode, so the host's
    // code-assembled route tree binds them without per-route files. `page`
    // (not `component`) keeps every page in its own chunk.
    const extension = createFinanceAdminExtension()
    for (const id of IMPLEMENTED_ROUTE_IDS) {
      const route = extension.routes?.find((candidate) => candidate.id === id)
      expect(route, id).toBeDefined()
      expect(typeof route?.page, id).toBe("function")
      expect(typeof route?.loader, id).toBe("function")
      expect(route?.ssr, id).toBe("data-only")
      expect(route?.component, id).toBeUndefined()
    }
  })

  it("resolves each lazy page to a route page module", async () => {
    const extension = createFinanceAdminExtension()
    for (const id of IMPLEMENTED_ROUTE_IDS) {
      const route = extension.routes?.find((candidate) => candidate.id === id)
      const module = await route?.page?.()
      expect(typeof module?.default, id).toBe("function")
    }
  })

  it("attaches the operator pending skeletons where the operator routes had them", () => {
    const extension = createFinanceAdminExtension()
    const pendingByRoute: Record<string, unknown> = Object.fromEntries(
      (extension.routes ?? []).map((route) => [route.id, route.pendingComponent]),
    )
    expect(pendingByRoute["finance-invoices-index"]).toBe(InvoicesPageSkeleton)
    expect(pendingByRoute["finance-invoices-detail"]).toBe(InvoiceDetailSkeleton)
    expect(pendingByRoute["finance-payments-index"]).toBe(PaymentsPageSkeleton)
    expect(pendingByRoute["finance-payments-detail"]).toBe(PaymentDetailSkeleton)
    expect(pendingByRoute["finance-invoice-number-series"]).toBeUndefined()
    expect(pendingByRoute["finance-supplier-invoices-index"]).toBeUndefined()
    expect(pendingByRoute["finance-supplier-invoices-detail"]).toBeUndefined()
    expect(pendingByRoute["finance-profitability"]).toBeUndefined()
  })

  it("binds the supplier-invoices routes to their route-backed destinations", () => {
    // The previously app-owned wiring (uploads to /v1/admin/uploads via the
    // finance context, inline supplier creation via the suppliers client,
    // cross-domain target search via package query options) now travels
    // package-side, so both contributions ship full implementations and
    // pure path-interpolation destination annotations.
    const extension = createFinanceAdminExtension()
    const index = extension.routes?.find(
      (candidate) => candidate.id === "finance-supplier-invoices-index",
    )
    expect(index?.destination).toBe("supplierInvoice.list")
    expect(index?.destinationParams).toBeUndefined()
    const detail = extension.routes?.find(
      (candidate) => candidate.id === "finance-supplier-invoices-detail",
    )
    expect(detail?.destination).toBe("supplierInvoice.detail")
    expect(detail?.destinationParams).toEqual({ id: "supplierInvoiceId" })
  })

  it("contributes the booking invoices card on the bookings invoices-tab slot", () => {
    // The finance-ui ↔ bookings-ui cycle resolution: bookings-ui cannot be
    // imported into this package's dependents' booking page, so the card
    // arrives as a widget contribution the bookings host renders.
    const extension = createFinanceAdminExtension()
    const widgets = extension.widgets ?? []
    expect(widgets).toHaveLength(6)
    expect(widgets[1]?.slot).toBe("booking.details.invoices-tab")
    // The contribution mounts a Suspense-wrapped lazy loader (the card and
    // its payment stack stay out of the workspace-chrome chunk), so assert
    // it is a renderable component rather than the widget identity.
    expect(typeof widgets[1]?.component).toBe("function")
    expect(widgets[1]?.component).not.toBe(BookingInvoicesWidget)
  })

  it("contributes the package-owned booking payment controller", () => {
    const extension = createFinanceAdminExtension()
    const controller = extension.widgets?.find(
      (candidate) => candidate.id === "finance-booking-payment-controller",
    )
    expect(controller?.slot).toBe("booking.details.payment-controller")
    expect(typeof controller?.component).toBe("function")
  })

  it("contributes the finance-tab cards on the booking detail finance slots", () => {
    // Same cycle resolution: the pending payment-links card and the
    // payment-policy override card mount on the finance-start / finance-end
    // widget slots the bookings detail host exposes.
    const extension = createFinanceAdminExtension()
    const pending = extension.widgets?.find(
      (candidate) => candidate.id === "finance-booking-pending-payment-sessions",
    )
    expect(pending?.slot).toBe("booking.details.finance-start")
    // Lazy-wrapped — see the invoices-tab widget test above.
    expect(typeof pending?.component).toBe("function")
    expect(pending?.component).not.toBe(BookingPendingPaymentSessionsWidget)
    const policy = extension.widgets?.find(
      (candidate) => candidate.id === "finance-booking-payment-policy",
    )
    expect(policy?.slot).toBe("booking.details.finance-end")
    expect(typeof policy?.component).toBe("function")
    expect(policy?.component).not.toBe(BookingPaymentPolicyWidget)
  })

  it("contributes the payment-policy card on the supplier detail slot", () => {
    // Same cycle resolution for finance-ui ↔ suppliers-ui: the supplier
    // detail host cannot import this package, so the customer-payment-policy
    // card arrives as a widget contribution the supplier host renders.
    const extension = createFinanceAdminExtension()
    const widget = extension.widgets?.find(
      (candidate) => candidate.id === "finance-supplier-payment-policy",
    )
    expect(widget?.slot).toBe("supplier.details.payment-policy")
    expect(typeof widget?.component).toBe("function")
    expect(widget?.component).not.toBe(SupplierPaymentPolicyWidget)
  })
})

describe("packaged finance admin hosts", () => {
  // Importable + renderable component types — host apps bind these from
  // their SPECIFIC modules (the admin barrel re-exports types only, so the
  // workspace-chrome chunk that evaluates the factory never pins the heavy
  // hosts). A broken import surface fails here, not in an app build.
  it("exports the page hosts and dialogs as components from the admin entrypoint", () => {
    for (const host of [
      BookingInvoicesWidget,
      BookingPaymentPolicyWidget,
      BookingPendingPaymentSessionsWidget,
      CreditNoteDialog,
      InvoiceDetailHost,
      InvoiceDetailSkeleton,
      LineItemDialog,
      PaymentDetailHost,
      PaymentDetailSkeleton,
      PaymentDialog,
      RecordPaymentDialog,
      SupplierPaymentPolicyWidget,
    ]) {
      expect(typeof host).toBe("function")
    }
  })
})
