import { describe, expect, it } from "vitest"
import { identityVoyantModule } from "../../src/voyant.js"

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
})
