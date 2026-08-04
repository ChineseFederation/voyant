import { ADMIN_UI_EXTENSION_API_VERSION } from "@voyant-travel/admin-extension-sdk"
import { VOYANT_EVENT_CATALOG_SCHEMA_VERSION } from "@voyant-travel/graph-contracts"
import { describe, expect, it } from "vitest"
import {
  APP_API_VERSION,
  APP_MANIFEST_SCHEMA_VERSION,
  VOYANT_APP_CONTRACT_VERSIONS,
} from "./index.js"

describe("VOYANT_APP_CONTRACT_VERSIONS", () => {
  it("takes every axis from the constant that owns it", () => {
    // Each of these was a hand-typed literal in at least one compatibility
    // check before this object existed. A bump has to move the check with it.
    expect(VOYANT_APP_CONTRACT_VERSIONS).toEqual({
      appApiVersion: APP_API_VERSION,
      manifestSchemaVersion: APP_MANIFEST_SCHEMA_VERSION,
      eventSchemaVersion: VOYANT_EVENT_CATALOG_SCHEMA_VERSION,
      adminExtensionVersion: ADMIN_UI_EXTENSION_API_VERSION.split(".")[0],
    })
  })

  it("declares the admin extension protocol by major only", () => {
    // The SDK version is a full semver because a manifest declares a range
    // against it. Compatibility is the major: that is what a breaking
    // protocol change moves, and what an admitted release records.
    expect(VOYANT_APP_CONTRACT_VERSIONS.adminExtensionVersion).toMatch(/^\d+$/)
  })

  it("dates the app API rather than versioning it as semver", () => {
    // Publishers consume this surface over HTTP and install no packages, so a
    // package range would describe nothing they have.
    expect(VOYANT_APP_CONTRACT_VERSIONS.appApiVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
