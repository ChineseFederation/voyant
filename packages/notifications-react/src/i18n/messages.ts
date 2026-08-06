export type NotificationsUiMessages = {
  common: {
    cancel: string
    save: string
    create: string
    edit: string
    delete: string
    add: string
    none: string
    loading: string
    optionalPlaceholder: string
  }
  stage: {
    listHeading: string
    listEmpty: string
    addStage: string
    deleteConfirm: string
    fields: {
      name: string
      orderIndex: string
      anchor: string
      windowStartDays: string
      windowEndDays: string
      cadenceKind: string
      cadenceEveryDays: string
      cadenceIntervals: string
      maxSendsInStage: string
      respectQuietHours: string
    }
    descriptions: {
      window: string
      cadence: string
      emptyIntervals: string
      stopConditions: string
      maxSendsInStage: string
      respectQuietHours: string
    }
    placeholders: {
      name: string
    }
    anchors: {
      due_date: string
      booking_created_at: string
      departure_date: string
      invoice_issued_at: string
      last_send_at: string
    }
    cadences: {
      once: string
      every_n_days: string
      escalating: string
    }
    intervalRow: {
      whenDaysUntilDueGT: string
      whenDaysUntilDueLT: string
      repeatEveryDays: string
      addInterval: string
      removeInterval: string
    }
    titles: {
      create: string
      edit: string
    }
  }
  channel: {
    listHeading: string
    listEmpty: string
    addChannel: string
    deleteConfirm: string
    fields: {
      orderIndex: string
      channel: string
      provider: string
      template: string
      recipientKind: string
    }
    channels: {
      email: string
      sms: string
    }
    recipientKinds: {
      primary: string
      cc: string
      bcc: string
    }
    providers: {
      automatic: string
      resend: string
      twilio: string
    }
    titles: {
      create: string
      edit: string
    }
    placeholders: {
      template: string
    }
    descriptions: {
      automaticProvider: string
    }
  }
  settings: {
    heading: string
    description: string
    sections: {
      quietHours: string
      quietHoursDesc: string
      blackouts: string
      blackoutsDesc: string
      rateLimits: string
      rateLimitsDesc: string
    }
    fields: {
      quietHoursStart: string
      quietHoursEnd: string
      quietHoursTz: string
      blackoutDates: string
      skipWeekends: string
      skipWeekendsDesc: string
      recipientRateLimitPerDay: string
      suppressionWindowHours: string
    }
    placeholders: {
      tz: string
      noBlackouts: string
    }
    helpers: {
      blackoutDates: string
      recipientRateLimitPerDay: string
      suppressionWindowHours: string
    }
    actions: {
      addBlackoutDate: string
      removeBlackoutDate: string
    }
  }
  pickers: {
    templates: {
      placeholder: string
      empty: string
    }
    timezones: {
      placeholder: string
      empty: string
    }
  }
  preview: {
    dateLabel: string
    empty: string
    columns: {
      rule: string
      stage: string
      target: string
      anchor: string
      scheduledAt: string
      reasoning: string
    }
  }
  admin: {
    common: {
      channelFilterPlaceholder: string
      statusFilterPlaceholder: string
      allChannels: string
      allStatuses: string
      channelEmail: string
      channelSms: string
      statusDraft: string
      statusActive: string
      statusArchived: string
      statusPending: string
      statusSent: string
      statusFailed: string
      statusCancelled: string
      statusQueued: string
      statusProcessing: string
      statusSkipped: string
      saveChanges: string
      directTemplate: string
      defaultSender: string
      previewDataNotObject: string
      table: {
        to: string
        template: string
        channel: string
        provider: string
        status: string
        created: string
        logs: string
        rule: string
        target: string
        actions: string
        recipient: string
        processed: string
        view: string
        updated: string
      }
      templateSlugLabel: string
      templateIdLabel: string
      deliveryQueuedStatus: string
      templateResolutionHint: string
      previewInvalidJson: string
      previewFailed: string
    }
    templatesPage: {
      title: string
      description: string
      newTemplate: string
      searchPlaceholder: string
      empty: string
    }
    templateDialog: {
      editTitle: string
      createTitle: string
      nameLabel: string
      namePlaceholder: string
      slugLabel: string
      slugPlaceholder: string
      channelLabel: string
      statusLabel: string
      attachmentsLabel: string
      attachmentContract: string
      attachmentInvoice: string
      attachmentBrochure: string
      fromAddressLabel: string
      fromAddressPlaceholder: string
      subjectLabel: string
      subjectPlaceholder: string
      htmlBodyLabel: string
      htmlBodyPlaceholder: string
      smsBodyLabel: string
      smsBodyPlaceholder: string
      tabAuthoring: string
      tabPreview: string
      previewDataLabel: string
      previewDataPlaceholder: string
      previewDataHint: string
      refreshPreview: string
      renderedPreviewTitle: string
      renderedSubjectLabel: string
      renderedHtmlLabel: string
      renderedSmsLabel: string
      noSubjectRendered: string
      noHtmlRendered: string
      noSmsRendered: string
      markActiveLabel: string
      createTemplate: string
    }
    templateDetail: {
      backToTemplates: string
      notFound: string
      editTemplate: string
      metaChannel: string
      metaFrom: string
      metaUpdated: string
      tabOverview: string
      tabPreview: string
      recentDeliveries: string
      messageStructureTitle: string
      subjectLabel: string
      textFallbackLabel: string
      descriptionLabel: string
      htmlBodyTitle: string
      noHtmlConfigured: string
      sampleDataTitle: string
      customJsonLabel: string
      renderPreview: string
      renderedOutputTitle: string
      notRenderedYet: string
      noRenderedHtml: string
      noRenderedText: string
      smsBodyLabel: string
      inspect: string
      noDeliveriesForTemplate: string
    }
    deliveriesPage: {
      title: string
      description: string
      empty: string
      resend: string
      detailsButton: string
      resendFailed: string
      dialogTitle: string
      dialogDescription: string
      labels: {
        deliveryId: string
        status: string
        provider: string
        providerMessageId: string
        template: string
        channel: string
        created: string
        failed: string
        sent: string
        scheduled: string
        to: string
        from: string
        subject: string
        target: string
      }
      errorMessageTitle: string
      failureLogTitle: string
      noFailureLog: string
      payloadDataTitle: string
      metadataTitle: string
      textBodyTitle: string
      htmlBodyTitle: string
    }
    deliveryDetail: {
      title: string
      loadFailed: string
      labels: {
        to: string
        template: string
        provider: string
        status: string
        channel: string
        from: string
        targetType: string
        targetId: string
        providerMessageId: string
        created: string
        sent: string
        failed: string
        subject: string
        error: string
        text: string
      }
      metadataTitle: string
      renderedPayloadTitle: string
      htmlBodyTitle: string
      noHtmlStored: string
      payloadDataTitle: string
      close: string
    }
    reminderRulesPage: {
      title: string
      description: string
      empty: string
      newRule: string
      searchPlaceholder: string
      targetFilterPlaceholder: string
      allTargets: string
      manageStages: string
      targets: {
        booking_confirmed: string
        booking_payment_schedule: string
        payment_complete: string
        booking_cancelled_non_payment: string
        invoice: string
      }
    }
    reminderRuleDialog: {
      editTitle: string
      createTitle: string
      nameLabel: string
      namePlaceholder: string
      targetLabel: string
      statusLabel: string
      channelLabel: string
      defaultTemplateLabel: string
      selectTemplatePlaceholder: string
      defaultTemplateHint: string
      stagesHintBefore: string
      stagesHintAction: string
      stagesHintAfter: string
      createRule: string
    }
    reminderRuleDetail: {
      fallbackTitle: string
    }
    reminderRunsPage: {
      title: string
      description: string
      empty: string
    }
    previewPage: {
      title: string
      description: string
    }
    authoringHelp: {
      title: string
      description: string
    }
  }
  staffAlerts: {
    heading: string
    description: string
    myHeading: string
    myDescription: string
    groups: {
      bookings: string
      finance: string
      sales: string
      legal: string
    }
    alerts: Record<string, { title: string; description: string }>
    columns: {
      alert: string
      routing: string
      status: string
    }
    routing: {
      assignee: string
      assigneeDesc: string
      assigneeUnavailable: string
      roles: string
      rolesDesc: string
      extraAddresses: string
      extraAddressesDesc: string
      addAddress: string
      removeAddress: string
      dialogDescription: string
      addressPlaceholder: string
      noRecipients: string
    }
    roles: {
      owner: string
      admin: string
      member: string
    }
    actions: {
      sendTest: string
      configure: string
      done: string
      sending: string
      save: string
      saving: string
    }
    test: {
      sent: string
      failed: string
      notWired: string
      noEmail: string
    }
    state: {
      on: string
      off: string
      inherited: string
      inheritedOn: string
      inheritedOff: string
      overridden: string
      resetToDefault: string
      disabledByAdmin: string
      disabledByAdminDesc: string
    }
    empty: string
    loading: string
  }
}
