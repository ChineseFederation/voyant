export type CatalogUiMessages = {
  catalogPage: {
    title: string
    description: string
    searchPlaceholder: string
    tabs: {
      products: string
      cruises: string
      charters: string
      accommodations: string
    }
    /**
     * Compatibility copy for a retired standalone vertical reached through an
     * old deep link. `{vertical}` / `{owner}` are interpolated.
     */
    retiredVertical: {
      title: string
      description: string
      guidance: string
      action: string
    }
    actions: {
      bookThis: string
      openEditor: string
    }
    columns: Record<
      | "name"
      | "status"
      | "active"
      | "source"
      | "supplier"
      | "bookingMode"
      | "pax"
      | "price"
      | "type"
      | "duration"
      | "days"
      | "nights"
      | "availableDepartures"
      | "yacht"
      | "from"
      | "class"
      | "maxPax"
      | "bedrooms",
      string
    >
    filters: Record<
      | "status"
      | "source"
      | "supplier"
      | "bookingMode"
      | "departureMonth"
      | "destination"
      | "country"
      | "board"
      | "stars"
      | "transport"
      | "type"
      | "family"
      | "subtype"
      | "duration"
      | "capacity"
      | "visibility"
      | "facility"
      | "price"
      | "pax"
      | "any"
      | "active"
      | "ship"
      | "embark"
      | "disembark"
      | "region"
      | "theme"
      | "nights"
      | "yacht"
      | "apaPercent"
      | "inventory"
      | "class"
      | "smoking"
      | "property"
      | "maxPax"
      | "bedrooms"
      | "bathrooms",
      string
    >
    fallbacks: {
      productName: string
      cruiseName: string
      charterName: string
      roomName: string
      detailName: string
    }
    sourceKinds: Record<
      | "owned"
      | "voyantConnect"
      | "manual"
      | "gdsAmadeus"
      | "gdsSabre"
      | "gdsTravelport"
      | "bedbankHotelbeds"
      | "bedbankExpedia"
      | "directSuffix",
      string
    >
    search: {
      noTabsConfigured: string
      clearAll: string
      noResults: string
      resolvedScope: string
      yourFilters: string
      resultSingular: string
      resultPlural: string
      showing: string
      previous: string
      next: string
      page: string
    }
    filtersUi: {
      min: string
      max: string
      to: string
      clear: string
      apply: string
      noResults: string
      clearFilter: string
    }
    view: {
      grid: string
      list: string
      filters: string
      sort: string
      sortRelevance: string
      sortPriceAsc: string
      sortPriceDesc: string
      sortSoonest: string
      sortNewest: string
      showAll: string
      showLess: string
    }
    card: {
      from: string
      viewDetails: string
      nextDeparture: string
      departures: string
      oneDeparture: string
      sessions: string
      oneSession: string
      dates: string
      oneDate: string
      timeThere: string
      timeYours: string
      minutes: string
      days: string
      daysNights: string
      nights: string
      flightIncluded: string
    }
    /** Meal/board basis labels keyed by code (RO/BB/HB/FB/AI). */
    boards: Record<"RO" | "BB" | "HB" | "FB" | "AI", string>
    detail: {
      loadingFullContent: string
      matchPrefix: string
      stale: string
      system: string
      highlights: string
      supplier: string
      itinerary: string
      ship: string
      tagsThemes: string
      attributes: string
      departures: string
      sailings: string
      ends: string
      book: string
      options: string
      cabins: string
      policies: string
      brochure: string
      media: string
      day: string
      unlimited: string
      leftWithCapacity: string
      left: string
      capacity: string
      wheelchairAccessible: string
      floorPlan: string
      deckPlan: string
      openDeckPlan: string
      shipSpecs: {
        type: string
        capacity: string
        capacityGuests: string
        decks: string
        yearBuilt: string
      }
      tabs: {
        overview: string
      }
      attributeLabels: {
        sellAmount: string
        supplierId: string
      }
      tagsInputPlaceholder: string
      addTag: string
      arrayLabels: {
        categories: string
      }
      priceFromLabel: string
      noUpcomingDepartures: string
      noUpcomingSailings: string
      departuresTable: {
        date: string
        status: string
        availability: string
        priceFrom: string
        soldOut: string
        closed: string
        cancelled: string
        open: string
        viewDetails: string
        optionsHeading: string
        noOptions: string
        anyMonth: string
        anyStatus: string
        minAvailability: string
        clearFilters: string
        noResults: string
        noResultsSailings: string
        remainingLabel: string
      }
    }
    values: {
      active: string
      inactive: string
      empty: string
      yes: string
      no: string
      open: string
    }
  }
  catalogBookingPage: {
    title: string
    descriptionPrefix: string
    actions: {
      backToCatalog: string
      refreshPrice: string
      addTraveler: string
      removeTraveler: string
      cancel: string
      booking: string
      confirmBooking: string
    }
    summary: {
      untitled: string
      departure: string
      available: string
      livePrice: string
      quoteExpires: string
      quoteFailed: string
    }
    values: {
      loading: string
      empty: string
      yes: string
      no: string
    }
    contact: {
      title: string
      description: string
      firstName: string
      lastName: string
      email: string
      phone: string
      firstNamePlaceholder: string
      lastNamePlaceholder: string
      emailPlaceholder: string
      phonePlaceholder: string
    }
    travelers: {
      title: string
      description: string
      firstNameLabel: string
      lastNameLabel: string
      emailLabel: string
      firstNamePlaceholder: string
      lastNamePlaceholder: string
      emailPlaceholder: string
    }
    notes: {
      title: string
      description: string
      placeholder: string
    }
    payment: {
      title: string
      description: string
      intent: string
      hold: string
      cardComingSoon: string
    }
    review: {
      total: string
    }
    validation: {
      waitingForPrice: string
      notBookable: string
      contactNameRequired: string
      contactEmailRequired: string
      travelerNameRequired: string
    }
  }
  /**
   * The Booking.com-style catalog surfaces — search-first (dynamic) + detail
   * pages + the shared availability calendar. This is the single source of
   * truth for these strings; templates may override per-locale via the
   * provider's `overrides`, and these package defaults fill any gaps.
   */
  catalogBrowser: {
    /** Individual product (package) / cruise detail page. */
    detail: {
      datesAndPrices: string
      datesError: string
      availabilityUnavailable: string
      /** `{nights}` placeholder. */
      noDepartures: string
      selectDate: string
      roomType: string
      roomTypes: string
      roomsTitle: string
      notFound: string
      loadError: string
      about: string
      cabins: string
      itinerary: string
      ship: string
      day: string
      atSea: string
      capacity: string
      decks: string
      soldOut: string
      highlights: string
      location: string
      guestReviews: string
      reviewsWord: string
      book: string
      freeCancellation: string
      photos: string
      from: string
      /** `{nights}` placeholder. */
      nightsFlightIncluded: string
      max: string
      room: string
      perPerson: string
      mealPlan: string
      close: string
      prevPhoto: string
      nextPhoto: string
      /** Meal/board basis labels keyed by code (AI/HB/BB/RO/FB). */
      boards: {
        RO: string
        BB: string
        HB: string
        FB: string
        AI: string
        standard: string
      }
    }
    /** Dynamic (search-first) catalog surface — the unified search bar + results. */
    search: {
      searchLabel: string
      searchPlaceholder: string
      destination: string
      chooseCountry: string
      when: string
      anyTime: string
      flyingFrom: string
      finding: string
      loading: string
      allAirports: string
      departureAirport: string
      duration: string
      nights: string
      adults: string
      searchAvailability: string
      searching: string
      clear: string
      error: string
      availabilityUnavailable: string
      /** `{nights}` + `{destination}` placeholders. */
      noDepartures: string
      thisDestination: string
      departureDate: string
      departureDates: string
      in: string
      holiday: string
      holidays: string
      departing: string
      selectDay: string
      flightIncluded: string
      viewDates: string
      perPerson: string
      cruiseType: string
      allTypes: string
      typeRiver: string
      typeOcean: string
      cruisePlaceholder: string
      sailing: string
      sailings: string
      viewCruise: string
      noSailings: string
    }
    /** Availability month calendar (shared by search + detail). */
    calendar: {
      prevMonth: string
      nextMonth: string
      offer: string
      offers: string
    }
  }
}
