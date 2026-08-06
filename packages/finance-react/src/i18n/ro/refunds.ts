import type {
  BookingRefundPanelMessages,
  RecordRefundSettlementDialogMessages,
  RefundSettlementMethodMessages,
} from "../messages/refunds.js"

const methods: RefundSettlementMethodMessages = {
  processor_reversal: "Stornare pe card",
  bank_transfer: "Transfer bancar",
  cash: "Numerar",
  cheque: "Cec",
  travel_credit: "Credit de calatorie",
  voucher: "Voucher",
  counterparty_offset: "Credit in contul lor",
  other: "Altfel",
}

export const bookingRefundPanel: BookingRefundPanelMessages = {
  title: "Restituiri",
  description:
    "O nota de credit spune ca ii datorezi bani clientului. Aici spui ca i-ai platit si cum.",
  empty: "Nu ai restituit nimic pe aceasta rezervare.",
  notRefunded: "Inca neplatita",
  owed: "Inca de platit",
  paidBack: "Deja platit",
  recordAction: "Restituie clientului",
  rowRecordAction: "Restituie",
  rowActions: "Mai multe",
  settleAction: "Marcheaza ca platita",
  failAction: "Marcheaza ca esuata",
  executeAction: "Trimite banii inapoi pe card",
  executeHint:
    "Trimite restituirea pe card. Orice raspunde procesatorul se scrie aici, inclusiv un refuz.",
  reference: "Referinta",
  noReference: "Fara referinta",
  instrumentWorth: "Valoarea instrumentului",
  methods,
  statuses: {
    pending: "Inca neplatita",
    settled: "Platita",
    failed: "Esuata",
  },
  outcomes: {
    settled: "Procesatorul a acceptat restituirea. Clientul a fost platit.",
    pending: "Procesatorul nu a decis inca. Restituirea ramane de platit.",
    failed: "Procesatorul a refuzat restituirea. Suma este din nou disponibila pentru restituire.",
    indeterminate:
      "Nu am putut afla daca restituirea a trecut. Ramane contorizata ca datorata, ca nimeni sa nu restituie acesti bani de doua ori din greseala. Verifica la procesator si marcheaz-o platita sau esuata.",
    not_applicable:
      "Nu s-a trimis nimic — restituirea nu este o stornare pe card sau este deja finalizata.",
  },
}

export const recordRefundSettlementDialog: RecordRefundSettlementDialogMessages = {
  title: "Restituie clientului",
  description:
    "Spune cum ai platit clientul inapoi. Nu trebuie sa fie card: transfer bancar, numerar la ghiseu, un voucher sau un credit in contul lui sunt la fel de normale.",
  paymentLabel: "Ce plata se restituie?",
  paymentPlaceholder: "Alege o plata",
  noPayments: "Aceasta rezervare nu are nicio plata finalizata din care sa se restituie.",
  paymentHint: "Plata din care se intorc banii. Ea limiteaza cat se poate restitui.",
  methodLabel: "Cum a fost platita?",
  methodHint: "Alege stornarea pe card doar cand banii se intorc pe cardul de pe care au venit.",
  amountLabel: "Suma restituita",
  currencyLabel: "Moneda",
  alreadyPaidLabel: "Clientul are deja banii",
  alreadyPaidHint:
    "Lasa nebifat pentru un transfer bancar tocmai trimis. Va aparea ca inca datorata pana o marchezi platita.",
  referenceLabel: "Referinta",
  referenceHint: "Referinta platii bancare, numarul cecului sau ce referinta are metoda.",
  instrumentAmountLabel: "Voucherul valoreaza",
  instrumentAmountHint:
    "Completeaza doar cand voucherul valoreaza mai mult decat restituirea — de exemplu 110% in credit in loc de 100% in numerar.",
  counterpartyLabel: "Contul creditat",
  counterpartyHint: "Organizatia in soldul careia se compenseaza suma.",
  paymentSessionLabel: "Plata de stornat",
  paymentSessionPlaceholder: "Alege o plata cu cardul",
  noPaymentSessions:
    "Aceasta rezervare nu a fost platita niciodata cu cardul, deci nu exista ce sa se storneze. Alege alta metoda — un transfer bancar sau numerar merge la fel de bine.",
  paymentSessionHint: "Plata cu cardul catre care se intorc banii.",
  notesLabel: "Note",
  refundableLabel: "Inca restituibil",
  refundableHint: "Ce ramane dupa restituirile deja platite sau aflate pe drum.",
  pendingHeldNote:
    "O restituire care nu a ajuns inca se scade tot de aici, ca nimeni sa nu trimita aceiasi bani de doua ori.",
  submit: "Restituie clientului",
  cancel: "Renunta",
  approvalRequiredTitle: "Restituirea are nevoie de aprobare",
  approvalRequiredDescription:
    "Nu s-a platit nimic inca. Dupa ce cineva o aproba, revino aici si inregistreaz-o din nou — datele sunt pastrate.",
  approvalIdLabel: "Aprobare",
  approvalRetry: "Inregistreaza cu aprobare",
  methods,
  errors: {
    amountRequired: "Introdu cat s-a restituit.",
    amountExceedsRefundable: "Este mai mult decat a ramas de restituit pe aceasta plata.",
    paymentSessionRequired: "Alege plata cu cardul care se storneaza.",
    generic: "Restituirea nu a putut fi inregistrata.",
  },
}
