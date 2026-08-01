import type { ProposalsNotificationsRuntime } from "@voyant-travel/proposals/runtime-port"

import type { DurableNotificationProviderRuntime } from "./durable-provider-port.js"
import { createNotificationService } from "./service.js"
import { enqueueNotification } from "./service-durable-send.js"

/** Adapt Notifications delivery to Proposals' narrow, template-only notification contract. */
export function createProposalsNotificationsRuntime(
  selectedRuntime: DurableNotificationProviderRuntime,
): ProposalsNotificationsRuntime {
  const providers = [...selectedRuntime.providers]
  const providerNames = providers.map(({ name }) => name)
  return {
    providerNames,
    async enqueueProposalNotification(db, input) {
      const delivery = await enqueueNotification({
        db,
        registry: createNotificationService(providers),
        input: {
          idempotencyKey: input.idempotencyKey,
          templateSlug: input.templateSlug,
          to: input.to,
          channel: input.channel,
          data: input.data,
          targetType: "other",
          targetId: input.proposalVersionId,
          metadata: {
            workflow: "proposals.snapshot-and-send",
            proposalId: input.proposalId,
            proposalVersionId: input.proposalVersionId,
          },
        },
      })
      if (!delivery) throw new Error("Notifications returned no proposal notification delivery")
      return {
        id: delivery.id,
        status: delivery.status,
        channel: delivery.channel,
        provider: delivery.provider,
        providerMessageId: delivery.providerMessageId,
        toAddress: delivery.toAddress,
      }
    },
  }
}
