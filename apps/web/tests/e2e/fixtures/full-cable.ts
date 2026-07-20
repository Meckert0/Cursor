/**
 * Canonical full-cable acceptance fixture expectations.
 * Parts are the active reviewed starter catalog entries from DEFAULT_LIBRARY_COMPONENTS.
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
  contactPartNumber: "CNT-22",
  labelPartNumber: "LBL-22",
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
