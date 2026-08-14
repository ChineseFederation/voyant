export interface PaginationFilters {
  limit?: number | undefined
  offset?: number | undefined
}

export interface SuppliersListFilters extends PaginationFilters {}
export interface ProductsListFilters extends PaginationFilters {}
export interface BookingsListFilters extends PaginationFilters {}
export interface ChannelsListFilters extends PaginationFilters {
  /**
   * How to treat system-provisioned channels (today: Direct). Defaults to
   * including them, because publication and product-mapping pickers must be
   * able to target Direct. Only the counterparty list asks to drop it.
   */
  system?: "include" | "exclude" | "only" | undefined
}
export interface ContractsListFilters extends PaginationFilters {
  channelId?: string | undefined
}
export interface CommissionRulesListFilters extends PaginationFilters {
  contractId?: string | undefined
}
export interface MappingsListFilters extends PaginationFilters {
  channelId?: string | undefined
}
export interface ProductPublicationsListFilters extends PaginationFilters {
  channelId?: string | undefined
  productId?: string | undefined
  decision?: "include" | "exclude" | undefined
}
export interface SupplierPublicationsListFilters extends PaginationFilters {
  channelId?: string | undefined
  supplierId?: string | undefined
  decision?: "include" | "exclude" | undefined
}
export interface SourcePublicationsListFilters extends PaginationFilters {
  channelId?: string | undefined
  sourceKind?: string | undefined
  sourceConnectionId?: string | undefined
  decision?: "include" | "exclude" | undefined
}
export interface BookingLinksListFilters extends PaginationFilters {
  channelId?: string | undefined
}
export interface WebhookEventsListFilters extends PaginationFilters {
  channelId?: string | undefined
}
export interface ContractsByChannelListFilters extends PaginationFilters {
  channelId?: string | undefined
}

export const distributionQueryKeys = {
  all: ["voyant", "distribution"] as const,

  suppliers: () => [...distributionQueryKeys.all, "suppliers"] as const,
  suppliersList: (filters: SuppliersListFilters) =>
    [...distributionQueryKeys.suppliers(), "list", filters] as const,

  products: () => [...distributionQueryKeys.all, "products"] as const,
  productsList: (filters: ProductsListFilters) =>
    [...distributionQueryKeys.products(), "list", filters] as const,

  bookings: () => [...distributionQueryKeys.all, "bookings"] as const,
  bookingsList: (filters: BookingsListFilters) =>
    [...distributionQueryKeys.bookings(), "list", filters] as const,

  channels: () => [...distributionQueryKeys.all, "channels"] as const,
  channelsList: (filters: ChannelsListFilters) =>
    [...distributionQueryKeys.channels(), "list", filters] as const,
  channel: (id: string) => [...distributionQueryKeys.channels(), "detail", id] as const,

  contracts: () => [...distributionQueryKeys.all, "contracts"] as const,
  contractsList: (filters: ContractsListFilters) =>
    [...distributionQueryKeys.contracts(), "list", filters] as const,
  contract: (id: string) => [...distributionQueryKeys.contracts(), "detail", id] as const,

  commissionRules: () => [...distributionQueryKeys.all, "commission-rules"] as const,
  commissionRulesList: (filters: CommissionRulesListFilters) =>
    [...distributionQueryKeys.commissionRules(), "list", filters] as const,
  commissionRule: (id: string) =>
    [...distributionQueryKeys.commissionRules(), "detail", id] as const,

  mappings: () => [...distributionQueryKeys.all, "product-mappings"] as const,
  mappingsList: (filters: MappingsListFilters) =>
    [...distributionQueryKeys.mappings(), "list", filters] as const,
  mapping: (id: string) => [...distributionQueryKeys.mappings(), "detail", id] as const,

  productPublications: () => [...distributionQueryKeys.all, "product-publications"] as const,
  productPublicationsList: (filters: ProductPublicationsListFilters) =>
    [...distributionQueryKeys.productPublications(), "list", filters] as const,
  supplierPublications: () => [...distributionQueryKeys.all, "supplier-publications"] as const,
  supplierPublicationsList: (filters: SupplierPublicationsListFilters) =>
    [...distributionQueryKeys.supplierPublications(), "list", filters] as const,
  sourcePublications: () => [...distributionQueryKeys.all, "source-publications"] as const,
  sourcePublicationsList: (filters: SourcePublicationsListFilters) =>
    [...distributionQueryKeys.sourcePublications(), "list", filters] as const,
  publicationSources: () => [...distributionQueryKeys.all, "publication-sources"] as const,
  effectivePublication: (
    channelId: string,
    productId: string,
    canonicalSupplierId?: string | null,
  ) =>
    [
      ...distributionQueryKeys.all,
      "effective-publication",
      channelId,
      productId,
      canonicalSupplierId ?? null,
    ] as const,

  bookingLinks: () => [...distributionQueryKeys.all, "booking-links"] as const,
  bookingLinksList: (filters: BookingLinksListFilters) =>
    [...distributionQueryKeys.bookingLinks(), "list", filters] as const,
  bookingLink: (id: string) => [...distributionQueryKeys.bookingLinks(), "detail", id] as const,

  webhookEvents: () => [...distributionQueryKeys.all, "webhook-events"] as const,
  webhookEventsList: (filters: WebhookEventsListFilters) =>
    [...distributionQueryKeys.webhookEvents(), "list", filters] as const,
  webhookEvent: (id: string) => [...distributionQueryKeys.webhookEvents(), "detail", id] as const,

  supplier: (id: string) => [...distributionQueryKeys.suppliers(), "detail", id] as const,
  product: (id: string) => [...distributionQueryKeys.products(), "detail", id] as const,
  booking: (id: string) => [...distributionQueryKeys.bookings(), "detail", id] as const,
} as const
