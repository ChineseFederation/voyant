import { z } from "zod"
import { storefrontCustomerBookableProductVerticals } from "../routing.js"

export const shopSearchSchema = z.object({
  q: z.string().optional(),
  vertical: z.enum(storefrontCustomerBookableProductVerticals).optional().catch(undefined),
})
