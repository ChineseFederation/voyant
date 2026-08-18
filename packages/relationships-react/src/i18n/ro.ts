import type { CrmUiMessages } from "./messages.js"
import { crmUiRoBaseMessages } from "./ro/base.js"
import { crmUiRoCommerceMessages } from "./ro/commerce.js"
import { crmUiRoDetailMessages } from "./ro/detail.js"
import { crmUiRoInquiryMessages } from "./ro/inquiries.js"
import { crmUiRoListsMessages } from "./ro/lists.js"

export const crmUiRo = {
  ...crmUiRoBaseMessages,
  ...crmUiRoListsMessages,
  ...crmUiRoDetailMessages,
  ...crmUiRoCommerceMessages,
  ...crmUiRoInquiryMessages,
} satisfies CrmUiMessages
