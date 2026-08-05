/**
 * Shared reader for the frozen D.2 cutline manifest.
 *
 * The cutline records, per package source, which migration tags were already
 * materialised when the existing deployments cut over. It is frozen.
 *
 * A cutline source may since have been ABSORBED by another package (module
 * consolidation — voyant#4271). Its frozen tags stay recorded under the retired
 * name, because that is the historical truth about what those deployments had
 * materialised, but the SQL now lives in the absorbing package's folder. So the
 * absorbing source's cutline coverage is the union of its own tags and every tag
 * it absorbed.
 *
 * Getting that union wrong is not a cosmetic error. Every consumer of the
 * cutline splits a source's tags into "covered" (already materialised — do not
 * replay) and "post-cutline increment" (apply on top). An absorbed tag that
 * lands in the wrong half is either replayed against objects that exist, or
 * skipped on a database that needs it.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/** Reads the manifest, or an empty one when absent. */
export function loadCutlineManifest(root) {
  const path = join(root, "packages/framework-migrations/cutline.generated.json")
  if (!existsSync(path)) return { cutline: {}, absorbedBy: {} }
  const parsed = JSON.parse(readFileSync(path, "utf8"))
  return { cutline: parsed.cutline ?? {}, absorbedBy: parsed.absorbedBy ?? {} }
}

/** retired source name -> absorbing source name. */
export function absorbedSourcesByOwner(manifest) {
  const byOwner = new Map()
  for (const [retired, owner] of Object.entries(manifest.absorbedBy ?? {})) {
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), retired])
  }
  return byOwner
}

/**
 * Every cutline tag covering `sourceName`, including tags it absorbed from a
 * retired source.
 */
export function cutlineTagsFor(manifest, sourceName) {
  const absorbed = absorbedSourcesByOwner(manifest).get(sourceName) ?? []
  return [sourceName, ...absorbed].flatMap((name) => manifest.cutline[name] ?? [])
}
