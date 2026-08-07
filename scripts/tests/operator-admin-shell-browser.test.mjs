import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import path from "node:path"
import { after, before, test } from "node:test"
import { chromium } from "playwright"

const SHELL = path.resolve("apps/operator/dist/admin-shell/client")
let browser
let origin
let server

before(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://admin-shell.invalid")
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/auth/bootstrap-status") {
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify({ hasUsers: true, authMode: "local" }))
        return
      }
      response.setHeader("content-type", "application/json")
      response.end("null")
      return
    }

    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1)
    const candidate = path.resolve(SHELL, relative)
    const file = candidate.startsWith(`${SHELL}${path.sep}`)
      ? candidate
      : path.join(SHELL, "index.html")
    const fallback = path.join(SHELL, "index.html")
    const bytes = await readFile(file).catch(() => readFile(fallback))
    response.setHeader("content-type", contentType(file))
    response.end(bytes)
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
})

after(async () => {
  await browser?.close()
  await new Promise((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve())),
  )
})

test("packaged document boots pending UI and redirects a deep link to login", async () => {
  const page = await browser.newPage()
  const consoleErrors = []
  const failedRequests = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("requestfailed", (request) => failedRequests.push(request.url()))

  const pendingVisible = page.getByRole("status").waitFor({ timeout: 5_000 })
  const navigation = await page.goto(`${origin}/bookings?tab=upcoming`)
  assert.match(await navigation.text(), /data-voyant-portable-shell="1"/)
  await pendingVisible.catch(async (error) => {
    throw new Error(
      `${error.message}\nurl=${page.url()}\nconsole=${JSON.stringify(consoleErrors)}\nfailed=${JSON.stringify(failedRequests)}\nhtml=${(await page.content()).slice(0, 2_000)}`,
    )
  })
  await page.waitForURL(/\/sign-in/)
  await page.waitForTimeout(100)

  assert.deepEqual(consoleErrors, [])
  assert.deepEqual(failedRequests, [])
  await page.close()
})

function contentType(file) {
  if (file.endsWith(".css")) return "text/css"
  if (file.endsWith(".js")) return "text/javascript"
  if (file.endsWith(".png")) return "image/png"
  if (file.endsWith(".woff2")) return "font/woff2"
  return "text/html"
}
