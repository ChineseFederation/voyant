import { z } from "zod"

export type ManagedBookingContractReviewSnapshot = z.infer<
  typeof bookingContractReviewSnapshotSchema
>

export type ManagedBookingContractReviewWorkflow = z.infer<
  typeof bookingContractReviewWorkflowSchema
>

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function parseManagedBookingContractReviewWorkflow(
  metadata: unknown,
): ManagedBookingContractReviewWorkflow | null {
  const workflow = record(record(metadata).bookingContractWorkflow)
  const parsed = bookingContractReviewWorkflowSchema.safeParse(workflow)
  return parsed.success ? parsed.data : null
}

const bookingContractReviewSnapshotSchema = z.object({
  booking: z.object({
    id: z.string(),
    reference: z.string(),
    customerName: z.string().nullable(),
    customerEmail: z.string().nullable(),
    language: z.string(),
    currency: z.string(),
    totalAmountCents: z.number().int().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
  }),
  products: z.array(
    z.object({
      title: z.string(),
      quantity: z.number().int().positive(),
      amountCents: z.number().int().nullable(),
      currency: z.string(),
    }),
  ),
  commercialTerms: z.record(z.string(), z.json()),
  template: z.object({
    id: z.string(),
    name: z.string(),
    versionId: z.string(),
    version: z.number().int().positive(),
    language: z.string(),
  }),
})

const bookingContractReviewWorkflowSchema = z
  .object({
    revision: z.number().int().positive(),
    previousRevisionId: z.string().nullable().optional(),
    reviewSnapshot: bookingContractReviewSnapshotSchema,
  })
  .passthrough()
