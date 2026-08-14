import { defineModule, requirePort } from "@voyant-travel/core/project"
import { storageObjectRuntimePort } from "@voyant-travel/storage/runtime-port"

/** Import-cheap declaration for the anonymous public document delivery surface. */
export const publicDocumentDeliveryVoyantModule = defineModule({
  id: "@voyant-travel/public-document-delivery",
  packageName: "@voyant-travel/public-document-delivery",
  localId: "public-document-delivery",
  requires: {
    ports: [{ id: "database.client" }, { id: "storage.object" }],
  },
  runtimePorts: [requirePort(storageObjectRuntimePort)],
  api: [
    {
      id: "@voyant-travel/public-document-delivery#api.public",
      surface: "public",
      mount: "documents",
      anonymous: true,
      // The delivery token in the path is the capability.
      publishable: true,
      openapi: { document: "public-document-delivery" },
      runtime: {
        entry: "@voyant-travel/public-document-delivery",
        export: "createPublicDocumentDeliveryVoyantRuntime",
      },
    },
  ],
  resources: [
    {
      id: "@voyant-travel/public-document-delivery#resource.database",
      kind: "database",
      required: true,
      config: { engine: "postgres" },
    },
    {
      id: "@voyant-travel/public-document-delivery#resource.documents",
      kind: "object-storage",
      required: true,
      config: { access: "private" },
    },
  ],
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "This module only serves authorized public documents; legal domains own document Tools.",
    },
  },
})

export default publicDocumentDeliveryVoyantModule
