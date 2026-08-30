import handler, { createServerEntry } from "@tanstack/react-start/server-entry"

import { dispatchHonoApiRequest, isHonoApiRequest } from "./hono-api-dispatch"

function executionContext(): ExecutionContext {
  return {
    waitUntil(promise) {
      void promise.catch((error) => console.error("[tuyu-voyant] background task failed", error))
    },
    passThroughOnException() {},
    props: {},
  } as ExecutionContext
}

function administratorLanding(): Response {
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>途遇旅行</title>
<body><p id="status">正在验证途遇管理员身份...</p><script>
(async()=>{const p=new URLSearchParams(location.hash.slice(1));history.replaceState(null,"",location.pathname);
const a=p.get("assertion");if(!a)throw new Error("missing assertion");const r=await fetch("/api/tuyu-admin/consume",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({assertion:a})});
if(!r.ok)throw new Error("administrator assertion rejected");const v=await r.json();location.replace(v.redirectTo||"/")})().catch(()=>{document.getElementById("status").textContent="管理员身份验证失败，请返回途遇商家端重试。"})
</script></body></html>`
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  })
}

export default createServerEntry({
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/tuyu_admin") return administratorLanding()
    if (isHonoApiRequest(url.pathname)) {
      return dispatchHonoApiRequest(
        request,
        process.env as unknown as CloudflareBindings,
        executionContext(),
      )
    }
    return handler.fetch(request)
  },
})
