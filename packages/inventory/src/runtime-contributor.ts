import {
  type ActionLedgerInventoryDriftRuntime,
  actionLedgerInventoryDriftRuntimePort,
} from "@voyant-travel/action-ledger/runtime-port"
import {
  type BookingsInventoryRuntime,
  bookingsInventoryRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import { catalogInventoryRuntimeExtensionPort } from "@voyant-travel/catalog/runtime-contracts"
import {
  type CommerceInventoryRuntime,
  commerceInventoryRuntimePort,
} from "@voyant-travel/commerce/runtime-port"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { type DocumentRenderer, documentRendererPort } from "@voyant-travel/core/document-rendering"
import type { VoyantPort } from "@voyant-travel/core/project"
import {
  type FinanceInventoryPaymentPolicyRuntime,
  financeInventoryPaymentPolicyRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import {
  type InquiryTargetAuthorityRuntime,
  inquiryTargetAuthorityRuntimePort,
} from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import { and, eq } from "drizzle-orm"
import { checkProductActionLedgerDrift } from "./action-ledger-drift.js"
import {
  createInventoryPaymentPolicyRuntime,
  readPolicySourceFromInternalNotes,
  stampPolicySourceOnBooking,
} from "./booking-payment-policy-runtime.js"
import { createInventoryBrochureRuntime } from "./brochure-runtime.js"
import { catalogInventoryRuntimeExtension } from "./catalog-runtime-extension.js"
import {
  type InventoryRuntime,
  inventoryBrochureRuntimePort,
  inventoryRuntimePort,
} from "./runtime-ports.js"
import { productCapabilities, products } from "./schema.js"
import { productsService } from "./service.js"

type RuntimePortValue<T> = T | Promise<T>

export interface InventoryRuntimePortContribution {
  inventory: RuntimePortValue<InventoryRuntime>
  brochure: RuntimePortValue<ReturnType<typeof createInventoryBrochureRuntime>>
}

export interface InventoryRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort?<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

function createInventoryRuntime(_primitives: VoyantRuntimeHostPrimitives): InventoryRuntime {
  return {
    bootstrap: () => undefined,
  }
}

/** Package-owned registration map for Inventory deployment adapters. */
export function createInventoryRuntimePortContribution(
  host: InventoryRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const renderer =
    host.hasRuntimePort?.(documentRendererPort) && host.getRuntimePort
      ? host.getRuntimePort<DocumentRenderer>(documentRendererPort)
      : null
  const inventory = createInventoryRuntime(host.primitives)
  const brochure = createInventoryBrochureRuntime(host.primitives, renderer)
  return {
    [inquiryTargetAuthorityRuntimePort.id]: {
      kind: "product",
      targetExists: async (db, targetId) =>
        (await productsService.getProductById(db as PostgresJsDatabase, targetId)) != null,
      resolveSnapshot: async (db, targetId) => {
        const product = await productsService.getProductById(db as PostgresJsDatabase, targetId)
        return product
          ? { title: product.name, startDate: product.startDate, endDate: product.endDate }
          : null
      },
    } satisfies InquiryTargetAuthorityRuntime,
    [catalogInventoryRuntimeExtensionPort.id]: catalogInventoryRuntimeExtension,
    [commerceInventoryRuntimePort.id]: {
      async getOwnedProductName(db, entityModule, entityId) {
        if (entityModule !== "products") return null
        return (await productsService.getProductById(db, entityId))?.name ?? null
      },
      listAllProductIds: (db) =>
        db
          .select({ id: products.id })
          .from(products)
          .then((rows) => rows.map((row) => row.id)),
    } satisfies CommerceInventoryRuntime,
    [actionLedgerInventoryDriftRuntimePort.id]: {
      checkProductDrift: checkProductActionLedgerDrift,
    } satisfies ActionLedgerInventoryDriftRuntime,
    [inventoryRuntimePort.id]: inventory,
    [inventoryBrochureRuntimePort.id]: brochure,
    [bookingsInventoryRuntimePort.id]: {
      resolveProductSnapshot: async (db, productId) => {
        const [product, capabilityRows] = await Promise.all([
          db
            .select()
            .from(products)
            .where(eq(products.id, productId))
            .limit(1)
            .then((rows) => rows[0] ?? null),
          db
            .select({ capability: productCapabilities.capability })
            .from(productCapabilities)
            .where(
              and(
                eq(productCapabilities.productId, productId),
                eq(productCapabilities.enabled, true),
              ),
            ),
        ])
        if (!product) return null
        return {
          id: product.id,
          bookingMode: product.bookingMode,
          capabilities: capabilityRows.map((row) => row.capability),
        }
      },
    } satisfies BookingsInventoryRuntime,
    [financeInventoryPaymentPolicyRuntimePort.id]: {
      createPaymentPolicyRuntime: createInventoryPaymentPolicyRuntime,
      stampPolicySourceOnBooking,
      readPolicySourceFromInternalNotes,
    } satisfies FinanceInventoryPaymentPolicyRuntime,
  }
}
