import { z } from "zod"

const nullableTrimmed = (max: number) => z.string().trim().min(1).max(max).nullable().optional()

export const bookingInquiryContactSchema = z
  .object({
    firstName: nullableTrimmed(120),
    lastName: nullableTrimmed(120),
    email: z.email().max(320).nullable().optional(),
    phone: nullableTrimmed(40),
  })
  .refine((contact) => Boolean(contact.email || contact.phone), {
    message: "An email address or phone number is required",
  })
  .transform((contact) => ({
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
  }))

export const submitBookingInquirySchema = z.object({
  productId: z.string().trim().min(1).max(255),
  departureId: z.string().trim().min(1).max(255).nullable().optional(),
  contact: bookingInquiryContactSchema,
  locale: z.string().trim().min(2).max(35),
  message: z.string().trim().min(1).max(5000),
})

export const bookingInquiryReceiptSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  productId: z.string(),
  departureId: z.string().nullable(),
  contact: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  locale: z.string(),
  message: z.string(),
  status: z.enum(["open", "closed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type SubmitBookingInquiryRequest = z.infer<typeof submitBookingInquirySchema>
export type BookingInquiryReceipt = z.infer<typeof bookingInquiryReceiptSchema>
