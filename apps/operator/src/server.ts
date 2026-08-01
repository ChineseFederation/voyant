import type { LoadVoyantProjectOptions } from "@voyant-travel/runtime"
import { createVoyantProjectServerEntry } from "@voyant-travel/runtime"
import { getGeneratedProjectLinks } from "../.voyant/app/project-links.js"
import { createGeneratedProjectRuntime } from "../.voyant/app/project-runtime.js"

const withGeneratedArtifacts = (options: LoadVoyantProjectOptions = {}) => ({
  ...options,
  generatedProjectLinks: getGeneratedProjectLinks(),
  generatedProjectRuntime: createGeneratedProjectRuntime(),
})
const server = createVoyantProjectServerEntry(withGeneratedArtifacts())
const start = ({ port, ...projectOptions }: LoadVoyantProjectOptions & { port?: number } = {}) =>
  createVoyantProjectServerEntry(withGeneratedArtifacts(projectOptions)).start({ port })
export default { fetch: server.fetch, start }
if (import.meta.filename === process.argv[1]) await server.start()
