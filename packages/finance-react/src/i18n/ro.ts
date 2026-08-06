import type { FinanceUiMessages } from "./messages.js"
import { common, invoiceDetailPage, invoiceDialog, invoicesPage } from "./ro/invoices.js"
import {
  invoiceNumberSeriesDialog,
  invoiceNumberSeriesPage,
  invoicingPage,
  paymentDetailPage,
  paymentPolicy,
  paymentsPage,
  recordBookingPaymentDialog,
  taxesPage,
} from "./ro/numberingAndPayments.js"
import { costCategories, profitability } from "./ro/profitability.js"
import { bookingRefundPanel, recordRefundSettlementDialog } from "./ro/refunds.js"
import {
  supplierInvoiceDetail,
  supplierInvoicesPage,
  supplierPaymentDialog,
} from "./ro/suppliers.js"

export const financeUiRo = {
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
