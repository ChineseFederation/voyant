const server = (await import("../dist/server/server.js")).default

if (typeof server?.start !== "function") {
  throw new Error("The built operator server does not expose its start contract.")
}

await server.start({ hostProfile: "api-only" })
