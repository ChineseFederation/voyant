import { getFinanceAggregates } from "./service-aggregates.js"
import { financeBookingBillingService } from "./service-booking-billing.js"
import { financeBookingSettlementService } from "./service-booking-settlement.js"
import { costCategoriesService } from "./service-cost-categories.js"
import { financeInvoiceArtifactService } from "./service-invoice-artifacts.js"
import { financeInvoiceNumberingService } from "./service-invoice-numbering.js"
import { financeInvoiceService } from "./service-invoices.js"
import { financePaymentDisputeService } from "./service-payment-disputes.js"
import { financePaymentProcessingService } from "./service-payment-processing.js"
import {
  getDepartureProfitability,
  getProductProfitability,
  getTravelerProfitability,
} from "./service-profitability.js"
import { financeReferenceDataService } from "./service-reference-data.js"
import { financeRefundSettlementService } from "./service-refund-settlements.js"
import { financeReportService } from "./service-reports.js"
import { financeSupplierPaymentService } from "./service-supplier-payments.js"
import { travelCreditsService } from "./service-travel-credits.js"

export * from "./service-shared.js"

export const financeService = {
  travelCredits: travelCreditsService,
  getFinanceAggregates,
  getDepartureProfitability,
  getProductProfitability,
  getTravelerProfitability,
  costCategories: costCategoriesService,
  paymentDisputes: financePaymentDisputeService,
  refundSettlements: financeRefundSettlementService,
  ...financePaymentProcessingService,
  ...financeBookingBillingService,
  ...financeBookingSettlementService,
  ...financeReportService,
  ...financeSupplierPaymentService,
  ...financeInvoiceService,
  ...financeInvoiceNumberingService,
  ...financeInvoiceArtifactService,
  ...financeReferenceDataService,
}
