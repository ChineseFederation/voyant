/**
 * `@voyant-travel/media` deployment manifest — the import-cheap declaration that
 * admits the media-library admin surface into a graph. Routes are lazily loaded
 * (absolute paths under `/v1/admin/media-library/*`) and the `"media"`
 * object-storage provider is injected via the storage runtime port. This module
 * owns the media-library catalogue (assets, folders, membership, usage); the
 * raw byte upload/serve surface stays owned by `@voyant-travel/storage`.
 */

import { defineModule, requirePort } from "@voyant-travel/core/project"
import { storageMediaRuntimePort } from "@voyant-travel/storage/runtime-port"

import { mediaSiteClientAuthRuntimePort } from "./runtime-port.js"

const schemaSource = "@voyant-travel/media/schema"

/** Import-cheap deployment declaration owned by the media package. */
export const mediaVoyantModule = defineModule({
  id: "@voyant-travel/media",
  packageName: "@voyant-travel/media",
  localId: "media",
  runtimePorts: [
    requirePort(storageMediaRuntimePort),
    requirePort(mediaSiteClientAuthRuntimePort, { optional: true }),
  ],
  api: [
    {
      id: "@voyant-travel/media#api.admin",
      surface: "admin",
      mount: "media-library",
      resource: "media-library",
      openapi: { document: "media-library" },
      runtime: {
        entry: "@voyant-travel/media/graph-runtime",
        export: "createMediaVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/media#schema",
      source: schemaSource,
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/media#migrations",
      source: "./migrations",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/media#access.media-library",
        resource: "media-library",
        label: "Media library",
        description: "Read and manage catalogued media assets, folders, and usage.",
        actions: [
          {
            action: "read",
            label: "View media library",
            description: "View catalogued media assets, folders, and usage records.",
          },
          {
            action: "write",
            label: "Manage media library",
            description: "Upload, update, and organise media assets and folders.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Delete media assets",
            description: "Delete catalogued media assets and folders.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  admin: {
    compositionOrder: 120,
    runtime: {
      entry: "@voyant-travel/media-react/admin",
      export: "createSelectedMediaAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/media#admin.copy.navigation",
        namespace: "operator.admin.navigation",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/i18n",
          export: "operatorAdminNavMessages",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/media#admin.route.media-library-index",
        path: "/media",
        requiredScopes: ["media-library:read"],
        runtime: {
          entry: "@voyant-travel/media-react/admin",
          export: "createSelectedMediaAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/media#admin.nav.media-library",
        routeId: "@voyant-travel/media#admin.route.media-library-index",
        label: { namespace: "operator.admin.navigation", key: "nav.mediaLibrary" },
      },
    ],
  },
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "The media library exposes an admin catalogue surface only; byte upload/serve mechanics and any future media Tools are owned by @voyant-travel/storage.",
    },
  },
})

export default mediaVoyantModule
