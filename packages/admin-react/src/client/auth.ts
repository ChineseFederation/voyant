/**
 * Auth strategies for the admin client. The framework accepts core-owned
 * `voy_` API keys, session JWT bearer tokens, and app-specific resolution; the
 * `custom` strategy covers anything bespoke (cookies, signed headers).
 */
export type AdminAuth =
  | {
      type: "apiKey"
      apiKey: string
      /** Header name to carry the key (default `authorization`). */
      header?: string
      /** Scheme prefix (default `Bearer`; pass `""` for a bare value). */
      scheme?: string
    }
  | { type: "bearer"; token: string }
  | { type: "custom"; headers: () => Record<string, string> | Promise<Record<string, string>> }

export async function authHeaders(auth: AdminAuth): Promise<Record<string, string>> {
  switch (auth.type) {
    case "apiKey": {
      const header = (auth.header ?? "authorization").toLowerCase()
      const scheme = auth.scheme ?? "Bearer"
      return { [header]: scheme ? `${scheme} ${auth.apiKey}` : auth.apiKey }
    }
    case "bearer":
      return { authorization: `Bearer ${auth.token}` }
    case "custom":
      return await auth.headers()
  }
}
