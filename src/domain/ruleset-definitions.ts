export type RuleSeverity = "error" | "warning" | "info";
export type ValidationMode = "quick" | "full";

export interface RuleConfig {
  enabled: boolean;
  severity: RuleSeverity;
  /** When omitted, the rule runs in both modes. */
  modes?: ValidationMode[];
}

export type RuleCode =
  | "RULE_PATH_CONNECTOR_NOT_FOUND"
  | "RULE_BUNDLE_PATH_NOT_FOUND"
  | "RULE_PIN_MAPPING_INVALID_PATH"
  | "RULE_PIN_MAPPING_CONNECTOR_NOT_FOUND"
  | "RULE_PIN_MAPPING_INCOMPLETE"
  | "RULE_PIN_MAPPING_SOURCE_PIN_NOT_FOUND"
  | "RULE_PIN_MAPPING_DEST_PIN_NOT_FOUND"
  | "RULE_PIN_MAPPING_DUPLICATE_SOURCE"
  | "RULE_PIN_MAPPING_ENDPOINT_MISMATCH"
  | "RULE_PIN_MAPPING_LOOPBACK_INVALID"
  | "RULE_PIN_MAPPING_ONE_TO_MANY_INVALID"
  | "RULE_PIN_MAPPING_JUNCTION_ENDPOINT"
  | "RULE_CONNECTOR_INCOMPLETE_MAPPING"
  | "RULE_CONNECTOR_ORPHANED"
  | "RULE_LIBRARY_PART_NOT_FOUND"
  | "RULE_LIBRARY_PART_INACTIVE"
  | "RULE_LIBRARY_PART_UNREVIEWED"
  | "RULE_LIBRARY_PART_OUT_OF_STOCK"
  | "RULE_CONNECTOR_PIN_COUNT_MISMATCH"
  | "RULE_CONNECTOR_PIN_ID_UNKNOWN"
  | "RULE_CONNECTOR_FAMILY_RESTRICTED"
  | "RULE_WIRE_AWG_INCOMPATIBLE"
  | "RULE_WIRE_LENGTH_UNSUPPORTED"
  | "RULE_WIRE_GAUGE_UNSUPPORTED";

const STRUCTURAL_ALWAYS: RuleConfig = { enabled: true, severity: "error" };
const FULL_ONLY_WARNING: RuleConfig = { enabled: true, severity: "warning", modes: ["full"] };
const FULL_ONLY_ERROR: RuleConfig = { enabled: true, severity: "error", modes: ["full"] };
const DISABLED: RuleConfig = { enabled: false, severity: "warning" };

function baseStructuralRules(): Record<RuleCode, RuleConfig> {
  return {
    RULE_PATH_CONNECTOR_NOT_FOUND: STRUCTURAL_ALWAYS,
    RULE_BUNDLE_PATH_NOT_FOUND: STRUCTURAL_ALWAYS,
    RULE_PIN_MAPPING_INVALID_PATH: STRUCTURAL_ALWAYS,
    RULE_PIN_MAPPING_CONNECTOR_NOT_FOUND: STRUCTURAL_ALWAYS,
    RULE_PIN_MAPPING_INCOMPLETE: STRUCTURAL_ALWAYS,
    RULE_PIN_MAPPING_SOURCE_PIN_NOT_FOUND: STRUCTURAL_ALWAYS,
    RULE_PIN_MAPPING_DEST_PIN_NOT_FOUND: STRUCTURAL_ALWAYS,
    RULE_PIN_MAPPING_DUPLICATE_SOURCE: STRUCTURAL_ALWAYS,
    RULE_PIN_MAPPING_ENDPOINT_MISMATCH: STRUCTURAL_ALWAYS,
    RULE_PIN_MAPPING_LOOPBACK_INVALID: { enabled: true, severity: "error" },
    RULE_PIN_MAPPING_ONE_TO_MANY_INVALID: { enabled: true, severity: "error" },
    RULE_PIN_MAPPING_JUNCTION_ENDPOINT: { enabled: true, severity: "error" },
    RULE_CONNECTOR_INCOMPLETE_MAPPING: FULL_ONLY_WARNING,
    RULE_CONNECTOR_ORPHANED: FULL_ONLY_WARNING,
    RULE_LIBRARY_PART_NOT_FOUND: STRUCTURAL_ALWAYS,
    RULE_LIBRARY_PART_INACTIVE: { enabled: true, severity: "warning", modes: ["full"] },
    RULE_LIBRARY_PART_UNREVIEWED: { enabled: true, severity: "warning", modes: ["full"] },
    RULE_LIBRARY_PART_OUT_OF_STOCK: { enabled: true, severity: "info", modes: ["full"] },
    RULE_CONNECTOR_PIN_COUNT_MISMATCH: DISABLED,
    RULE_CONNECTOR_PIN_ID_UNKNOWN: DISABLED,
    RULE_CONNECTOR_FAMILY_RESTRICTED: DISABLED,
    RULE_WIRE_AWG_INCOMPATIBLE: DISABLED,
    RULE_WIRE_LENGTH_UNSUPPORTED: DISABLED,
    RULE_WIRE_GAUGE_UNSUPPORTED: DISABLED
  };
}

