import { z } from "zod"

export const supplierInvoiceStatusSchema = z.enum([
  "draft",
  "received",
  "approved",
  "partially_paid",
  "paid",
  "disputed",
  "void",
])
export type SupplierInvoiceStatus = z.infer<typeof supplierInvoiceStatusSchema>

export const apServiceTypeSchema = z.enum([
  "transport",
  "flight",
  "accommodation",
  "guide",
  "meal",
  "experience",
  "insurance",
  "other",
])
export type ApServiceType = z.infer<typeof apServiceTypeSchema>

export const costAllocationTargetTypeSchema = z.enum([
  "departure",
  "product",
  "booking",
  "traveler",
  "unattributed",
])
export const costAllocationSplitMethodSchema = z.enum(["manual", "per_pax", "equal", "weighted"])

export const supplierInvoiceLineRecordSchema = z.object({
  id: z.string(),
  supplierInvoiceId: z.string(),
  description: z.string(),
  serviceType: apServiceTypeSchema,
  costCategoryId: z.string().nullable().optional(),
  supplierServiceId: z.string().nullable(),
  quantity: z.number().int(),
  unitAmountCents: z.number().int(),
  taxRateBps: z.number().int().nullable(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SupplierInvoiceLineRecord = z.infer<typeof supplierInvoiceLineRecordSchema>

export const supplierCostAllocationRecordSchema = z.object({
  id: z.string(),
  supplierInvoiceId: z.string(),
  supplierInvoiceLineId: z.string().nullable(),
  targetType: costAllocationTargetTypeSchema,
  departureId: z.string().nullable(),
  productId: z.string().nullable(),
  bookingId: z.string().nullable(),
  bookingItemId: z.string().nullable(),
  travelerId: z.string().nullable(),
  amountCents: z.number().int(),
  baseAmountCents: z.number().int().nullable(),
  splitMethod: costAllocationSplitMethodSchema,
  /** Resolved friendly label for the target (departure date+product, product, booking no). */
  targetLabel: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SupplierCostAllocationRecord = z.infer<typeof supplierCostAllocationRecordSchema>

export const supplierInvoiceRecordSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  /** Resolved supplier display name; `null` when the id resolves to nothing. */
  supplierName: z.string().nullable().optional(),
  supplierInvoiceNo: z.string(),
  internalRef: z.string().nullable(),
  status: supplierInvoiceStatusSchema,
  currency: z.string(),
  baseCurrency: z.string().nullable(),
  fxRateSetId: z.string().nullable(),
  subtotalCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  balanceDueCents: z.number().int(),
  taxRegimeId: z.string().nullable(),
  issueDate: z.string(),
  dueDate: z.string().nullable(),
  receivedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  storageKey: z.string().nullable(),
  extractionId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SupplierInvoiceRecord = z.infer<typeof supplierInvoiceRecordSchema>

export const supplierInvoiceDetailRecordSchema = supplierInvoiceRecordSchema.extend({
  lines: z.array(supplierInvoiceLineRecordSchema),
  allocations: z.array(supplierCostAllocationRecordSchema),
})
export type SupplierInvoiceDetailRecord = z.infer<typeof supplierInvoiceDetailRecordSchema>

export const supplierInvoiceAttachmentRecordSchema = z.object({
  id: z.string(),
  supplierInvoiceId: z.string(),
  kind: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  storageKey: z.string().nullable(),
  checksum: z.string().nullable(),
  createdAt: z.string(),
})
export type SupplierInvoiceAttachmentRecord = z.infer<typeof supplierInvoiceAttachmentRecordSchema>
