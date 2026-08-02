import {
  linkExternalReference,
  reconcileCounterpartyActivity,
  resolveCounterparty,
  routeCounterpartyEvent,
} from "./interface.js"
import { channelServiceOperations } from "./service/channels.js"
import { commercialServiceOperations } from "./service/commercial.js"
import { inventoryServiceOperations } from "./service/inventory.js"
import { publicationServiceOperations } from "./service/publications.js"
import { settlementPolicyServiceOperations } from "./service/settlement-policies.js"
import { settlementServiceOperations } from "./service/settlements.js"

export const distributionService = {
  resolveCounterparty,
  linkExternalReference,
  routeCounterpartyEvent,
  reconcileCounterpartyActivity,
  ...channelServiceOperations,
  ...commercialServiceOperations,
  ...publicationServiceOperations,
  ...inventoryServiceOperations,
  ...settlementServiceOperations,
  ...settlementPolicyServiceOperations,
}
