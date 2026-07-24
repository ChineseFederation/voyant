import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createContainer, createEventBus } from "@voyant-travel/core"
import { describe, expect, it, vi } from "vitest"

import {
  createNotificationsApiModule,
  NOTIFICATIONS_ROUTE_RUNTIME_CONTAINER_KEY,
} from "../../src/index.js"

describe("createNotificationsApiModule.bootstrap", () => {
  it("keeps document-related table imports on schema-only package surfaces", () => {
    const srcDir = fileURLToPath(new URL("../../src", import.meta.url))
    const files = collectTypeScriptFiles(srcDir)
    const sources = files.map((file) => [file, readFileSync(file, "utf8")] as const)

    for (const [file, source] of sources) {
      expect(source, file).not.toContain("@voyant-travel/legal/contracts")
      expect(source, file).not.toContain('from "@voyant-travel/finance"')
      expect(source, file).not.toContain("from '@voyant-travel/finance'")
    }
  })

  it("registers the resolved route runtime once", async () => {
    const resolveProviders = vi.fn(() => [
      {
        name: "email-provider",
        channels: ["email"],
        durableDelivery: {
          protocol: "notification-provider-idempotency-v1" as const,
          async send() {
            return { provider: "email-provider" }
          },
        },
      },
    ])
    const documentAttachmentResolver = vi.fn(async () => null)
    const eventBus = createEventBus()
    const module = createNotificationsApiModule({
      resolveProviders,
      documentAttachmentResolver,
      eventBus,
    })
    const container = createContainer()

    await module.module.bootstrap?.({
      bindings: {},
      container,
      eventBus: createEventBus(),
    })

    const runtime = container.resolve<{
      providers: ReadonlyArray<{ name: string }>
      documentAttachmentResolver?: typeof documentAttachmentResolver
      eventBus?: typeof eventBus
    }>(NOTIFICATIONS_ROUTE_RUNTIME_CONTAINER_KEY)

    expect(resolveProviders).toHaveBeenCalledOnce()
    expect(runtime.providers).toHaveLength(1)
    expect(runtime.providers[0]?.name).toBe("email-provider")
    expect(runtime.documentAttachmentResolver).toBe(documentAttachmentResolver)
    expect(runtime.eventBus).toBe(eventBus)
  })
})

function collectTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path)
    }
    return entry.isFile() && path.endsWith(".ts") ? [path] : []
  })
}
