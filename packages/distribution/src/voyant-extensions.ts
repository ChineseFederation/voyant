import { requirePort } from "@voyant-travel/core/project"

import { channelPushRuntimePort } from "./channel-push/runtime-port.js"

export const distributionBookingVoyantExtensionDefinition = {
  packageName: "@voyant-travel/distribution",
  localId: "distribution",
  api: [
    {
      id: "@voyant-travel/distribution#extension.api",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "distribution-booking" },
      runtime: {
        entry: "@voyant-travel/distribution",
        export: "distributionBookingExtension",
      },
    },
  ],
  meta: { ownership: "package" },
} as const

export const distributionChannelPushVoyantExtensionDefinition = {
  packageName: "@voyant-travel/distribution",
  localId: "distribution.channel-push-extension",
  runtimePorts: [requirePort(channelPushRuntimePort)],
  api: [
    {
      id: "@voyant-travel/distribution#channel-push-extension.api",
      surface: "admin",
      mount: "distribution",
      openapi: { document: "distribution-channel-push" },
      runtime: {
        entry: "@voyant-travel/distribution",
        export: "createChannelPushVoyantRuntime",
      },
    },
  ],
  admin: {
    runtime: {
      entry: "@voyant-travel/distribution-react/admin",
      export: "createSelectedDistributionChannelPushAdminExtension",
    },
    routes: [
      {
        id: "@voyant-travel/distribution#channel-push-extension.admin.route.channel-sync",
        path: "/channel-sync",
        requiredScopes: ["distribution:read"],
        runtime: {
          entry: "@voyant-travel/distribution-react/admin",
          export: "createDistributionChannelPushAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/distribution#channel-push-extension.admin.nav.channel-sync",
        routeId: "@voyant-travel/distribution#channel-push-extension.admin.route.channel-sync",
        label: { namespace: "operator.admin.navigation", key: "nav.channelSync" },
      },
    ],
  },
  subscribers: [
    {
      id: "@voyant-travel/distribution#subscriber.channel-push-booking-confirmed",
      eventType: "booking.confirmed",
      source: "@voyant-travel/distribution",
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-subscribers",
        export: "channelPushBookingConfirmedSubscriber",
      },
    },
    {
      id: "@voyant-travel/distribution#subscriber.channel-push-availability-changed",
      eventType: "availability.slot.changed",
      source: "@voyant-travel/distribution",
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-subscribers",
        export: "channelPushAvailabilityChangedSubscriber",
      },
    },
    {
      id: "@voyant-travel/distribution#subscriber.channel-push-content-changed",
      eventType: "product.content.changed",
      source: "@voyant-travel/distribution",
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-subscribers",
        export: "channelPushContentChangedSubscriber",
      },
    },
  ],
  jobs: [
    {
      id: "channel.booking.push",
      schedule: { every: "2m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          economical: { every: "5m", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-jobs",
        export: "runChannelBookingPushJob",
      },
    },
    {
      id: "channel.availability.push",
      schedule: { every: "1m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          economical: { every: "5m", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-jobs",
        export: "runChannelAvailabilityPushJob",
      },
    },
    {
      id: "channel.content.push",
      schedule: { every: "5m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          economical: { every: "5m", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-jobs",
        export: "runChannelContentPushJob",
      },
    },
    {
      id: "distribution.channel-push-reconcile-booking-links",
      schedule: { cron: "*/15 * * * *", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          economical: { cron: "0 * * * *", overlap: "skip" },
          "scale-to-zero": { cron: "0 */6 * * *", overlap: "skip" },
        },
      },
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-jobs",
        export: "runChannelBookingLinkReconcilerJob",
      },
    },
    {
      id: "distribution.channel-push-reconcile-availability",
      schedule: { cron: "0 * * * *", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          economical: { cron: "0 */6 * * *", overlap: "skip" },
          "scale-to-zero": { cron: "0 */6 * * *", overlap: "skip" },
        },
      },
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-jobs",
        export: "runChannelAvailabilityReconcilerJob",
      },
    },
    {
      id: "distribution.channel-push-reconcile-content",
      schedule: { cron: "0 3 * * *", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          economical: { cron: "0 3 * * *", overlap: "skip" },
          "scale-to-zero": { cron: "0 3 * * *", overlap: "skip" },
        },
      },
      runtime: {
        entry: "@voyant-travel/distribution/channel-push-jobs",
        export: "runChannelContentReconcilerJob",
      },
    },
  ],
  meta: { ownership: "package" },
} as const
