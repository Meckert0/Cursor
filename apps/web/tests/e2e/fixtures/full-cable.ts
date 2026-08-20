/**
 * Canonical full-cable acceptance fixture expectations.
 * Parts must be ingested by the e2e setup (catalog starts empty; no starter seed).
 */
export const FULL_CABLE = {
  modulePartNumber: "MDM-15P",
  moduleLibraryId: "cmp-module-001",
  backshellPartNumber: "BS-EMI-15",
  backshellLibraryId: "cmp-backshell-15",
  strainReliefPartNumber: "SR-CLAMP-15",
  strainReliefLibraryId: "cmp-sr-15",
  wirePartNumber: "M22759/16-22",
  wireLibraryId: "cmp-wire-001",
  wireAwg: "22",
  wireColor: "white",
  wireLengthIn: 12,
  sleevingValue: "expandable_sleeving",
  sleevingLabel: "expandable sleeving",
  sleevingPartNumber: "SLV-EXP-025",
  sleevingLibraryId: "cmp-sleeve-exp",
  contactPartNumber: "CNT-22",
  contactLibraryId: "cmp-contact-001",
  labelPartNumber: "LBL-22",
  labelLibraryId: "cmp-label-001",
  labelText: "W1",
  fromSignal: "PWR+",
  toSignal: "PWR-RTN",
  fromLocation: "J1 - 1",
  toLocation: "J2 - 1"
} as const;

/** Expected resolved BOM lines after authoring the canonical one-wire cable. */
export const FULL_CABLE_BOM_EXPECTATIONS = [
  { category: "module", partNumber: FULL_CABLE.modulePartNumber, quantity: "2" },
  { category: "backshell", partNumber: FULL_CABLE.backshellPartNumber, quantity: "2" },
  { category: "strain-relief", partNumber: FULL_CABLE.strainReliefPartNumber, quantity: "2" },
  { category: "wire", partNumber: FULL_CABLE.wirePartNumber, quantity: String(FULL_CABLE.wireLengthIn) },
  { category: "contact", partNumber: FULL_CABLE.contactPartNumber, quantity: "2" },
  { category: "label", partNumber: FULL_CABLE.labelPartNumber, quantity: "1" },
  { category: "sleeve-tube-braid", partNumber: FULL_CABLE.sleevingPartNumber, quantity: String(FULL_CABLE.wireLengthIn) }
] as const;

/** Catalog parts required by the full-cable e2e journey (ingested unreviewed, then reviewed via owner role). */
export const FULL_CABLE_CATALOG_ITEMS = [
  {
    id: FULL_CABLE.moduleLibraryId,
    category: "module" as const,
    family: "Micro-D",
    partNumber: FULL_CABLE.modulePartNumber,
    description: "15-pin Micro-D connector module",
    isActive: true,
    stockStatus: "in_stock" as const,
    isReviewed: false,
    attributes: {
      pinCount: 15,
      pinIds: Array.from({ length: 15 }, (_, index) => String(index + 1))
    }
  },
  {
    id: FULL_CABLE.contactLibraryId,
    category: "contact" as const,
    family: "Micro-D",
    partNumber: FULL_CABLE.contactPartNumber,
    description: "Size 22 Micro-D socket contact",
    isActive: true,
    stockStatus: "in_stock" as const,
    isReviewed: false,
    attributes: {
      acceptedAwgMin: 20,
      acceptedAwgMax: 26,
      acceptedFamilies: ["MIL-W-22759"]
    }
  },
  {
    id: FULL_CABLE.wireLibraryId,
    category: "wire" as const,
    family: "MIL-W-22759",
    partNumber: FULL_CABLE.wirePartNumber,
    description: "22 AWG PTFE wire, white",
    isActive: true,
    stockStatus: "in_stock" as const,
    isReviewed: false,
    attributes: { awg: FULL_CABLE.wireAwg, color: FULL_CABLE.wireColor }
  },
  {
    id: FULL_CABLE.labelLibraryId,
    category: "label" as const,
    family: "Heatshrink",
    partNumber: FULL_CABLE.labelPartNumber,
    description: "Heatshrink wire marker, 22 AWG",
    isActive: true,
    stockStatus: "in_stock" as const,
    isReviewed: false,
    attributes: {}
  },
  {
    id: FULL_CABLE.sleevingLibraryId,
    category: "sleeve-tube-braid" as const,
    family: "expandable_sleeving",
    partNumber: FULL_CABLE.sleevingPartNumber,
    description: "Expandable PET sleeving, 0.25 in",
    isActive: true,
    stockStatus: "in_stock" as const,
    isReviewed: false,
    attributes: { sizeRanges: [] }
  },
  {
    id: FULL_CABLE.backshellLibraryId,
    category: "backshell" as const,
    family: "EMI",
    partNumber: FULL_CABLE.backshellPartNumber,
    description: "EMI backshell for 15-pin Micro-D",
    isActive: true,
    stockStatus: "in_stock" as const,
    isReviewed: false,
    attributes: {}
  },
  {
    id: FULL_CABLE.strainReliefLibraryId,
    category: "strain-relief" as const,
    family: "Clamp",
    partNumber: FULL_CABLE.strainReliefPartNumber,
    description: "Strain-relief clamp for 15-pin Micro-D",
    isActive: true,
    stockStatus: "in_stock" as const,
    isReviewed: false,
    attributes: {}
  }
];

/** Module accessory compatibility rows required for canvas allowed-only filtering. */
export const FULL_CABLE_MODULE_BACKSHELL_COMPAT = [
  {
    modulePartId: FULL_CABLE.moduleLibraryId,
    backshellPartId: FULL_CABLE.backshellLibraryId,
    status: "allowed" as const
  }
];

export const FULL_CABLE_MODULE_STRAIN_RELIEF_COMPAT = [
  {
    modulePartId: FULL_CABLE.moduleLibraryId,
    strainReliefPartId: FULL_CABLE.strainReliefLibraryId,
    status: "allowed" as const
  }
];
