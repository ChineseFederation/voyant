// agent-quality: file-size exception -- owner: legal-react; existing locale dictionary stays co-located until a dedicated split preserves behavior and tests.
import type { LegalContractRecord } from "../index.js"

export const legalContractScopes = ["customer", "supplier", "partner", "channel", "other"] as const

export const legalContractStatuses = [
  "draft",
  "issued",
  "sent",
  "signed",
  "executed",
  "expired",
  "void",
] as const

export const legalPolicyKinds = [
  "cancellation",
  "payment",
  "terms_and_conditions",
  "privacy",
  "refund",
  "commission",
  "guarantee",
  "other",
] as const

export const legalRuleTypes = [
  "window",
  "percentage",
  "flat_amount",
  "date_range",
  "custom",
] as const

export const legalRefundTypes = ["cash", "credit", "cash_or_credit", "none"] as const

export const legalSignatureMethods = ["manual", "electronic", "docusign", "other"] as const

export type LegalContractStatus = LegalContractRecord["status"]
export type LegalContractScope = (typeof legalContractScopes)[number]
export type LegalContractStatusValue = (typeof legalContractStatuses)[number]
export type LegalPolicyKind = (typeof legalPolicyKinds)[number]
export type LegalRuleType = (typeof legalRuleTypes)[number]
export type LegalRefundType = (typeof legalRefundTypes)[number]
export type LegalSignatureMethod = (typeof legalSignatureMethods)[number]

