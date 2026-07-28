import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import { storageMediaRuntimePort, storageObjectRuntimePort } from "./runtime-port.js"

/** Import-cheap declaration for storage-owned upload, serve, and video-ticket routes. */
export const storageVoyantModule = defineModule({
  id: "@voyant-travel/storage",
  packageName: "@voyant-travel/storage",
  localId: "storage",
  provides: {
    ports: [providePort(storageObjectRuntimePort), providePort(storageMediaRuntimePort)],
  },
  runtimePorts: [requirePort(storageMediaRuntimePort)],
  api: [
    {
      id: "@voyant-travel/storage#api.admin.uploads",
      surface: "admin",
      mount: "uploads",
      resource: "media",
      openapi: { document: "storage-uploads" },
      runtime: {
        entry: "@voyant-travel/storage/routes",
        export: "createStorageVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/storage#api.admin.video-upload-ticket",
      surface: "admin",
      mount: "uploads/video",
      resource: "media",
      openapi: { document: "storage-video-upload-ticket" },
      runtime: {
        entry: "@voyant-travel/storage/routes",
        export: "createStorageVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/storage#api.admin.media",
      surface: "admin",
      mount: "media",
      resource: "media",
      openapi: { document: "storage-media" },
      runtime: {
        entry: "@voyant-travel/storage/routes",
        export: "createStorageVoyantRuntime",
      },
    },
  ],
  resources: [
    {
      id: "@voyant-travel/storage#resource.object-storage",
      kind: "object-storage",
      required: false,
    },
  ],
  config: [
    { id: "@voyant-travel/storage#config.api-base-url", key: "API_BASE_URL", required: false },
    { id: "@voyant-travel/storage#config.app-url", key: "APP_URL", required: false },
    { id: "@voyant-travel/storage#config.s3-region", key: "S3_REGION", required: true },
    { id: "@voyant-travel/storage#config.s3-endpoint", key: "S3_ENDPOINT", required: false },
    {
      id: "@voyant-travel/storage#config.s3-force-path-style",
      key: "S3_FORCE_PATH_STYLE",
      required: false,
    },
    {
      id: "@voyant-travel/storage#config.s3-backend-identity",
      key: "STORAGE_S3_BACKEND_IDENTITY",
      required: false,
    },
    {
      id: "@voyant-travel/storage#config.documents-bucket",
      key: "STORAGE_DOCUMENTS_BUCKET",
      required: true,
    },
    {
      id: "@voyant-travel/storage#config.media-bucket",
      key: "STORAGE_MEDIA_BUCKET",
      required: true,
    },
    {
      id: "@voyant-travel/storage#config.media-public-base-url",
      key: "MEDIA_PUBLIC_BASE_URL",
      required: false,
    },
    {
      id: "@voyant-travel/storage#config.gateway-endpoint",
      key: "STORAGE_GATEWAY_ENDPOINT",
      required: true,
    },
  ],
  secrets: [
    {
      id: "@voyant-travel/storage#secret.s3-access-key-id",
      key: "S3_ACCESS_KEY_ID",
      required: false,
      rotation: "supported",
    },
    {
      id: "@voyant-travel/storage#secret.s3-secret-access-key",
      key: "S3_SECRET_ACCESS_KEY",
      required: false,
      rotation: "supported",
    },
    {
      id: "@voyant-travel/storage#secret.s3-session-token",
      key: "S3_SESSION_TOKEN",
      required: false,
      rotation: "supported",
    },
    {
      id: "@voyant-travel/storage#secret.gateway-token",
      key: "STORAGE_GATEWAY_TOKEN",
      required: true,
      rotation: "supported",
    },
  ],
  providers: [
    {
      id: "@voyant-travel/storage#provider.memory",
      port: storageObjectRuntimePort.id,
      selection: { role: "storage", value: "memory" },
      uses: {
        config: [
          "@voyant-travel/storage#config.api-base-url",
          "@voyant-travel/storage#config.app-url",
        ],
      },
      runtime: {
        entry: "@voyant-travel/storage/providers/graph",
        export: "createMemoryGraphStorageProvider",
      },
    },
    {
      id: "@voyant-travel/storage#provider.s3-compatible",
      port: storageObjectRuntimePort.id,
      selection: { role: "storage", value: "s3-compatible" },
      uses: {
        config: [
          "@voyant-travel/storage#config.api-base-url",
          "@voyant-travel/storage#config.app-url",
          "@voyant-travel/storage#config.s3-region",
          "@voyant-travel/storage#config.s3-endpoint",
          "@voyant-travel/storage#config.s3-force-path-style",
          "@voyant-travel/storage#config.s3-backend-identity",
          "@voyant-travel/storage#config.documents-bucket",
          "@voyant-travel/storage#config.media-bucket",
          "@voyant-travel/storage#config.media-public-base-url",
        ],
        secrets: [
          "@voyant-travel/storage#secret.s3-access-key-id",
          "@voyant-travel/storage#secret.s3-secret-access-key",
          "@voyant-travel/storage#secret.s3-session-token",
        ],
      },
      runtime: {
        entry: "@voyant-travel/storage/providers/graph",
        export: "createS3CompatibleGraphStorageProvider",
      },
    },
    {
      id: "@voyant-travel/storage#provider.gateway",
      port: storageObjectRuntimePort.id,
      selection: { role: "storage", value: "gateway" },
      uses: {
        config: [
          "@voyant-travel/storage#config.gateway-endpoint",
          "@voyant-travel/storage#config.media-public-base-url",
        ],
        secrets: ["@voyant-travel/storage#secret.gateway-token"],
      },
      runtime: {
        entry: "@voyant-travel/storage/providers/graph",
        export: "createGatewayGraphStorageProvider",
      },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/storage#access.media",
        resource: "media",
        label: "Media",
        description: "View and manage uploaded media objects.",
        actions: [
          {
            action: "read",
            label: "View media",
            description: "View and download uploaded media objects.",
          },
          {
            action: "write",
            label: "Manage media",
            description: "Upload and update media objects.",
          },
        ],
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
        "Storage owns low-level object mechanics; domain modules own attachment and media Tools.",
    },
  },
})

export default storageVoyantModule
