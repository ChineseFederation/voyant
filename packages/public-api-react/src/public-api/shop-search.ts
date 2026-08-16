import { z } from "zod"
import { publicApiCustomerBookableProductVerticals } from "../routing.js"

export const shopSearchSchema = z.object({
  q: z.string().optional(),
  vertical: z.enum(publicApiCustomerBookableProductVerticals).optional().catch(undefined),
})
