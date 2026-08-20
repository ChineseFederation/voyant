import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"

export interface PersonalBuyerPersonProfile {
  firstName: string
  lastName: string
}

/** Consumer-owned seam that atomically creates and links a personal buyer's CRM Person. */
export interface PersonalBuyerPersonRuntime {
  ensurePersonalBuyerPerson(
    tx: AnyDrizzleDb,
    input: {
      userId: string
      createPerson(profile: PersonalBuyerPersonProfile): Promise<{ id: string }>
    },
  ): Promise<{ id: string } | null>
}

export const personalBuyerPersonRuntimePort = definePort<PersonalBuyerPersonRuntime>({
  id: "auth.personal-buyer-person.runtime",
  test(provider) {
    if (typeof provider?.ensurePersonalBuyerPerson !== "function") {
      throw new Error(
        "auth.personal-buyer-person.runtime provider must implement ensurePersonalBuyerPerson().",
      )
    }
  },
})
