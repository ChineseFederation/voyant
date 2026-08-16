import { lazy, Suspense, useEffect, useMemo, useState } from "react"

const ApiReference = lazy(async () => {
  await import("@scalar/api-reference-react/style.css")
  const module = await import("@scalar/api-reference-react")
  return { default: module.ApiReferenceReact }
})

export type OpenApiSpecLoaders = Record<string, () => Promise<{ default: Record<string, unknown> }>>

interface SpecEntry {
  key: string
  surface: "admin" | "public-api"
  module: string
  load: OpenApiSpecLoaders[string]
}

export function withOperatorApiServer(
  spec: Record<string, unknown>,
  apiUrl = "/api",
): Record<string, unknown> {
  return {
    ...spec,
    servers: [{ url: apiUrl.replace(/\/+$/, ""), description: "Operator API" }],
  }
}

function buildEntries(loaders: OpenApiSpecLoaders): SpecEntry[] {
  const entries = new Map<string, SpecEntry>()
  for (const [path, load] of Object.entries(loaders)) {
    const match = /\/openapi\/(admin|public-api)\/([^/]+)\.json$/.exec(path)
    if (!match) continue
    const surface = match[1] as SpecEntry["surface"]
    const module = match[2]
    if (!module) continue
    const key = `${surface}/${module}`
    entries.set(key, {
      key,
      surface,
      module,
      load,
    })
  }
  return [...entries.values()].sort((left, right) => left.key.localeCompare(right.key))
}

export function createApiDocsRouteOptions(loaders: OpenApiSpecLoaders) {
  function ApiDocsPage() {
    const entries = useMemo(() => buildEntries(loaders), [])
    const [selectedKey, setSelectedKey] = useState(
      () => entries.find((entry) => entry.key === "admin/bookings")?.key ?? entries[0]?.key ?? "",
    )
    const [spec, setSpec] = useState<Record<string, unknown> | null>(null)
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    useEffect(() => {
      const entry = entries.find((candidate) => candidate.key === selectedKey)
      if (!entry) return
      let cancelled = false
      void entry.load().then((module) => {
        if (!cancelled) setSpec(withOperatorApiServer(module.default))
      })
      return () => {
        cancelled = true
      }
    }, [entries, selectedKey])

    if (entries.length === 0) return <main className="p-6">No OpenAPI specs are available.</main>
    return (
      <div className="flex h-screen flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-2.5">
          <strong className="text-sm">Voyant API</strong>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Module</span>
            <select
              className="rounded border bg-background px-2 py-1"
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
            >
              {(["admin", "public-api"] as const).map((surface) => (
                <optgroup key={surface} label={surface === "admin" ? "Admin" : "Storefront"}>
                  {entries
                    .filter((entry) => entry.surface === surface)
                    .map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.module}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          {mounted && spec ? (
            <Suspense fallback={<div className="p-6 text-muted-foreground">Loading...</div>}>
              <ApiReference configuration={{ content: spec }} />
            </Suspense>
          ) : (
            <div className="p-6 text-muted-foreground">Loading...</div>
          )}
        </div>
      </div>
    )
  }

  return { component: ApiDocsPage }
}
