import type { ProductsUiOperationsMessages } from "./messages-operations.js"

export const productsUiOperationsEn = {
  productDayDialog: {
    titles: {
      create: "Add itinerary day",
      edit: "Edit itinerary day",
    },
    descriptions: {
      create: "Create a structured day in the product itinerary.",
      edit: "Update the title, location, and overview for this day.",
    },
  },
  productDayForm: {
    fields: {
      dayNumber: "Day number",
      location: "Location",
      title: "Title",
      description: "Description",
    },
    placeholders: {
      location: "Dubrovnik",
      title: "Arrival in Dubrovnik",
      description: "Overview and activities for this day",
    },
    validation: {
      dayNumberMin: "Day number must be at least 1.",
      saveFailed: "Failed to save day.",
    },
    actions: {
      addDay: "Add day",
      saveDay: "Save day",
    },
  },
  productDayServiceForm: {
    fields: {
      supplierService: "Supplier service",
      serviceType: "Service type",
      countryCode: "Country code",
      name: "Name",
      description: "Description",
      costCurrency: "Currency",
      costAmount: "Cost",
      quantity: "Quantity",
      sortOrder: "Sort order",
      notes: "Notes",
    },
    placeholders: {
      supplierService: "Select a supplier service",
      countryCode: "RO",
      name: "Hotel stay",
      description: "Operational service details",
      notes: "Internal notes",
    },
    serviceTypes: {
      accommodation: "Accommodation",
      transfer: "Transfer",
      experience: "Experience",
      guide: "Guide",
      meal: "Meal",
      other: "Other",
    },
    validation: {
      nameRequired: "Service name is required.",
      currencyRequired: "Currency must be a 3-letter ISO code.",
      costNonNegative: "Cost must be zero or greater.",
      quantityMin: "Quantity must be at least 1.",
      saveFailed: "Failed to save service.",
    },
    actions: {
      addService: "Add service",
      saveService: "Save service",
    },
  },
  productDayServiceDialog: {
    titles: {
      create: "Add service",
      edit: "Edit service",
    },
    descriptions: {
      create: "Add an operational service to this itinerary day.",
      edit: "Update the operational service for this itinerary day.",
    },
  },
  productItineraryDayRow: {
    dayLabel: "Day {dayNumber}",
    emptyServices: "No services configured for this day.",
    servicesLoadingError: "Failed to load day services.",
    columns: {
      name: "Name",
      type: "Type",
      cost: "Cost",
      quantity: "Quantity",
    },
  },
  productItineraryDialog: {
    titles: {
      create: "New itinerary",
      edit: "Rename itinerary",
    },
    descriptions: {
      create: "Add another itinerary variant for this product.",
      edit: "Update the itinerary name and default state.",
    },
    fields: {
      name: "Name",
      defaultItinerary: "Set as default itinerary",
      notesDefaultLocked: "This is the default. Set another itinerary as default to change it.",
      notesFirstDefault: "The first itinerary is automatically the default.",
    },
    placeholders: {
      name: "e.g. Main itinerary, Family variant",
    },
    validation: {
      nameRequired: "Name is required",
      saveFailed: "Failed to save itinerary.",
    },
    actions: {
      createItinerary: "Create itinerary",
    },
  },
  optionUnitDialog: {
    titles: {
      create: "New sellable unit",
      edit: "Edit sellable unit",
    },
    descriptions: {
      create: "What's being sold — e.g. an adult ticket, a double room, or a coach seat.",
      edit: "Update inventory limits, age rules, and occupancy when this unit represents a room.",
    },
  },
  optionUnitForm: {
    fields: {
      name: "Name",
      code: "Code",
      unitType: "What is this?",
      sortOrder: "Sort order",
      minQuantity: "Minimum per departure",
      maxQuantity: "Available per departure",
      minAge: "Min age",
      maxAge: "Max age",
      occupancyMin: "Guests min",
      occupancyMax: "Guests max",
      description: "Description",
      required: "Required",
      hidden: "Hidden",
    },
    placeholders: {
      name: "Adult ticket",
      code: "adult",
      description: "Optional internal note about this sellable unit",
    },
    validation: {
      nameRequired: "Unit name is required.",
      saveFailed: "Failed to save option unit.",
    },
    actions: {
      createUnit: "Create unit",
    },
  },
  productReadinessPanel: {
    title: "Ready to sell",
    descriptions: {
      ready: "This product can be published.",
      blocked: "Fix these before this product can be published.",
    },
    badges: {
      ready: "Ready",
      blocking: "Must fix",
      warning: "Worth checking",
    },
    empty: "Nothing to fix.",
    loadingError: "Could not check whether this product is ready to sell.",
    issues: {
      noFutureOpenDeparture: {
        title: "No upcoming departure",
        fix: "Add a departure in the future and open it for sale.",
      },
      missingDefaultOption: {
        title: "No default option",
        fix: "Create an option and mark it as the default.",
      },
      defaultOptionNotActive: {
        title: "The default option is not active",
        fix: "Set the default option to active.",
      },
      noOptionUnits: {
        title: "The default option has no units",
        fix: "Add at least one unit, such as an adult ticket.",
      },
      noPrice: {
        title: "No price",
        fix: "Set a price on the product, or add a price for its units.",
      },
      missingItinerary: {
        title: "No itinerary",
        fix: "Create an itinerary and mark it as the default.",
      },
      emptyItinerary: {
        title: "The itinerary has no days",
        fix: "Add the days this product runs.",
      },
      nonConsecutiveItineraryDays: {
        title: "The itinerary days are not in order",
        fix: "Renumber the days so they run 1, 2, 3 with no gaps.",
      },
      unresolvedDuration: {
        title: "No duration",
        fix: "Enter how long this product lasts.",
      },
      missingFamily: {
        title: "No product family",
        fix: "Choose a family: tour, activity, attraction, event, or transport.",
      },
      missingCapacitySource: {
        title: "No number of places",
        fix: "Set how many places this product has, on the product or its departures.",
      },
      missingMeetingPoint: {
        title: "No meeting point",
        fix: "Add a meeting point, or the pickup points travellers can use.",
      },
      missingAllocationTemplate: {
        title: "No rooms or seats set up",
        fix: "Add a room or seat layout, or set resources up per departure.",
      },
      missingDefaultLanguage: {
        title: "No default language",
        fix: "Choose the language this product is written in.",
      },
      missingDescription: {
        title: "No description",
        fix: "Write the description travellers will read.",
      },
      missingContractTemplate: {
        title: "No contract template",
        fix: "Choose a contract template if this product needs its own terms.",
      },
      incompleteCostBasis: {
        title: "Some services have no cost",
        fix: "Enter what each service on the itinerary costs you.",
      },
      noActiveChannel: {
        title: "Not on sale anywhere",
        fix: "Add this product to an active sales channel.",
      },
      unknown: {
        title: "Something needs attention",
        fix: "Open the product and check its setup.",
      },
    },
  },
  productVersionDialog: {
    title: "Create version snapshot",
    description: "Save a snapshot of this product, including its itinerary and options.",
    fields: {
      notes: "Notes",
    },
    placeholders: {
      notes: "What changed in this version?",
    },
    validation: {
      saveFailed: "Failed to create version snapshot.",
    },
    actions: {
      createVersion: "Create version",
    },
  },
  productVersionsSection: {
    titles: {
      default: "Versions",
    },
    descriptions: {
      default: "Save a snapshot of this product you can look back on.",
    },
    actions: {
      createVersion: "Create version",
    },
    loadingError: "Failed to load product versions.",
    empty: "No version snapshots created yet.",
    versionLabel: "Version",
  },
  productOptionDialog: {
    titles: {
      create: "New booking option",
      edit: "Edit booking option",
    },
    descriptions: {
      create:
        "Create a customer-facing choice, such as Default, Adult ticket, Double, Single, Standard cabin, or VIP transfer.",
      edit: "Update availability, ordering, and which option is shown first to customers.",
    },
  },
  productOptionForm: {
    fields: {
      name: "Name",
      code: "Code",
      description: "Description",
      status: "Status",
      sortOrder: "Sort order",
      availableFrom: "Available from",
      availableTo: "Available to",
      defaultOption: "Show first to customers",
    },
    placeholders: {
      name: "Default",
      code: "default",
      description: "Optional internal note about this booking option",
      availableFrom: "Select start date",
      availableTo: "Select end date",
    },
    validation: {
      nameRequired: "Option name is required.",
      saveFailed: "Failed to save product option.",
    },
    actions: {
      createOption: "Create booking option",
    },
  },
  productOptionsSection: {
    titles: {
      default: "Booking options and prices",
      units: "Inventory for this option",
      personUnits: "Traveler types for this option",
      roomUnits: "Room inventory for this option",
    },
    descriptions: {
      default:
        "Set up what customers choose, what inventory or traveler types are available, and what each traveler pays.",
      units:
        "Define the physical unit, ticket type, room, seat, cabin, or service behind this option.",
      personUnits:
        "Define the traveler age bands customers can book. Departure capacity controls how many people can travel.",
      roomUnits: "Define the physical rooms available for this option.",
    },
    actions: {
      addOption: "Add option",
      addUnit: "Add sellable unit",
      addPersonUnit: "Add traveler type",
      addRoomUnit: "Add room unit",
      duplicate: "Duplicate option",
      edit: "Edit",
      delete: "Delete",
    },
    loadingError: {
      options: "Failed to load product options.",
      units: "Failed to load option units.",
    },
    empty: {
      options: "No customer options configured yet.",
      units: "No sellable unit configured for this option.",
    },
    configurationWarnings: {
      roomOptionsTitle: "This looks like room types configured as options",
      roomOptionsDescription:
        "{options} look like room types. Put Single/Double/Triple under one option as separate rooms. Use separate options only for genuinely different packages.",
    },
    deleteConfirm: {
      option: 'Delete option "{name}" and its setup?',
      unit: 'Delete sellable unit "{name}"?',
    },
    columns: {
      unitType: "Type",
      unitName: "Name",
      quantity: "Inventory",
      personQuantity: "Booking quantity",
      roomQuantity: "Room inventory",
      age: "Traveler age",
      occupancy: "Room occupancy",
      actions: "Actions",
    },
    unitSummaries: {
      range: "{range}",
      rooms: "Rooms per departure",
      roomsWithCount: "Up to {count} rooms per departure",
      vehicles: "Vehicles per departure",
      vehiclesWithCount: "Up to {count} vehicles per departure",
      sleeps: "Sleeps {count}",
      sleepsRange: "Sleeps {range}",
    },
    badges: {
      defaultOption: "Shown first",
    },
  },
} satisfies ProductsUiOperationsMessages
