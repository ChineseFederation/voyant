export type FlightsUiMessages = {
  common: {
    noValue: string
    total: string
    included: string
    free: string
    selected: string
    recommended: string
    passengerSingular: string
    passengerPlural: string
    pax: string
    adultPerPassenger: string
    passengerTypeLabels: Record<"adult" | "child" | "infant" | "senior" | "youth", string>
    cabinLabels: Record<"economy" | "premium_economy" | "business" | "first", string>
    genderLabels: Record<"M" | "F" | "X", string>
    documentTypeLabels: Record<"passport" | "national_id" | "visa", string>
    orderStatusLabels: Record<"pending" | "confirmed" | "ticketed" | "cancelled" | "failed", string>
    legLabels: {
      itinerary: string
      outbound: string
      return: string
      leg: string
    }
    stops: {
      nonstop: string
      oneStop: string
      manyStops: string
      via: string
      upToOne: string
      upToMany: string
    }
  }
  flightsPage: {
    title: string
    description: string
    searchFailed: string
    selectedOutbound: string
    selectedReturn: string
    change: string
    tripTotal: string
    tripTotalDescription: string
    continueToBooking: string
    pickedOfferMissing: string
    outboundOfferMissing: string
    pickOutboundAgain: string
    availableFlights: string
    outboundHeading: string
    returnHeading: string
    tripHeading: string
    searching: string
    zeroOffers: string
    offersSummary: string
    pageSummary: string
    previous: string
    next: string
    flightOffer: string
    bookThisFlight: string
    selectOutbound: string
    selectReturn: string
    noFilteredResults: string
    noRouteResults: string
  }
  flightBookingPage: {
    title: string
    descriptionTrip: string
    descriptionOffer: string
    offerNotInSessionTitle: string
    offerNotInSessionDescription: string
    backToFlightSearch: string
    backToResults: string
    offerUnavailable: string
    segmentNotFound: string
    paymentBrandLabels: Record<"visa" | "mastercard" | "amex" | "revolut" | "bank_transfer", string>
  }
  passengerContactPicker: {
    trigger: string
    searchPlaceholder: string
    searching: string
    empty: string
    addNewContact: string
    emptyName: string
  }
  billingPickers: {
    personTrigger: string
    personSearchPlaceholder: string
    peopleSearching: string
    peopleEmpty: string
    orgTrigger: string
    orgSearchPlaceholder: string
    orgsSearching: string
    orgsEmpty: string
    emptyName: string
  }
  airportCombobox: {
    placeholder: string
    searchPlaceholder: string
    searching: string
    empty: string
    recentHeading: string
    servedHeading: string
    allHeading: string
  }
  flightBaggageStep: {
    unavailable: string
    title: string
    description: string
    sameForBothDirections: string
    bags: string
    noCheckedBag: string
  }
  flightBillingStep: {
    title: string
    description: string
    tabs: {
      personal: string
      company: string
    }
    fields: {
      firstName: string
      lastName: string
      companyName: string
      vatNumber: string
      email: string
      phone: string
      workPhone: string
      streetAddress: string
      addressLine2: string
      city: string
      postalCode: string
      country: string
    }
    placeholders: {
      vatNumber: string
      streetAddress: string
      addressLine2: string
      searchPassengers: string
    }
    saveDefault: string
    pickFromPassengers: string
    noMatchingPassengers: string
    validation: {
      emailRequired: string
      emailInvalid: string
      streetAddressRequired: string
      cityRequired: string
      countryRequired: string
      firstNameRequired: string
      lastNameRequired: string
      companyNameRequired: string
      vatNumberRequired: string
    }
  }
  flightBookingJourney: {
    steps: Record<"review" | "passengers" | "contact" | "confirm", string>
    reviewTitle: string
    backToResults: string
    back: string
    booking: string
    confirmBooking: string
    continue: string
    rows: {
      total: string
      passengers: string
      contact: string
      payment: string
      offerExpires: string
    }
    confirmDescription: string
  }
  flightBookingLedger: {
    flight: string
    outbound: string
    return: string
    passengers: string
    working: string
    billing: string
    payment: string
  }
  flightBookingShell: {
    steps: Record<
      | "review"
      | "fares"
      | "passengers"
      | "bags"
      | "seats"
      | "services"
      | "billing"
      | "payment"
      | "confirm",
      string
    >
    seatMapsUnavailable: string
    backToResults: string
    back: string
    booking: string
    confirmBooking: string
    continue: string
    reviewTrip: string
    reviewFlight: string
    confirmTitle: string
    rows: {
      passengers: string
      documents: string
      contact: string
      billedTo: string
      payment: string
    }
    documentsAllAdded: string
    documentsSomeAdded: string
    documentsAddAtCheckIn: string
    confirmDescription: string
    lineItems: {
      fare: string
      seatsPicked: string
      specialAssistance: string
    }
    segmentNotFound: string
  }
  flightContactForm: {
    title: string
    description: string
    email: string
    phone: string
    emailPlaceholder: string
    phonePlaceholder: string
    validation: {
      emailRequired: string
      emailInvalid: string
    }
  }
  flightFareUpsellStep: {
    unavailable: string
    title: string
    description: string
    sameForAllPassengers: string
    resetToBasic: string
    appliesToAllPassengers: string
    cabinBag: string
    noCabinBag: string
    checkedBag: string
    noCheckedBag: string
    freeSeatSelection: string
    standardSeatSelection: string
    noSeatSelection: string
    priorityBoarding: string
    loungeAccess: string
    freeChanges: string
    changesForFee: string
    refundable: string
    nonRefundable: string
  }
  flightSearchForm: {
    roundTrip: string
    oneWay: string
    fromPlaceholder: string
    toPlaceholder: string
    departPlaceholder: string
    returnPlaceholder: string
    swapAriaLabel: string
    search: string
    searching: string
  }
  flightFiltersBar: {
    clearAll: string
    airlines: string
    filterAirlinesPlaceholder: string
    noAirlines: string
    clearFilter: string
    stops: string
    price: string
    maximumPrice: string
    noCap: string
    clear: string
  }
  flightItinerary: {
    totalDuration: string
    layover: string
    layoverIn: string
    operatedBy: string
    terminal: string
    aircraft: string
  }
  flightOfferDetail: {
    fareBreakdown: string
    validatingCarrier: string
    expires: string
    lastTicketing: string
    instantTicketing: string
    base: string
    tax: string
  }
  flightOfferRow: {
    select: string
    viewDetails: string
    codeshare: string
    interline: string
    plusCarriers: string
  }
  flightOrderConfirmation: {
    bookingConfirmed: string
    ticketDeadline: string
    passengers: string
    contact: string
    itinerary: string
    dob: string
    cancelBooking: string
    cancelling: string
    issueTickets: string
    issuingTickets: string
  }
  flightOrdersPage: {
    title: string
    description: string
    searchPlaceholder: string
    statusFilter: string
    allStatuses: string
    columns: {
      reference: string
      route: string
      passengers: string
      status: string
      ticketingDeadline: string
      total: string
    }
    loading: string
    empty: string
    emptyFiltered: string
    loadFailed: string
    retry: string
    previous: string
    next: string
    pageSummary: string
    noDeadline: string
    deadlinePassed: string
    backToOrders: string
    detailTitle: string
  }
  flightPassengerForm: {
    documentsRequiredNotice: string
    fields: {
      firstName: string
      middleName: string
      lastName: string
      dateOfBirth: string
      gender: string
      travelDocument: string
      documentType: string
      documentNumber: string
      countryOfIssue: string
      countryOfNationality: string
      expiryDate: string
    }
    placeholders: {
      asOnPassport: string
      optional: string
      selectDate: string
      select: string
      asPrintedOnDocument: string
    }
    addNow: string
    skipDocuments: string
    validation: {
      firstNameRequired: string
      lastNameRequired: string
      dateOfBirthRequired: string
      documentNumberRequired: string
      documentCountryRequired: string
      documentExpiryRequired: string
    }
  }
  flightPaymentSelector: {
    title: string
    description: string
    intents: Record<
      "hold" | "card" | "saved_method" | "bank_transfer" | "ticket_on_credit",
      {
        title: string
        description: string
      }
    >
  }
  flightPaymentStep: {
    agencyCreditLabel: string
    agencyCreditDescription: string
  }
  flightSeatMap: {
    cabin: string
    pickingSeatFor: string
    window: string
    aisle: string
    noCharge: string
    pickedBy: string
    seatAvailable: string
    seatSelected: string
    seatUnavailable: string
    seatSelectedFor: string
    categories: Record<
      "exit_row" | "extra_legroom" | "preferred" | "premium" | "bulkhead" | "standard",
      string
    >
    legend: {
      available: string
      preferred: string
      exitRow: string
      picked: string
      taken: string
    }
  }
  flightSeatsStep: {
    title: string
    description: string
    modes: Record<
      "skip" | "auto" | "now",
      {
        title: string
        body: string
      }
    >
    seatMapUnavailable: string
  }
  flightServicesStep: {
    title: string
    description: string
    servicesUnavailable: string
    specialAssistance: string
    noAssistanceNeeded: string
    extras: string
    decreaseExtra: string
    increaseExtra: string
  }
  paxCabinPopover: {
    adults: string
    adultsSublabel: string
    children: string
    childrenSublabel: string
    infants: string
    infantsSublabel: string
    cabin: string
    decrease: string
    increase: string
  }
  popularRoutes: {
    title: string
    defaults: Array<{
      originLabel: string
      destinationLabel: string
      tag: string
      hint: string
    }>
  }
}
