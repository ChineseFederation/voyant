import type { CheckoutUiMessages } from "./messages.js"

export const checkoutUiRo: CheckoutUiMessages = {
  paymentLinkLandingPage: {
    cardTab: "Plateste cu cardul",
    bankTab: "Transfer bancar",
    expires: "Expira {date}",
    noMethods: {
      title: "Nicio metoda de plata disponibila",
      body: "Acest link de plata nu are metode de plata configurate. Contacteaza agentul de turism.",
    },
    card: {
      description: "Vei fi redirectionat catre pagina securizata a procesatorului de carduri.",
      payAmount: "Plateste {amount}",
      startFailed: "Plata cu cardul nu a putut fi pregatita.",
      errorAdvice:
        "{message} Daca problema persista, plateste prin transfer bancar sau contacteaza agentul de turism.",
    },
    bank: {
      instructions:
        "Transfera {amount} in contul de mai jos. Rezervarea este confirmata dupa incasarea platii (de obicei 1-3 zile lucratoare).",
      beneficiary: "Beneficiar",
      iban: "IBAN",
      bicSwift: "BIC / SWIFT",
      bank: "Banca",
      reference: "Referinta",
    },
    copy: {
      copied: "Copiat",
      copyValue: "Copiaza {value}",
    },
    terminal: {
      paid: {
        title: "Plata incasata",
        body: "Multumim - rezervarea este confirmata. Vei primi in curand un email de confirmare.",
      },
      failed: {
        title: "Plata esuata",
        body: "Plata nu a putut fi procesata. Incearca din nou sau contacteaza suportul.",
      },
      expired: {
        title: "Link de plata expirat",
        body: "Acest link de plata a expirat. Cere un link nou de la agentul de turism.",
      },
      cancelled: {
        title: "Plata anulata",
        body: "Aceasta plata a fost anulata. Contacteaza agentul de turism daca nu te asteptai la asta.",
      },
      tryAgain: "Incearca din nou",
    },
    processing: {
      title: "Se proceseaza plata...",
      body: "Confirmam plata cu procesatorul. De obicei dureaza cateva secunde.",
    },
    descriptions: {
      booking: "Plata rezervare",
      booking_session: "Plata sesiune rezervare",
      booking_payment_schedule: "Avans rezervare",
      booking_guarantee: "Garantie rezervare",
      invoice: "Plata factura",
      order: "Plata comanda",
      flight_order: "Plata zbor",
      other: "Plata",
      default: "Plata",
    },
  },
  paymentStep: {
    title: "Plata",
    description: "Alege o metoda salvata sau foloseste alta optiune de plata.",
    savedMethods: {
      title: "Metode de plata salvate",
      countOnFile: "{count} salvate",
      empty: "Nu exista metode salvate pentru acest contact.",
      defaultBadge: "Implicit",
      expires: "Expira {month}/{year}",
      selected: "Selectata",
    },
    otherOptions: {
      title: "Alte optiuni de plata",
      newCard: {
        title: "Card nou de credit / debit",
        body: "Debiteaza acum un card punctual.",
        cardholderName: "Nume detinator card",
        cardNumber: "Numar card",
        expiry: "LL/AA",
        cardNumberPlaceholder: ".... .... .... ....",
        expiryPlaceholder: "08/29",
      },
      hold: {
        title: "Retine - genereaza link de plata",
        body: "Blocheaza comanda si genereaza un link de plata pe care clientul il poate deschide pentru plata cu cardul sau transfer bancar. Distribuie-l cum preferi.",
      },
      cardSecurityNote:
        "Datele cardului sunt procesate in siguranta de furnizorul de plati si nu sunt stocate aici.",
      brandFallback: "card",
    },
  },
  collectPaymentDialog: {
    title: "Genereaza link de plata",
    description: "Trimite clientului pentru a incasa plata.",
    scheduleLabel: "Incaseaza",
    scheduleHelp: "",
    scheduleCustomPlaceholder: "Suma personalizata",
    scheduleClear: "Anuleaza selectia",
    scheduleFullAmount: "Suma totala ({amount})",
    scheduleTypeLabels: {
      deposit: "Avans",
      installment: "Transa",
      balance: "Sold",
      hold: "Retinere",
      other: "Alta",
    },
    amountLabel: "Suma ({currency})",
    amountLabelShort: "Suma",
    currencyLabel: "Moneda",
    amountHelp: "",
    cancel: "Anuleaza",
    done: "Gata",
    generateLink: "Genereaza link",
    validation: {
      amountAboveZero: "Introdu o suma mai mare decat zero.",
      linkReady: "Linkul de plata este gata - copiaza-l sau trimite-l clientului.",
    },
    result: {
      noLink:
        "Sesiunea a fost creata, dar linkul nu a putut fi construit. ID sesiune: {sessionId}.",
      noSession: "-",
      ready: "Link de plata gata",
      body: "Trimite acest link clientului. Va alege cardul sau transferul bancar pe pagina.",
      copyLink: "Copiaza linkul",
      openLink: "Deschide linkul",
    },
  },
}
