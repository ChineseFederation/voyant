import type { InsuranceUiMessages } from "./messages.js"

/** ASCII without diacritics, per the existing convention in every package catalogue. */
export const insuranceUiRo: InsuranceUiMessages = {
  bookingCard: {
    heading: "Asigurare de calatorie",
    empty: "Nu s-a cumparat asigurare de calatorie pentru aceasta rezervare.",
    coverWindow: "{from} - {to}",
    premium: "Prima",
    policyNumber: "Numar polita",
    provider: "Asigurator",
    insuredPersons: "Asigurati",
    documents: "Documente",
    noDocuments: "Asiguratorul nu a furnizat inca certificatul.",
    attempts: "{count} incercari de emitere",
  },
  issueState: {
    pending: "In emitere",
    issued: "Emisa",
    issueFailed: "Neemisa",
    cancelled: "Anulata",
  },
  applicationStatus: {
    open: "Deschisa",
    submitted: "Trimisa",
    accepted: "Acceptata",
    declined: "Respinsa",
    expired: "Expirata",
    withdrawn: "Retrasa",
  },
  eligibility: {
    eligible: "Eligibil",
    ineligible: "Neeligibil",
    referral: "Necesita analiza asiguratorului",
  },
  failure: {
    heading: "Asiguratorul nu a emis aceasta polita",
    retryable: "O noua incercare poate reusi.",
    notRetryable: "O noua incercare nu va reusi.",
  },
  cancellation: {
    heading: "Anulata",
    refund: "Rambursat {amount}",
    noRefund: "Asiguratorul nu a returnat nimic.",
  },
  identity: {
    redacted: "Nu aveti permisiunea de a vedea datele persoanei asigurate.",
    absent: "Nu au fost stocate date de identitate.",
    insuredPerson: "Persoana asigurata {initial}",
  },
  actions: {
    retryIssue: "Cere din nou asiguratorului",
    retryingIssue: "Se cere asiguratorului...",
    cancelPolicy: "Anuleaza polita",
    cancellingPolicy: "Se anuleaza...",
    reasonPlaceholder: "Motivul?",
  },
}
