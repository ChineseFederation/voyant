import { pathToFileURL } from "node:url"
import type { LoadVoyantProjectOptions } from "@voyant-travel/runtime"
import { createVoyantProjectServerEntry } from "@voyant-travel/runtime"
import { createGeneratedProjectRuntime } from "../.voyant/app/project-runtime.js"

const withRuntime = (options: LoadVoyantProjectOptions = {}) => ({
  ...options,
  generatedProjectRuntime: createGeneratedProjectRuntime(),
})
const server = createVoyantProjectServerEntry(withRuntime())
const start = ({ port, ...projectOptions }: LoadVoyantProjectOptions & { port?: number } = {}) =>
  createVoyantProjectServerEntry(withRuntime(projectOptions)).start({ port })
export default { fetch: server.fetch, start }
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  await server.start({ port: Number.parseInt(process.env.PORT ?? "8080", 10) })
