import { describe, expect, it } from "vitest"
import { assembleInstalledExtensions, type InstalledExtensionRow } from "./extension-resolution.js"
import type { HostLabelRow } from "./locale-resolution.js"

function slotRow(overrides: Partial<InstalledExtensionRow> = {}): InstalledExtensionRow {
  return {
    installationId: "apin_1",
    appId: "app_1",
    extensionKey: "slot:reports",
    releaseId: "aprl_1",
    defaultLocale: "en",
    supportedLocales: ["en", "pt"],
    descriptor: {
      key: "reports",
      titleKey: "reports.title",
      version: "1.0.0",
      extensionApi: "^1",
      entryUrl: "https://app.example.com/reports",
      slots: ["dashboard.header"],
    },
    ...overrides,
  }
}

function pageRow(overrides: Partial<InstalledExtensionRow> = {}): InstalledExtensionRow {
  return {
    installationId: "apin_1",
    appId: "app_1",
    extensionKey: "page:settings",
    releaseId: "aprl_1",
    defaultLocale: "en",
    supportedLocales: ["en", "pt"],
    descriptor: {
      key: "settings",
      titleKey: "settings.title",
      path: "/settings",
      entryUrl: "https://app.example.com/settings",
    },
    ...overrides,
  }
}

const localizations = new Map<string, HostLabelRow[]>([
  [
    "aprl_1",
    [
      { locale: "en", surface: "extension", messageKey: "reports.title", text: "Reports" },
      { locale: "pt", surface: "extension", messageKey: "reports.title", text: "Relatórios" },
      { locale: "en", surface: "navigation", messageKey: "settings.title", text: "Settings" },
      { locale: "en", surface: "extension", messageKey: "settings.title", text: "App Settings" },
    ],
  ],
])

describe("assembleInstalledExtensions", () => {
  it("resolves slot descriptors with host labels and locale/direction", () => {
    const result = assembleInstalledExtensions([slotRow()], localizations, { activeLocale: "pt" })
    expect(result.slots).toHaveLength(1)
    const slot = result.slots[0]
    expect(slot?.descriptor.key).toBe("apin_1:reports")
    expect(slot?.descriptor.displayName).toBe("Relatórios")
    expect(slot?.descriptor.slots).toEqual(["dashboard.header"])
    expect(slot?.appLocale).toBe("pt")
    expect(slot?.direction).toBe("ltr")
  })

  it("resolves full-page descriptors with title and nav label", () => {
    const result = assembleInstalledExtensions([pageRow()], localizations, { activeLocale: "en" })
    expect(result.pages).toHaveLength(1)
    const page = result.pages[0]
    expect(page?.key).toBe("apin_1:settings")
    expect(page?.path).toBe("/settings")
    expect(page?.title).toBe("App Settings")
    expect(page?.navLabel).toBe("Settings")
  })

  it("threads a page's icon from the descriptor when present", () => {
    const withIcon = pageRow({
      descriptor: {
        key: "settings",
        titleKey: "settings.title",
        path: "/settings",
        entryUrl: "https://app.example.com/settings",
        icon: "https://app.example.com/settings-icon.svg",
      },
    })
    const result = assembleInstalledExtensions([withIcon], localizations, { activeLocale: "en" })
    expect(result.pages[0]?.icon).toBe("https://app.example.com/settings-icon.svg")
  })

  it("leaves icon undefined when the descriptor omits it", () => {
    const result = assembleInstalledExtensions([pageRow()], localizations, { activeLocale: "en" })
    expect(result.pages[0]?.icon).toBeUndefined()
  })

  it("resolves page ordering, anchoring, and a localized navigation group", () => {
    const grouped = pageRow({
      descriptor: {
        key: "settings",
        titleKey: "settings.title",
        path: "/settings",
        entryUrl: "https://app.example.com/settings",
        order: -10,
        group: "app-tools",
        insertAfter: "bookings",
      },
    })
    const labels = new Map(localizations)
    labels.set("aprl_1", [
      ...(labels.get("aprl_1") ?? []),
      { locale: "en", surface: "navigation", messageKey: "app-tools", text: "App tools" },
    ])
    const result = assembleInstalledExtensions([grouped], labels, { activeLocale: "en" })
    expect(result.pages[0]).toMatchObject({
      order: -10,
      group: "app-tools",
      groupLabel: "App tools",
      insertAfter: "bookings",
    })
  })

  it("uses deterministic page navigation defaults", () => {
    const result = assembleInstalledExtensions([pageRow()], localizations, { activeLocale: "en" })
    expect(result.pages[0]?.order).toBe(0)
    expect(result.pages[0]?.group).toBeUndefined()
    expect(result.pages[0]?.insertAfter).toBeUndefined()
  })

  it("filters out extensionApi-incompatible slot extensions", () => {
    const incompatible = slotRow({
      descriptor: {
        key: "legacy",
        titleKey: "reports.title",
        version: "1.0.0",
        extensionApi: "^0.9",
        entryUrl: "https://app.example.com/legacy",
        slots: ["dashboard.header"],
      },
    })
    const result = assembleInstalledExtensions([incompatible], localizations, {
      activeLocale: "en",
      extensionApiVersion: "1.1.0",
    })
    expect(result.slots).toHaveLength(0)
  })

  it("falls back to the descriptor key when no host label exists", () => {
    const result = assembleInstalledExtensions([slotRow({ releaseId: "aprl_none" })], new Map(), {
      activeLocale: "en",
    })
    expect(result.slots[0]?.descriptor.displayName).toBe("reports")
  })

  it("falls back to the default locale for an unsupported active locale", () => {
    const result = assembleInstalledExtensions([slotRow()], localizations, { activeLocale: "de" })
    expect(result.slots[0]?.appLocale).toBe("en")
    expect(result.slots[0]?.descriptor.displayName).toBe("Reports")
  })

  it("skips malformed descriptors (fail-soft)", () => {
    const malformed = slotRow({ descriptor: { key: "broken" } })
    const result = assembleInstalledExtensions([malformed], localizations, { activeLocale: "en" })
    expect(result.slots).toHaveLength(0)
    expect(result.pages).toHaveLength(0)
  })

  it("gives each installation a unique descriptor key", () => {
    const result = assembleInstalledExtensions(
      [slotRow(), slotRow({ installationId: "apin_2" })],
      localizations,
      { activeLocale: "en" },
    )
    expect(result.slots.map((slot) => slot.descriptor.key)).toEqual([
      "apin_1:reports",
      "apin_2:reports",
    ])
  })
})
