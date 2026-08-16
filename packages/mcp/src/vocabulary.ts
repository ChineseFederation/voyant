/**
 * Business vocabulary for tool discovery (voyant#3921).
 *
 * A travel agent asks for a "client"; the surface calls it a Person. Measured
 * against the real operator graph, that gap made the two most basic operations
 * in the product UNREACHABLE: a frontier model asked to add a client searched
 * "client", got one irrelevant hit (`book_product`), and concluded no such tool
 * existed — while `create_person` sat right there. Asked to find that client it
 * gave up after a single call. The capability was present and undiscoverable,
 * which for an agent is the same as absent.
 *
 * These pairs are NOT invented here. They are the alias column of
 * `UBIQUITOUS_LANGUAGE.md`, the repository's canonical domain vocabulary, which
 * already records that a Person is also called a customer, a client and a
 * contact. `vocabulary.test.ts` re-parses that document and fails if the two
 * drift, so the doc stays the single source of truth and this file stays a
 * projection of it rather than a second, quietly diverging glossary.
 *
 * Aliases containing spaces or parentheses are deliberately excluded: they are
 * prose ("technical alias only") rather than words a caller would type.
 */

/** Alias → the canonical domain term(s) it should also match during search. */
export const VOCABULARY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  account: ["organization", "user"],
  action: ["tool"],
  activated: ["product status"],
  activity: ["program session"],
  "add-on": ["extra"],
  addon: ["extra"],
  agency: ["operator"],
  agent: ["mcp server"],
  agreement: ["channel contract"],
  "allocation-to-channel": ["allotment"],
  ap: ["supplier payment"],
  asset: ["product media", "resource"],
  attachment: ["product media"],
  attendee: ["delegate"],
  audience: ["actor type"],
  audit: ["reconciliation"],
  bill: ["invoice"],
  blackout: ["closeout"],
  board: ["pipeline"],
  boilerplate: ["contract template"],
  book: ["commit"],
  bookability: ["sellability"],
  booking: ["trip envelope"],
  booking_transaction_details: ["booking origin"],
  "booking-record": ["booking"],
  bot: ["mcp server"],
  calendar: ["price schedule"],
  "cancel-and-rebook": ["booking amendment"],
  car: ["vehicle"],
  catalogentry: ["catalog item"],
  category: ["product family"],
  chauffeur: ["driver"],
  "check-in": ["redemption"],
  checkout: ["payment session"],
  clause: ["legacy order term"],
  client: ["organization", "person"],
  cluster: ["pickup group"],
  command: ["tool"],
  company: ["organization"],
  confirmation: ["service voucher"],
  connection: ["operator link"],
  consent: ["policy acceptance"],
  contact: ["person"],
  "contact-on-deal": ["participant"],
  contingent: ["allotment"],
  coupon: ["travel credit"],
  customer: ["person"],
  cut: ["commission rule"],
  day: ["product day"],
  deal: ["proposal"],
  deactivate: ["update", "inactive", "status"],
  deactivation: ["update", "inactive", "status"],
  departure: ["slot"],
  discrepancy: ["reconciliation issue"],
  distributor: ["channel"],
  entry: ["admission"],
  estimate: ["proposal version", "quote"],
  event: ["activity", "program", "program session"],
  exception: ["closeout"],
  experience: ["product"],
  extension: ["extra"],
  "fee-rule": ["commission rule"],
  feed: ["inventory source"],
  form: ["contract template"],
  function: ["tool"],
  funnel: ["pipeline"],
  gap: ["trip requirement"],
  group: ["resource pool", "segment"],
  guest: ["traveler"],
  "hold-record": ["allocation"],
  instalments: ["payment schedule"],
  instance: ["slot"],
  intent: ["payment session"],
  issuance: ["fulfillment"],
  job: ["dispatch"],
  leg: ["product day"],
  limit: ["capacity"],
  line: ["booking item"],
  list: ["segment"],
  listing: ["catalog item", "publication"],
  login: ["user"],
  mapping: ["publication"],
  match: ["reconciliation"],
  max: ["capacity"],
  "mega-booking": ["composed fit trip"],
  net: ["cost"],
  network: ["distribution"],
  occurrence: ["slot"],
  offer: ["availabilitycandidate", "trip candidate"],
  operator: ["driver"],
  opportunity: ["proposal"],
  option: ["availabilitycandidate", "hold", "trip candidate"],
  order: ["booking"],
  package: ["product", "program"],
  partner: ["channel"],
  partnership: ["operator link"],
  partnerships: ["distribution"],
  pass: ["admission"],
  passenger: ["traveler"],
  pax: ["traveler"],
  payout: ["supplier payment"],
  "payout-run": ["settlement"],
  "person-resource": ["resource"],
  placeholder: ["trip requirement"],
  plan: ["payment schedule"],
  product: ["catalog item", "trip envelope"],
  project: ["program"],
  proposal: ["legacy offer", "proposal version", "quote"],
  provider: ["inventory source", "supplier"],
  publication: ["channel product mapping"],
  published: ["product status"],
  receipt: ["payment"],
  recurrence: ["availability rule"],
  "refund-doc": ["credit note"],
  region: ["market"],
  registrant: ["delegate"],
  reservation: ["booking"],
  "reservation-line": ["allocation"],
  retail: ["price"],
  reversal: ["credit note"],
  revision: ["policy version", "product version"],
  role: ["actor type", "audience grant"],
  "role-contact": ["named contact"],
  row: ["booking item"],
  run: ["dispatch"],
  scan: ["redemption"],
  schedule: ["availability rule"],
  sell: ["price"],
  seller: ["operator"],
  sequence: ["invoice number series"],
  "sign-event": ["signature"],
  "sign-off": ["policy acceptance"],
  slot: ["availabilitycandidate", "trip requirement"],
  snapshot: ["product version"],
  "soft-hold": ["hold"],
  source: ["supplier"],
  sourcedoffer: ["availabilitycandidate"],
  status: ["stage"],
  step: ["stage"],
  stop: ["pickup point"],
  storefront: ["public api key", "channel"],
  "sub-category": ["product subtype"],
  "sub-product": ["product option"],
  supplier: ["inventory source"],
  tag: ["product subtype"],
  tariff: ["rate plan"],
  team: ["resource pool"],
  tenant: ["operator"],
  terms: ["policy"],
  territory: ["market"],
  theme: ["public api key"],
  ticket: ["admission"],
  "ticket-event": ["fulfillment"],
  tour: ["product"],
  transaction: ["payment"],
  trip: ["product"],
  unit: ["vehicle"],
  variant: ["product option"],
  vendor: ["supplier"],
  vertical: ["product family"],
  visibility: ["publication"],
  visible: ["product status"],
  voucher: ["promotion code", "service voucher", "travel credit"],
  zone: ["pickup group"],
}