export type LegalUiMessages = {
  common: {
    cancel: string
    saveChanges: string
    create: string
    edit: string
    add: string
    delete: string
    loading: string
    none: string
    selectPlaceholder: string
    optionalPlaceholder: string
    kilobytes: string
    active: string
    inactive: string
    open: string
    addVersion: string
    noResultsDash: string
    contractScopeLabels: Record<LegalContractScope, string>
    contractStatusLabels: Record<LegalContractStatusValue, string>
    policyKindLabels: Record<LegalPolicyKind, string>
  }
  bookingContractCard: {
    heading: string
    empty: string
    download: string
    noAttachments: string
    issuedAt: string
    contractNumber: string
    unsaved: string
    contractStatusLabels: Record<LegalContractStatus, string>
  }
  numberSeriesPage: {
    title: string
    description: string
    actions: {
      create: string
    }
    columns: {
      name: string
      prefix: string
      separator: string
      pad: string
      current: string
      reset: string
      scope: string
      status: string
    }
    active: string
    inactive: string
    empty: string
    editAction: string
    deleteAction: string
    deleteConfirm: string
  }
  contractSendDialog: {
    title: string
    fallbackSubject: string
    missingRecipient: string
    alreadySentWarning: string
    fields: {
      to: string
      subject: string
      message: string
      attachments: string
    }
    messageHint: string
    recipientPlaceholder: string
    actions: {
      cancel: string
      send: string
    }
  }
  bookingContractReviewDialog: {
    title: string
    description: string
    unavailable: string
    loadFailed: string
    fields: {
      booking: string
      customer: string
      template: string
      revision: string
      total: string
      products: string
    }
    templateSummary: string
    productLine: string
    bodyHeading: string
    bodyUnavailable: string
    actions: {
      cancel: string
      issue: string
    }
  }
  contractDialog: {
    titleNew: string
    titleEdit: string
    createAction: string
    setupSectionTitle: string
    setupSectionDescription: string
    linkedSectionTitle: string
    linkedSectionDescription: string
    templateVariablesSectionTitle: string
    templateVariablesNoVersion: string
    templateVariablesNoneDetected: string
    additionalVariablesTitle: string
    additionalVariablesDescription: string
    addVariable: string
    additionalVariablesEmpty: string
    variableKeyPlaceholder: string
    variableValuePlaceholder: string
    metadataSectionTitle: string
    metadataSectionDescription: string
    addMetadata: string
    metadataEmpty: string
    metadataKeyPlaceholder: string
    metadataValuePlaceholder: string
    titleLabel: string
    titlePlaceholder: string
    contractNumberLabel: string
    contractNumberPlaceholder: string
    scopeLabel: string
    languageLabel: string
    languagePlaceholder: string
    languageSearchPlaceholder: string
    languageEmpty: string
    templateLabel: string
    templatePlaceholder: string
    templateSearchPlaceholder: string
    templateEmpty: string
    templateVersionLabel: string
    templateVersionPlaceholder: string
    templateVersionSearchPlaceholder: string
    templateVersionEmpty: string
    templateVersionPickTemplateFirst: string
    templateVersionMostRecentDraft: string
    templateVersionSelectedFallback: string
    templateVersionLabelFormat: string
    numberSeriesLabel: string
    numberSeriesPlaceholder: string
    numberSeriesSearchPlaceholder: string
    numberSeriesEmpty: string
    seriesActive: string
    seriesInactive: string
    expiresAtLabel: string
    expiresAtPlaceholder: string
    personLabel: string
    organizationLabel: string
    supplierLabel: string
    channelLabel: string
    loading: string
    booleanYes: string
    booleanNo: string
    dateFallbackPlaceholder: string
    datetimeFallbackPlaceholder: string
    valueFallbackPlaceholder: string
    validation: {
      titleRequired: string
    }
  }
  contractsPage: {
    title: string
    description: string
    create: string
    searchPlaceholder: string
    empty: string
    loadFailed: string
    filters: {
      button: string
      clear: string
      scope: string
      status: string
      person: string
      allScopes: string
      allStatuses: string
      allPeople: string
      personSearchPlaceholder: string
      personEmpty: string
      personSearching: string
      clearPerson: string
    }
    columns: {
      number: string
      title: string
      scope: string
      status: string
      person: string
      created: string
    }
    pagination: {
      showing: string
      page: string
      previous: string
      next: string
    }
  }
  contractDetailPage: {
    title: string
    notFound: string
    backToContracts: string
    voidConfirm: string
    deleteConfirm: string
    deleteAttachmentConfirm: string
    actions: {
      issue: string
      send: string
      execute: string
      void: string
      addSignature: string
      addAttachment: string
      addDocument: string
    }
    generationFailure: {
      defaultLabel: string
      templateError: string
      generatorFailed: string
      fallbackReason: string
    }
    sections: {
      details: string
      parties: string
      signatures: string
      attachments: string
      documents: string
    }
    fields: {
      language: string
      templateVersion: string
      series: string
      expires: string
      created: string
      updated: string
      person: string
      organization: string
      supplier: string
      channel: string
      booking: string
      target: string
      legacyTransactionOffer: string
      legacyTransactionOrder: string
      name: string
      email: string
      role: string
      method: string
      signedAt: string
      kind: string
      mimeType: string
      size: string
    }
    empty: {
      noParties: string
      noSignatures: string
      noAttachments: string
    }
    units: {
      bytes: string
      kilobytes: string
      megabytes: string
    }
  }
  policiesPage: {
    title: string
    description: string
    create: string
    searchPlaceholder: string
    allKinds: string
    empty: string
    loadFailed: string
    filters: {
      button: string
      clear: string
      kind: string
    }
    columns: {
      name: string
      slug: string
      kind: string
      language: string
      created: string
    }
    pagination: {
      showing: string
      page: string
      previous: string
      next: string
    }
  }
  policyDetailPage: {
    notFound: string
    backToPolicies: string
    deleteConfirm: string
    deleteAssignmentConfirm: string
    deleteRuleConfirm: string
    always: string
    actions: {
      newVersion: string
      publish: string
      retire: string
      addRule: string
      addAssignment: string
    }
    sections: {
      versions: string
      assignments: string
      acceptances: string
      body: string
      rules: string
    }
    fields: {
      scope: string
      targetId: string
      priority: string
      valid: string
      versionId: string
      personId: string
      bookingId: string
      target: string
      method: string
      acceptedAt: string
      sort: string
      type: string
      label: string
      days: string
      refund: string
      refundType: string
    }
    empty: {
      noVersions: string
      noAssignments: string
      noAcceptances: string
      noRules: string
    }
    versionStatusLabels: Record<"draft" | "published" | "retired", string>
    assignmentScopeLabels: Record<
      "product" | "channel" | "supplier" | "market" | "organization" | "global",
      string
    >
  }
  templatesPage: {
    title: string
    description: string
    create: string
    searchPlaceholder: string
    empty: string
    loadFailed: string
    versions: string
    noVersions: string
    filters: {
      button: string
      clear: string
      scope: string
      allScopes: string
    }
    columns: {
      name: string
      scope: string
      status: string
      created: string
      version: string
      changelog: string
      createdBy: string
      createdAt: string
    }
    deleteConfirm: string
    editAction: string
    deleteAction: string
  }
  templateDetailPage: {
    notFound: string
    backToTemplates: string
    currentBadge: string
    variablesDescription: string
    deleteConfirm: string
    actions: {
      addVersion: string
    }
    sections: {
      details: string
      description: string
      currentBody: string
      variables: string
      versions: string
    }
    fields: {
      language: string
      currentVersionId: string
      created: string
      updated: string
      version: string
      changelog: string
      createdBy: string
      createdAt: string
    }
    empty: {
      noDescription: string
      noVersions: string
    }
  }
  attachmentDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      file: string
      name: string
      kind: string
      mimeType: string
      fileSize: string
      checksum: string
      storageKey: string
    }
    kindLabels: {
      document: string
      appendix: string
      scan: string
    }
    placeholders: {
      file: string
      name: string
      kind: string
      mimeType: string
      fileSize: string
      checksum: string
      storageKey: string
    }
    actions: {
      create: string
    }
    validation: {
      nameRequired: string
      fileRequired: string
    }
  }
  policyRuleDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      ruleType: string
      sortOrder: string
      label: string
      daysBeforeDeparture: string
      refundPercent: string
      refundType: string
      currency: string
      flatAmountCents: string
    }
    placeholders: {
      label: string
      daysBeforeDeparture: string
      refundPercent: string
      flatAmountCents: string
    }
    actions: {
      create: string
    }
    ruleTypeLabels: Record<LegalRuleType, string>
    refundTypeLabels: Record<LegalRefundType, string>
    validation: {
      refundPercentMin: string
      refundPercentMax: string
    }
  }
  signatureDialog: {
    title: string
    fields: {
      signerName: string
      signerEmail: string
      signerRole: string
      method: string
      provider: string
      externalReference: string
    }
    placeholders: {
      signerName: string
      signerEmail: string
      signerRole: string
      provider: string
      externalReference: string
    }
    actions: {
      submit: string
    }
    methodLabels: Record<LegalSignatureMethod, string>
    validation: {
      signerNameRequired: string
      signerEmailInvalid: string
    }
  }
  policyVersionDialog: {
    titles: {
      create: string
      edit: string
    }
    fields: {
      title: string
      body: string
    }
    placeholders: {
      title: string
      body: string
    }
    actions: {
      create: string
    }
    validation: {
      titleRequired: string
    }
  }
}
