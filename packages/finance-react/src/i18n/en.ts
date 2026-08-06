import { common, invoiceDetailPage, invoiceDialog, invoicesPage } from "./en/invoices.js"
import {
  invoiceNumberSeriesDialog,
  invoiceNumberSeriesPage,
  invoicingPage,
  paymentDetailPage,
  paymentPolicy,
  paymentsPage,
  recordBookingPaymentDialog,
  taxesPage,
} from "./en/numberingAndPayments.js"
import { costCategories, profitability } from "./en/profitability.js"
import { bookingRefundPanel, recordRefundSettlementDialog } from "./en/refunds.js"
import {
  supplierInvoiceDetail,
  supplierInvoicesPage,
  supplierPaymentDialog,
} from "./en/suppliers.js"
import type { FinanceUiMessages } from "./messages.js"

export const financeUiEn = {
  common,
  invoiceDialog,
  invoicesPage,
  supplierInvoicesPage,
  supplierInvoiceDetail,
  invoiceNumberSeriesPage,
  invoiceNumberSeriesDialog,
  paymentsPage,
  paymentDetailPage,
  invoiceDetailPage,
  paymentPolicy,
  taxesPage,
  invoicingPage,
  supplierPaymentDialog,
  recordBookingPaymentDialog,
  profitability,
  costCategories,
  bookingRefundPanel,
  recordRefundSettlementDialog,
} satisfies FinanceUiMessages
