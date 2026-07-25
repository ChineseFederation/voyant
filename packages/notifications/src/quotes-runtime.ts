import type { QuotesNotificationsRuntime } from "@voyant-travel/quotes/runtime-port"

import type { DurableNotificationProviderRuntime } from "./durable-provider-port.js"
import { createNotificationService } from "./service.js"
import { enqueueNotification } from "./service-durable-send.js"

/** Adapt Notifications delivery to Quotes' narrow, template-only proposal contract. */
export function createQuotesNotificationsRuntime(
  selectedRuntime: DurableNotificationProviderRuntime,
): QuotesNotificationsRuntime {
  const providers = [...selectedRuntime.providers]
  const providerNames = providers.map(({ name }) => name)
  return {
    providerNames,
    async enqueueQuoteProposal(db, input) {
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
          targetId: input.quoteVersionId,
          metadata: {
            workflow: "quotes.snapshot-and-send",
            quoteId: input.quoteId,
            quoteVersionId: input.quoteVersionId,
          },
        },
      })
      if (!delivery) throw new Error("Notifications returned no quote proposal delivery")
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
