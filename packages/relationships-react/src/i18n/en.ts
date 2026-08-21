import { crmUiEnBaseMessages } from "./en/base.js"
import { crmUiEnCommerceMessages } from "./en/commerce.js"
import { crmUiEnDetailMessages } from "./en/detail.js"
import { crmUiEnInquiryMessages } from "./en/inquiries.js"
import { crmUiEnListsMessages } from "./en/lists.js"
import type { CrmUiMessages } from "./messages.js"

export const crmUiEn = {
  ...crmUiEnBaseMessages,
  ...crmUiEnListsMessages,
  ...crmUiEnDetailMessages,
  ...crmUiEnCommerceMessages,
  ...crmUiEnInquiryMessages,
} satisfies CrmUiMessages