/** Default / legacy ruleset: topology + library existence; light electrical; no compatibility matrix. */
const RULES_2026_03: Record<RuleCode, RuleConfig> = baseStructuralRules();

/** Stricter manufacturability ruleset: compatibility + inactive/OOS as errors; incomplete mapping is an error. */
const RULES_2026_04: Record<RuleCode, RuleConfig> = {
  ...baseStructuralRules(),
  RULE_CONNECTOR_INCOMPLETE_MAPPING: FULL_ONLY_ERROR,
  RULE_LIBRARY_PART_INACTIVE: { enabled: true, severity: "error", modes: ["full"] },
  RULE_LIBRARY_PART_UNREVIEWED: { enabled: true, severity: "warning", modes: ["full"] },
  RULE_LIBRARY_PART_OUT_OF_STOCK: { enabled: true, severity: "error", modes: ["full"] },
  RULE_CONNECTOR_PIN_COUNT_MISMATCH: FULL_ONLY_ERROR,
  RULE_CONNECTOR_PIN_ID_UNKNOWN: FULL_ONLY_ERROR,
  RULE_CONNECTOR_FAMILY_RESTRICTED: FULL_ONLY_ERROR,
  RULE_WIRE_AWG_INCOMPATIBLE: FULL_ONLY_ERROR,
  RULE_WIRE_LENGTH_UNSUPPORTED: FULL_ONLY_ERROR,
  RULE_WIRE_GAUGE_UNSUPPORTED: FULL_ONLY_ERROR
};

const RULESET_DEFINITIONS: Record<string, Record<RuleCode, RuleConfig>> = {
  "rules-2026.03": RULES_2026_03,
  "rules-2026.04": RULES_2026_04
};

export const DEFAULT_RULESET_VERSION = "rules-2026.03";

export interface ValidationPolicyOverrides {
  /** Escalate inactive library parts to this severity when set. */
  inactivePartSeverity?: RuleSeverity;
  /** Escalate unreviewed library parts to this severity when set. */
  unreviewedPartSeverity?: RuleSeverity;
  /** Escalate out-of-stock library parts to this severity when set. */
  outOfStockSeverity?: RuleSeverity;
}

export interface ResolvedRule {
  enabled: boolean;
  severity: RuleSeverity;
}

export function listKnownRulesetVersions(): string[] {
  return Object.keys(RULESET_DEFINITIONS).sort();
}

export function resolveRule(
  rulesetVersion: string,
  code: RuleCode,
  mode: ValidationMode,
  policy?: ValidationPolicyOverrides
): ResolvedRule {
  const definition = RULESET_DEFINITIONS[rulesetVersion] ?? RULESET_DEFINITIONS[DEFAULT_RULESET_VERSION];
  const config = definition[code] ?? { enabled: false, severity: "warning" as const };
  const modes = config.modes ?? (["quick", "full"] as ValidationMode[]);
  const enabled = config.enabled && modes.includes(mode);

  let severity = config.severity;
  if (code === "RULE_LIBRARY_PART_INACTIVE" && policy?.inactivePartSeverity) {
    severity = policy.inactivePartSeverity;
  }
  if (code === "RULE_LIBRARY_PART_UNREVIEWED" && policy?.unreviewedPartSeverity) {
    severity = policy.unreviewedPartSeverity;
  }
  if (code === "RULE_LIBRARY_PART_OUT_OF_STOCK" && policy?.outOfStockSeverity) {
    severity = policy.outOfStockSeverity;
  }

  return { enabled, severity };
}

/** Supported wire gauges for manufacturability checks (AWG). */
export const SUPPORTED_WIRE_AWGS = new Set([10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);

/** Maximum supported path length in inches. */
export const MAX_SUPPORTED_PATH_LENGTH_IN = 1200;
