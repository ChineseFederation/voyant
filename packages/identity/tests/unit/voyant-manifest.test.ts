import { describe, expect, it } from "vitest"
import { customerVerificationVoyantModule, identityVoyantModule } from "../../src/voyant.js"

describe("identity deployment manifest", () => {
  it("owns the package deployment surfaces", () => {
    expect(identityVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/identity",
      packageName: "@voyant-travel/identity",
      api: [
        {
          id: "@voyant-travel/identity#api.admin",
          surface: "admin",
          resource: "identity",
          openapi: { document: "identity" },
          runtime: { entry: "@voyant-travel/identity", export: "identityApiModule" },
        },
      ],
      schema: [{ id: "@voyant-travel/identity#schema" }],
      migrations: [{ id: "@voyant-travel/identity#migrations" }],
      access: {
        resources: [
          {
            id: "@voyant-travel/identity#access.identity",
            resource: "identity",
            label: "Identity",
            actions: expect.arrayContaining([
              expect.objectContaining({ action: "read" }),
              expect.objectContaining({ action: "write" }),
              expect.objectContaining({ action: "delete", sensitive: true }),
            ]),
          },
        ],
      },
    })
  })

  it("binds generated identity children to their polymorphic parent anchor", () => {
    for (const actionId of ["create-contact-point", "create-address", "create-named-contact"]) {
      expect(identityVoyantModule.actions).toContainEqual(
        expect.objectContaining({
          id: `@voyant-travel/identity#action.${actionId}`,
          targetLifecycle: "created",
          createdTarget: expect.objectContaining({
            durability: "handler-command-claim-v1",
            parentAnchor: { targetTypeField: "entityType", targetIdField: "entityId" },
          }),
          reversible: false,
          allowedActorTypes: ["staff"],
        }),
      )
    }
  })

  it("targets existing identity children by id", () => {
    for (const actionId of ["update-address", "update-contact-point", "update-named-contact"]) {
      expect(
        identityVoyantModule.actions?.find(
          ({ id }) => id === `@voyant-travel/identity#action.${actionId}`,
        ),
      ).toMatchObject({ commandTargetField: "id" })
    }
  })

  it("owns the customer verification domain that moved off the public API layer", () => {
    // voyant#4627. The table, its migrations, the service, the public routes
    // and the runtime port belong to the module that owns customer identity.
    // The "verify MY email" Tools stay in public-api, because resolving "my"
    // needs the customer portal's composed profile.
    expect(customerVerificationVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/identity#verification",
      packageName: "@voyant-travel/identity",
      localId: "identity.verification",
      requires: { capabilities: ["identity.data-owner"] },
      runtimePorts: [{ id: "identity.verification.runtime" }],
      api: [
        {
          id: "@voyant-travel/identity#verification.api",
          surface: "public",
          mount: "customer-verification",
          openapi: { document: "identity-verification" },
          anonymous: true,
        },
      ],
    })
    expect(customerVerificationVoyantModule.tools ?? []).toHaveLength(0)
    expect(customerVerificationVoyantModule.actions ?? []).toHaveLength(0)
  })

  it("adopts the ledger identity the challenges table carried before it moved", () => {
    // A deployment ran these migrations under "storefront" before voyant#4624
    // and under "public-api" after it. Both must be claimed or the runner
    // replays them and the CREATE TABLE fails on an existing table.
    expect(identityVoyantModule).toMatchObject({
      links: [
        {
          id: "@voyant-travel/identity#linkable.customerVerificationChallenge",
          source: "@voyant-travel/identity/verification",
          export: "customerVerificationLinkable",
        },
      ],
    })
  })
})
