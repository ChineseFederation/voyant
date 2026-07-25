import { createActionLedgerCapabilityRegistry } from "@voyant-travel/action-ledger"

import { BOOKING_ACTION_LEDGER_CAPABILITIES } from "./action-declarations.js"

export {
  BOOKING_ACTION_LEDGER_CAPABILITIES,
  BOOKING_PII_READ_CAPABILITY,
  BOOKING_STATUS_CAPABILITIES,
} from "./action-declarations.js"

export const bookingActionLedgerCapabilityRegistry = createActionLedgerCapabilityRegistry(
  BOOKING_ACTION_LEDGER_CAPABILITIES,
)
