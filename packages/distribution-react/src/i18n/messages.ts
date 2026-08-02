import type {
  ChannelCommissionRuleRow,
  ChannelContractRow,
  ChannelRow,
  ChannelWebhookEventRow,
} from "../index.js"

export type ChannelKind = ChannelRow["kind"]
export type ChannelStatus = ChannelRow["status"]
export type ContractStatus = ChannelContractRow["status"]
export type PaymentOwner = ChannelContractRow["paymentOwner"]
export type CancellationOwner = ChannelContractRow["cancellationOwner"]
export type CommissionScope = ChannelCommissionRuleRow["scope"]
export type CommissionType = ChannelCommissionRuleRow["commissionType"]
export type WebhookStatus = ChannelWebhookEventRow["status"]
export type DistributionEntity =
  | "channel"
  | "contract"
  | "commissionRule"
  | "mapping"
  | "bookingLink"
  | "webhookEvent"

export type DistributionUiMessages = {
  common: {
    open: string
    view: string
    cancel: string
    create: string
    save: string
    delete: string
    clearFilters: string
    clearSelection: string
    backToDistribution: string
    loading: string
    none: string
    openEnded: string
    noReference: string
    unmappedStatus: string
    yes: string
    searchPlaceholder: string
    allChannels: string
    received: string
    supplier: string
    channelLabel: string
    contractLabel: string
    productLabel: string
    bookingLabel: string
    supplierLabel: string
    createdLabel: string
    updatedLabel: string
    emptyValue: string
    dateTimeFallback: string
    active: string
    inactive: string
    selectionSummary: string
    resultSummary: string
    deleteSummary: string
    entities: Record<
      DistributionEntity,
      {
        one: string
        other: string
      }
    >
    cancellationOwnerLabels: Record<CancellationOwner, string>
    channelKindLabels: Record<ChannelKind, string>
    channelStatusLabels: Record<ChannelStatus, string>
    contractStatusLabels: Record<ContractStatus, string>
    paymentOwnerLabels: Record<PaymentOwner, string>
    commissionScopeLabels: Record<CommissionScope, string>
    commissionTypeLabels: Record<CommissionType, string>
    webhookStatusLabels: Record<WebhookStatus, string>
  }
  page: {
    title: string
    description: string
    tabs: {
      channels: string
      contracts: string
      commissions: string
      mappings: string
      bookingLinks: string
      webhooks: string
    }
    bulkVerbs: {
      activated: string
      archived: string
      deleted: string
      expired: string
      deactivated: string
      processed: string
      ignored: string
    }
  }
  overview: {
    metrics: {
      activeChannels: {
        title: string
        description: string
      }
      activeContracts: {
        title: string
        description: string
      }
      activeMappings: {
        title: string
        description: string
      }
      syncQueue: {
        title: string
        description: string
      }
    }
    webhookQueue: {
      title: string
      empty: string
    }
    contractsToReview: {
      title: string
      empty: string
    }
    filters: {
      allChannelsPlaceholder: string
    }
  }
  channelSync: {
    title: string
    description: string
    setup: {
      title: string
      description: string
      connector: {
        title: string
        ready: string
        missing: string
      }
      mapping: {
        title: string
        ready: string
        missing: string
      }
      delivery: {
        title: string
        ready: string
        missing: string
      }
    }
    monitoring: {
      title: string
      description: string
    }
    throttledTitle: string
    throttledBody: string
    statusLabels: Record<"pending" | "ok" | "failed" | "compensated", string>
    statusTiles: Record<
      "pending" | "ok" | "failed" | "compensated",
      {
        label: string
        description: string
      }
    >
    filters: {
      booking: string
      bookingPlaceholder: string
      bookingSearching: string
      bookingEmpty: string
      channel: string
      channelPlaceholder: string
      channelEmpty: string
    }
    table: {
      title: string
      filteredDescription: string
      defaultDescription: string
      noMatchesTitle: string
      noLinksTitle: string
      noMatchesDescription: string
      noLinksDescription: string
      booking: string
      channel: string
      status: string
      attempts: string
      lastPush: string
      externalRef: string
      actions: string
      itemPrefix: string
      deliveries: string
      retry: string
    }
    reconcile: {
      trigger: string
      menuLabel: string
      bookings: string
      priority: string
      availability: string
      content: string
      lastRun: string
    }
    feedback: {
      dismiss: string
      retry: {
        title: string
        processed: string
        bookingMissing: string
        noPendingLinks: string
        noTargets: string
        noAdapter: string
        noMapping: string
        ok: string
        failed: string
        unknownError: string
      }
      reconcile: {
        title: string
        success: string
        failed: string
      }
    }
    refresh: {
      loading: string
      title: string
      refreshing: string
      updatedAgo: string
    }
    drawer: {
      title: string
      bookingScopeDescription: string
      itemScopeDescription: string
      emptyTitle: string
      emptyDescription: string
      attempt: string
      httpStatus: string
    }
  }
  tables: {
    channel: {
      channel: string
      kind: string
      status: string
      website: string
    }
    contract: {
      channel: string
      supplier: string
      status: string
      payment: string
      start: string
    }
    commission: {
      contract: string
      scope: string
      product: string
      type: string
      amount: string
    }
    mapping: {
      channel: string
      product: string
      externalProduct: string
      status: string
    }
    bookingLink: {
      channel: string
      booking: string
      externalBooking: string
      externalStatus: string
      synced: string
    }
    webhook: {
      channel: string
      eventType: string
      status: string
      received: string
      processed: string
    }
  }
  tabs: {
    channels: DistributionBulkTabMessages<"activate" | "archive" | "delete">
    contracts: DistributionBulkTabMessages<"activate" | "expire" | "delete">
    commissions: DistributionBulkTabMessages<"delete">
    mappings: DistributionBulkTabMessages<"activate" | "deactivate" | "delete">
    bookingLinks: DistributionBulkTabMessages<"delete">
    webhooks: DistributionBulkTabMessages<"markProcessed" | "ignore" | "delete">
  }
  settings: {
    channelsPage: {
      title: string
      description: string
      addChannel: string
      empty: string
      edit: string
      delete: string
      deleteConfirm: string
      deleteDescription: string
      editSheetTitle: string
      newSheetTitle: string
      nameLabel: string
      namePlaceholder: string
      kindLabel: string
      statusLabel: string
      websiteLabel: string
      websitePlaceholder: string
      primaryContactLabel: string
      primaryContactPlaceholder: string
      contactEmailLabel: string
      contactEmailPlaceholder: string
      saveChanges: string
      createChannel: string
      validationNameRequired: string
      validationInvalidUrl: string
      validationInvalidEmail: string
      paginationShowing: string
      paginationPage: string
      paginationPrevious: string
      paginationNext: string
      publication: {
        open: string
        title: string
        titleEmpty: string
        defaultDeny: string
        precedence: string
        inactiveWarning: string
        productsTitle: string
        suppliersTitle: string
        productLabel: string
        supplierLabel: string
        productPlaceholder: string
        supplierPlaceholder: string
        supplierOptional: string
        decisionLabel: string
        include: string
        exclude: string
        reasonLabel: string
        reasonPlaceholder: string
        saveProduct: string
        saveSupplier: string
        previewSupplier: string
        supplierImpact: string
        confirmSupplierImpact: string
        previewRequiredCurrent: string
        productsEmpty: string
        suppliersEmpty: string
        noReason: string
        editRule: string
        deleteRule: string
        whyTitle: string
        whyDescription: string
        published: string
        denied: string
        source: string
        reason: string
      }
    }
  }
  details: {
    channel: {
      notFound: string
      title: string
      deleteConfirm: string
      deleteDescription: string
      deleteButton: string
      sections: {
        details: string
        metadata: string
        contracts: string
        mappings: string
        bookingLinks: string
        webhooks: string
      }
      labels: {
        website: string
        contactName: string
        contactEmail: string
        supplier: string
        payment: string
        cancellation: string
        externalProduct: string
        externalBooking: string
        reference: string
        lastSynced: string
        rate: string
        category: string
        booking: string
      }
      empty: {
        metadata: string
        contracts: string
        mappings: string
        bookingLinks: string
        webhooks: string
      }
    }
    contract: {
      notFound: string
      title: string
      deleteConfirm: string
      deleteDescription: string
      deleteButton: string
      openChannel: string
      sections: {
        details: string
        notes: string
        commissionRules: string
      }
      labels: {
        supplier: string
        endsAt: string
        paymentOwner: string
        cancellationOwner: string
        settlementTerms: string
        notes: string
        amount: string
        basisPoints: string
        rate: string
        category: string
        valid: string
      }
      empty: {
        commissionRules: string
      }
    }
    commissionRule: {
      notFound: string
      title: string
      deleteConfirm: string
      deleteDescription: string
      deleteButton: string
      openContract: string
      openProduct: string
      sections: {
        details: string
      }
      labels: {
        amount: string
        basisPoints: string
        externalRate: string
        externalCategory: string
        valid: string
      }
    }
    bookingLink: {
      notFound: string
      title: string
      deleteConfirm: string
      deleteDescription: string
      deleteButton: string
      openChannel: string
      openBooking: string
      sections: {
        details: string
      }
      labels: {
        externalBooking: string
        reference: string
        bookedAtExternal: string
        lastSynced: string
      }
    }
    webhookEvent: {
      notFound: string
      title: string
      deleteConfirm: string
      deleteDescription: string
      deleteButton: string
      openChannel: string
      sections: {
        details: string
        payload: string
      }
      labels: {
        externalEvent: string
        received: string
        processed: string
        error: string
      }
    }
    mapping: {
      notFound: string
      title: string
      deleteConfirm: string
      deleteDescription: string
      deleteButton: string
      openChannel: string
      openProduct: string
      sections: {
        details: string
      }
      labels: {
        externalProduct: string
        externalRate: string
        externalCategory: string
      }
    }
  }
}

type DistributionBulkTabMessages<TAction extends string> = {
  title: string
  description: string
  actionLabel: string
  empty: string
  actions: Record<
    TAction,
    {
      button: string
      confirm: string
      title: string
      description: string
    }
  >
}