/**
 * Expand one lowercased search term into itself plus any canonical terms it is
 * a known alias for.
 *
 * Expansion is ADDITIVE and the caller matches on "any of these appears", so a
 * search for a word we do not know behaves exactly as before. Nothing is ever
 * narrowed by this.
 */
export function expandSearchTerm(term: string): string[] {
  // Singularise before lookup. The alias table records "client"; an agent asks
  // for "clients". Measured against the real graph, that one missing plural sent
  // `search_tools("clients")` to `identity_named_contact` instead of
  // `relationships_query`, and the agent concluded the client did not exist —
  // the same class of false negative the aliases were added to remove, produced
  // by the aliases themselves not firing.
  const singular = singularise(term)
  // The singular is a match target in its own right, not just a lookup key. Tools
  // are named in the singular (`create_departure`), so a caller typing
  // "departures" must reach them even when the alias table sends the CANONICAL
  // term somewhere else entirely — the doc makes Slot canonical and "departure"
  // its alias, so looking up "departures" yielded ["departures", "slot"] and
  // matched neither `create_departure` nor `operations_query`. The agent then
  // reported that no departures were scheduled, from a discovery miss.
  const forms = singular === term ? [term] : [term, singular]
  const canonical = VOCABULARY_ALIASES[term] ?? VOCABULARY_ALIASES[singular]
  if (!canonical) return forms
  // A canonical term can be multi-word ("supplier payment"); match on each word
  // so a haystack containing `list_supplier_payments` is reached.
  return [...forms, ...canonical.flatMap((value) => [value, ...value.split(/\s+/)])]
}

/**
 * Crude English singularisation, deliberately.
 *
 * A stemmer would be the wrong tool: this only has to undo the plural a caller
 * types on a domain noun, and the cost of over-stemming is a wrong match, which
 * is worse than a miss. So it handles the three endings that actually occur in
 * this vocabulary and leaves everything else alone.
 */
function singularise(term: string): string {
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`
  if (term.endsWith("ses") || term.endsWith("xes") || term.endsWith("ches")) {
    return term.slice(0, -2)
  }
  if (term.endsWith("s") && !term.endsWith("ss")) return term.slice(0, -1)
  return term
}
