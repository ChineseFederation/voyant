import { useLocale } from "@voyant-travel/admin/providers/locale"

export interface McpConsentMessages {
  title: string
  subtitle: string
  readTitle: string
  readBody: string
  writeTitle: string
  writeBody: string
  boundaryTitle: string
  boundaryBody: string
  approve: string
  deny: string
  approving: string
  failed: string
  unknownClient: string
}

const en: McpConsentMessages = {
  title: "Connect {client}?",
  subtitle: "{client} is asking to work in your Voyant workspace on your behalf.",
  readTitle: "See your data",
  readBody: "It can look up bookings, customers, products, and other records you can already see.",
  writeTitle: "Make changes",
  writeBody: "It can create and update records on your behalf, the same as you would.",
  boundaryTitle: "It can never do more than you can",
  boundaryBody:
    "It gets your permissions, never more, and loses access the moment you disconnect it in Settings → MCP.",
  approve: "Connect",
  deny: "Cancel",
  approving: "Connecting…",
  failed: "Could not complete the connection. Close this window and try again.",
  unknownClient: "This application",
}

const ro: McpConsentMessages = {
  title: "Conectezi {client}?",
  subtitle: "{client} cere sa lucreze in spatiul tau Voyant, in numele tau.",
  readTitle: "Vede datele tale",
  readBody:
    "Poate cauta rezervari, clienti, produse si alte inregistrari pe care le vezi deja si tu.",
  writeTitle: "Face modificari",
  writeBody: "Poate crea si actualiza inregistrari in numele tau, la fel cum ai face si tu.",
  boundaryTitle: "Nu poate face niciodata mai mult decat tine",
  boundaryBody:
    "Primeste permisiunile tale, niciodata mai multe, si pierde accesul in momentul in care il deconectezi din Setari → MCP.",
  approve: "Conecteaza",
  deny: "Anuleaza",
  approving: "Se conecteaza…",
  failed: "Conectarea nu a putut fi finalizata. Inchide fereastra si incearca din nou.",
  unknownClient: "Aceasta aplicatie",
}

export function useMcpConsentMessages(): McpConsentMessages {
  const { resolvedLocale } = useLocale()
  return resolvedLocale?.toLowerCase().startsWith("ro") ? ro : en
}
