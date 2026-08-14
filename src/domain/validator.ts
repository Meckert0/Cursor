import type { LibraryLookup } from "./bom.js";
import type { CompatLookup } from "./compat-lookup.js";
import { isWirePart, type CompatStatus, type LibraryComponentRecord } from "./library.js";
import {
  awgInAcceptedRange,
  familyAccepted,
  parseWireAwg,
  resolveLibraryCompatibility
} from "./library-compatibility.js";
import {
  DEFAULT_RULESET_VERSION,
  MAX_SUPPORTED_PATH_LENGTH_IN,
  SUPPORTED_WIRE_AWGS,
  resolveRule,
  type RuleCode,
  type ValidationMode,
  type ValidationPolicyOverrides
} from "./ruleset-definitions.js";
import type { DesignSnapshot, ValidationIssue, ValidationReport } from "./types.js";

export interface ValidateSnapshotOptions {
  libraryLookup?: LibraryLookup;
  compatLookup?: CompatLookup;
  rulesetVersion?: string;
  mode?: ValidationMode;
  policy?: ValidationPolicyOverrides;
}

function resolveComponent(
  lookup: LibraryLookup,
  input: {
    libraryComponentId?: string;
    partNumber?: string;
    categories?: Parameters<LibraryLookup["byPartNumber"]>[1];
  }
): LibraryComponentRecord | undefined {
  let component = input.libraryComponentId ? lookup.byId(input.libraryComponentId) : undefined;
  if (!component && input.partNumber?.trim()) {
    component = lookup.byPartNumber(input.partNumber, input.categories);
  }
  return component;
}

export function validateSnapshot(snapshot: DesignSnapshot, options: ValidateSnapshotOptions = {}): ValidationReport {
  const issues: ValidationIssue[] = [];
  const rulesetVersion = options.rulesetVersion ?? DEFAULT_RULESET_VERSION;
  const mode: ValidationMode = options.mode ?? "full";
  const policy = options.policy;

  const emit = (
    code: RuleCode,
    issue: Omit<ValidationIssue, "code" | "severity"> & { severity?: ValidationIssue["severity"] }
  ) => {
    const resolved = resolveRule(rulesetVersion, code, mode, policy);
    if (!resolved.enabled) {
      return;
    }
    issues.push({
      severity: issue.severity ?? resolved.severity,
      code,
      entityType: issue.entityType,
      entityId: issue.entityId,
      message: issue.message
    });
  };

  const connectorIds = new Set(snapshot.connectors.map((c) => c.id));
  const junctionIds = new Set((snapshot.junctions ?? []).map((junction) => junction.id));
  const nodeIds = new Set([...connectorIds, ...junctionIds]);
  const pathIds = new Set(snapshot.paths.map((p) => p.id));
  const pathById = new Map(snapshot.paths.map((p) => [p.id, p]));
  const connectorById = new Map(snapshot.connectors.map((c) => [c.id, c]));
  const connectorPins = new Map(snapshot.connectors.map((c) => [c.id, new Set(c.pins.map((p) => p.id))]));
  const connectorUsage = new Map(snapshot.connectors.map((c) => [c.id, 0]));
  const sourceKeyCount = new Map<string, number>();
  const mappedPinsByConnector = new Map<string, Set<string>>();

  const noteMappedPin = (connectorId: string, pinId: string) => {
    if (!connectorIds.has(connectorId) || !pinId.trim()) {
      return;
    }
    const existing = mappedPinsByConnector.get(connectorId) ?? new Set<string>();
    existing.add(pinId);
    mappedPinsByConnector.set(connectorId, existing);
  };

  for (const path of snapshot.paths) {
    if (!nodeIds.has(path.fromConnectorId) || !nodeIds.has(path.toConnectorId)) {
      emit("RULE_PATH_CONNECTOR_NOT_FOUND", {
        entityType: "path",
        entityId: path.id,
        message: "Path references connector or junction node that does not exist in this revision."
      });
    }

    if (connectorIds.has(path.fromConnectorId)) {
      connectorUsage.set(path.fromConnectorId, (connectorUsage.get(path.fromConnectorId) ?? 0) + 1);
    }
    if (connectorIds.has(path.toConnectorId)) {
      connectorUsage.set(path.toConnectorId, (connectorUsage.get(path.toConnectorId) ?? 0) + 1);
    }
  }

  for (const bundle of snapshot.bundles) {
    for (const pathId of bundle.pathIds) {
      if (!pathIds.has(pathId)) {
        emit("RULE_BUNDLE_PATH_NOT_FOUND", {
          entityType: "bundle",
          entityId: bundle.id,
          message: "Bundle references a path that does not exist."
        });
      }
    }
  }

  for (const mapping of snapshot.pinMappings) {
    if (!pathIds.has(mapping.pathId)) {
      emit("RULE_PIN_MAPPING_INVALID_PATH", {
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping references a path that does not exist."
      });
    }

    const fromIsConnector = connectorIds.has(mapping.fromConnectorId);
    const toIsConnector = connectorIds.has(mapping.toConnectorId);
    const fromIsJunction = junctionIds.has(mapping.fromConnectorId);
    const toIsJunction = junctionIds.has(mapping.toConnectorId);

    if ((!fromIsConnector && !fromIsJunction) || (!toIsConnector && !toIsJunction)) {
      emit("RULE_PIN_MAPPING_CONNECTOR_NOT_FOUND", {
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping references connector or junction that does not exist."
      });
    }

    if (fromIsJunction || toIsJunction) {
      if ((fromIsJunction && mapping.fromPinId.trim()) || (toIsJunction && mapping.toPinId.trim())) {
        emit("RULE_PIN_MAPPING_JUNCTION_ENDPOINT", {
          entityType: "pinMapping",
          entityId: mapping.id,
          message: "Pin mapping at a junction endpoint must leave the junction pin empty."
        });
      }
    }

    if (fromIsConnector && toIsConnector) {
      if (!mapping.fromPinId.trim() || !mapping.toPinId.trim()) {
        emit("RULE_PIN_MAPPING_INCOMPLETE", {
          entityType: "pinMapping",
          entityId: mapping.id,
          message: "Pin mapping must include both source and destination pins."
        });
      }
    } else if (fromIsConnector && !mapping.fromPinId.trim()) {
      emit("RULE_PIN_MAPPING_INCOMPLETE", {
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping must include the connector-side pin."
      });
    } else if (toIsConnector && !mapping.toPinId.trim()) {
      emit("RULE_PIN_MAPPING_INCOMPLETE", {
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping must include the connector-side pin."
      });
    }

    if (fromIsConnector) {
      const sourcePins = connectorPins.get(mapping.fromConnectorId);
      if (sourcePins && mapping.fromPinId.trim() && !sourcePins.has(mapping.fromPinId)) {
        emit("RULE_PIN_MAPPING_SOURCE_PIN_NOT_FOUND", {
          entityType: "pinMapping",
          entityId: mapping.id,
          message: "Pin mapping source pin does not exist on source connector."
        });
      }
    }

    if (toIsConnector) {
      const destinationPins = connectorPins.get(mapping.toConnectorId);
      if (destinationPins && mapping.toPinId.trim() && !destinationPins.has(mapping.toPinId)) {
        emit("RULE_PIN_MAPPING_DEST_PIN_NOT_FOUND", {
          entityType: "pinMapping",
          entityId: mapping.id,
          message: "Pin mapping destination pin does not exist on destination connector."
        });
      }
    }

    if (mapping.mappingType === "loopback") {
      if (mapping.fromConnectorId !== mapping.toConnectorId) {
        emit("RULE_PIN_MAPPING_LOOPBACK_INVALID", {
          entityType: "pinMapping",
          entityId: mapping.id,
          message: "Loopback pin mapping must use the same connector for source and destination."
        });
      }
    } else if (mapping.fromConnectorId === mapping.toConnectorId && fromIsConnector) {
      emit("RULE_PIN_MAPPING_LOOPBACK_INVALID", {
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Same-connector pin mapping must use mappingType loopback."
      });
    }

    if (mapping.mappingType === "one_to_many" && mapping.fromConnectorId === mapping.toConnectorId) {
      emit("RULE_PIN_MAPPING_ONE_TO_MANY_INVALID", {
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "one_to_many pin mapping cannot target the same connector as the source."
      });
    }

    const sourceKey = `${mapping.pathId}:${mapping.fromConnectorId}:${mapping.fromPinId}`;
    const count = (sourceKeyCount.get(sourceKey) ?? 0) + 1;
    sourceKeyCount.set(sourceKey, count);
    if (count > 1 && mapping.mappingType !== "one_to_many") {
      emit("RULE_PIN_MAPPING_DUPLICATE_SOURCE", {
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Duplicate source pin mapping detected for this path."
      });
    }

    const path = pathById.get(mapping.pathId);
    if (path) {
      const matchesForward =
        path.fromConnectorId === mapping.fromConnectorId && path.toConnectorId === mapping.toConnectorId;
      const matchesReverse =
        path.fromConnectorId === mapping.toConnectorId && path.toConnectorId === mapping.fromConnectorId;
      if (!matchesForward && !matchesReverse) {
        emit("RULE_PIN_MAPPING_ENDPOINT_MISMATCH", {
          entityType: "pinMapping",
          entityId: mapping.id,
          message: "Pin mapping connector endpoints do not match mapped path endpoints."
        });
      }
    }

    noteMappedPin(mapping.fromConnectorId, mapping.fromPinId);
    noteMappedPin(mapping.toConnectorId, mapping.toPinId);
  }

  for (const connector of snapshot.connectors) {
    if ((connectorUsage.get(connector.id) ?? 0) === 0) {
      emit("RULE_CONNECTOR_ORPHANED", {
        entityType: "connector",
        entityId: connector.id,
        message: "Connector is not used by any path."
      });
    }

    if ((connectorUsage.get(connector.id) ?? 0) > 0 && connector.pins.length > 0) {
      const mapped = mappedPinsByConnector.get(connector.id) ?? new Set<string>();
      const unmapped = connector.pins.filter((pin) => !mapped.has(pin.id));
      if (unmapped.length > 0) {
        emit("RULE_CONNECTOR_INCOMPLETE_MAPPING", {
          entityType: "connector",
          entityId: connector.id,
          message: `Connector has ${unmapped.length} unmapped pin(s): ${unmapped.map((pin) => pin.number).join(", ")}.`
        });
      }
    }
  }

  for (const path of snapshot.paths) {
    const wireAwg = parseWireAwg(path.wireAwg);
    if (wireAwg !== undefined && !SUPPORTED_WIRE_AWGS.has(wireAwg)) {
      emit("RULE_WIRE_GAUGE_UNSUPPORTED", {
        entityType: "path",
        entityId: path.id,
        message: `Wire gauge AWG ${wireAwg} is not in the supported manufacturable set.`
      });
    }

    if (path.length !== undefined) {
      if (!Number.isFinite(path.length) || path.length <= 0 || path.length > MAX_SUPPORTED_PATH_LENGTH_IN) {
        emit("RULE_WIRE_LENGTH_UNSUPPORTED", {
          entityType: "path",
          entityId: path.id,
          message: `Path length ${path.length} is outside the supported manufacturable range (0 < length ≤ ${MAX_SUPPORTED_PATH_LENGTH_IN} in).`
        });
      }
    }
  }

  if (options.libraryLookup) {
    const lookup = options.libraryLookup;

    for (const connector of snapshot.connectors) {
      const component = resolveComponent(lookup, {
        libraryComponentId: connector.libraryComponentId,
        partNumber: connector.partNumber,
        categories: ["module", "contact"]
      });

      if (connector.libraryComponentId || connector.partNumber?.trim()) {
        if (!component) {
          emit("RULE_LIBRARY_PART_NOT_FOUND", {
            entityType: "connector",
            entityId: connector.id,
            message: `Connector part "${connector.partNumber ?? connector.libraryComponentId}" was not found in the component library.`
          });
        } else {
          emitLibraryStatusIssues(emit, {
            entityType: "connector",
            entityId: connector.id,
            partLabel: "Connector part",
            component
          });

          const compatibility = resolveLibraryCompatibility(component);
          if (compatibility.pinCount !== undefined && connector.pins.length !== compatibility.pinCount) {
            emit("RULE_CONNECTOR_PIN_COUNT_MISMATCH", {
              entityType: "connector",
              entityId: connector.id,
              message: `Connector pin count ${connector.pins.length} does not match library definition pin count ${compatibility.pinCount}.`
            });
          }

          if (compatibility.pinIds && compatibility.pinIds.length > 0) {
            const allowed = new Set(compatibility.pinIds.map((id) => id.trim()));
            for (const pin of connector.pins) {
              if (!allowed.has(pin.id) && !allowed.has(pin.number)) {
                emit("RULE_CONNECTOR_PIN_ID_UNKNOWN", {
                  entityType: "connector",
                  entityId: connector.id,
                  message: `Connector pin "${pin.number}" is not defined on library part "${component.partNumber}".`
                });
              }
            }
          }
        }
      }
    }

    for (const path of snapshot.paths) {
      const wireComponent = resolveComponent(lookup, {
        libraryComponentId: path.wireComponentId,
        partNumber: path.wirePartNumber,
        categories: "wire"
      });

      if (path.wireComponentId || path.wirePartNumber?.trim()) {
        if (!wireComponent) {
          emit("RULE_LIBRARY_PART_NOT_FOUND", {
            entityType: "path",
            entityId: path.id,
            message: `Wire part "${path.wirePartNumber ?? path.wireComponentId}" was not found in the component library.`
          });
        } else {
          emitLibraryStatusIssues(emit, {
            entityType: "path",
            entityId: path.id,
            partLabel: "Wire part",
            component: wireComponent
          });
        }
      }

      if (path.labelPartNumber?.trim()) {
        const labelComponent = resolveComponent(lookup, {
          partNumber: path.labelPartNumber,
          categories: "label"
        });
        if (!labelComponent) {
          emit("RULE_LIBRARY_PART_NOT_FOUND", {
            entityType: "path",
            entityId: path.id,
            message: `Label part "${path.labelPartNumber}" was not found in the component library.`
          });
        } else {
          emitLibraryStatusIssues(emit, {
            entityType: "path",
            entityId: path.id,
            partLabel: "Label part",
            component: labelComponent
          });
        }
      }

      const wireAwgValue =
        path.wireAwg ??
        (wireComponent && isWirePart(wireComponent) ? wireComponent.attributes.awg : undefined);
      const wireAwg = parseWireAwg(wireAwgValue);

      if (
        path.wireAwg === undefined &&
        wireAwg !== undefined &&
        !SUPPORTED_WIRE_AWGS.has(wireAwg)
      ) {
        emit("RULE_WIRE_GAUGE_UNSUPPORTED", {
          entityType: "path",
          entityId: path.id,
          message: `Wire gauge AWG ${wireAwg} is not in the supported manufacturable set.`
        });
      }

      const endpointConnectorIds = [path.fromConnectorId, path.toConnectorId].filter((id) => connectorIds.has(id));
      for (const connectorId of endpointConnectorIds) {
        const connector = connectorById.get(connectorId);
        if (!connector) {
          continue;
        }
        const connectorComponent = resolveComponent(lookup, {
          libraryComponentId: connector.libraryComponentId,
          partNumber: connector.partNumber,
          categories: ["module", "contact"]
        });
        if (!connectorComponent) {
          continue;
        }
        // Contacts own accepted_*; modules no longer carry family/AWG restrictions.
        if (connectorComponent.category !== "contact") {
          continue;
        }
        const compatibility = resolveLibraryCompatibility(connectorComponent);
        if (wireComponent && !familyAccepted(wireComponent.family, compatibility.acceptedFamilies)) {
          emit("RULE_CONNECTOR_FAMILY_RESTRICTED", {
            entityType: "path",
            entityId: path.id,
            message: `Wire family "${wireComponent.family}" is not accepted by connector part "${connectorComponent.partNumber}".`
          });
        }
        if (wireAwg !== undefined && (compatibility.acceptedAwgMin !== undefined || compatibility.acceptedAwgMax !== undefined)) {
          if (!awgInAcceptedRange(wireAwg, compatibility)) {
            emit("RULE_WIRE_AWG_INCOMPATIBLE", {
              entityType: "path",
              entityId: path.id,
              message: `Wire AWG ${wireAwg} is outside accepted range for connector part "${connectorComponent.partNumber}".`
            });
          }
        }
      }

      for (const contactPartNumber of [path.fromContact, path.toContact]) {
        if (!contactPartNumber?.trim()) {
          continue;
        }
        const contactComponent = resolveComponent(lookup, {
          partNumber: contactPartNumber,
          categories: "contact"
        });
        if (!contactComponent) {
          emit("RULE_LIBRARY_PART_NOT_FOUND", {
            entityType: "path",
            entityId: path.id,
            message: `Contact part "${contactPartNumber}" was not found in the component library.`
          });
          continue;
        }
        emitLibraryStatusIssues(emit, {
          entityType: "path",
          entityId: path.id,
          partLabel: "Contact part",
          component: contactComponent
        });
        const compatibility = resolveLibraryCompatibility(contactComponent);
        if (wireAwg !== undefined && (compatibility.acceptedAwgMin !== undefined || compatibility.acceptedAwgMax !== undefined)) {
          if (!awgInAcceptedRange(wireAwg, compatibility)) {
            emit("RULE_WIRE_AWG_INCOMPATIBLE", {
              entityType: "path",
              entityId: path.id,
              message: `Wire AWG ${wireAwg} is outside accepted range for contact part "${contactComponent.partNumber}".`
            });
          }
        }
        if (wireComponent && options.compatLookup) {
          emitCompatFinding(emit, {
            code: "RULE_COMPAT_CONTACT_WIRE",
            status: options.compatLookup.contactWire(contactComponent.id, wireComponent.id),
            entityType: "path",
            entityId: path.id,
            leftLabel: `Contact "${contactComponent.partNumber}"`,
            rightLabel: `wire "${wireComponent.partNumber}"`
          });
        }
      }

      // Module ↔ contact pairs when both ends resolve.
      for (const connectorId of endpointConnectorIds) {
        const connector = connectorById.get(connectorId);
        if (!connector || !options.compatLookup) {
          continue;
        }
        const moduleComponent = resolveComponent(lookup, {
          libraryComponentId: connector.libraryComponentId,
          partNumber: connector.partNumber,
          categories: "module"
        });
        if (!moduleComponent || moduleComponent.category !== "module") {
          continue;
        }
        for (const contactPartNumber of [path.fromContact, path.toContact]) {
          if (!contactPartNumber?.trim()) {
            continue;
          }
          const contactComponent = resolveComponent(lookup, {
            partNumber: contactPartNumber,
            categories: "contact"
          });
          if (!contactComponent) {
            continue;
          }
          emitCompatFinding(emit, {
            code: "RULE_COMPAT_MODULE_CONTACT",
            status: options.compatLookup.moduleContact(moduleComponent.id, contactComponent.id),
            entityType: "path",
            entityId: path.id,
            leftLabel: `Module "${moduleComponent.partNumber}"`,
            rightLabel: `contact "${contactComponent.partNumber}"`
          });
        }
      }
    }

    // Module ↔ accessory (backshell / strain-relief) pairs on connectors.
    if (options.compatLookup) {
      for (const connector of snapshot.connectors) {
        const moduleComponent = resolveComponent(lookup, {
          libraryComponentId: connector.libraryComponentId,
          partNumber: connector.partNumber,
          categories: "module"
        });
        if (!moduleComponent || moduleComponent.category !== "module") {
          continue;
        }

        if (connector.backshellLibraryComponentId || connector.backshellPartNumber?.trim()) {
          const backshell = resolveComponent(lookup, {
            libraryComponentId: connector.backshellLibraryComponentId,
            partNumber: connector.backshellPartNumber,
            categories: "backshell"
          });
          if (backshell) {
            emitCompatFinding(emit, {
              code: "RULE_COMPAT_MODULE_BACKSHELL",
              status: options.compatLookup.moduleBackshell(moduleComponent.id, backshell.id),
              entityType: "connector",
              entityId: connector.id,
              leftLabel: `Module "${moduleComponent.partNumber}"`,
              rightLabel: `backshell "${backshell.partNumber}"`
            });
          }
        }

        if (connector.strainReliefLibraryComponentId || connector.strainReliefPartNumber?.trim()) {
          const strainRelief = resolveComponent(lookup, {
            libraryComponentId: connector.strainReliefLibraryComponentId,
            partNumber: connector.strainReliefPartNumber,
            categories: "strain-relief"
          });
          if (strainRelief) {
            emitCompatFinding(emit, {
              code: "RULE_COMPAT_MODULE_STRAIN_RELIEF",
              status: options.compatLookup.moduleStrainRelief(moduleComponent.id, strainRelief.id),
              entityType: "connector",
              entityId: connector.id,
              leftLabel: `Module "${moduleComponent.partNumber}"`,
              rightLabel: `strain relief "${strainRelief.partNumber}"`
            });
          }
        }
      }
    }
  }

  const sortedIssues = issues.sort((a, b) => {
    const left = `${a.code}:${a.entityType ?? ""}:${a.entityId ?? ""}:${a.message}`;
    const right = `${b.code}:${b.entityType ?? ""}:${b.entityId ?? ""}:${b.message}`;
    return left.localeCompare(right);
  });

  const errors = sortedIssues.filter((i) => i.severity === "error").length;
  const warnings = sortedIssues.filter((i) => i.severity === "warning").length;
  const infos = sortedIssues.filter((i) => i.severity === "info").length;

  return { errors, warnings, infos, results: sortedIssues };
}

function emitCompatFinding(
  emit: (
    code: RuleCode,
    issue: Omit<ValidationIssue, "code" | "severity"> & { severity?: ValidationIssue["severity"] }
  ) => void,
  input: {
    code:
      | "RULE_COMPAT_CONTACT_WIRE"
      | "RULE_COMPAT_MODULE_CONTACT"
      | "RULE_COMPAT_MODULE_BACKSHELL"
      | "RULE_COMPAT_MODULE_STRAIN_RELIEF";
    status: CompatStatus | undefined;
    entityType: string;
    entityId: string;
    leftLabel: string;
    rightLabel: string;
  }
) {
  if (!input.status || input.status === "allowed") {
    return;
  }
  const severity = input.status === "forbidden" ? ("error" as const) : ("warning" as const);
  const verb = input.status === "forbidden" ? "is forbidden" : "requires review";
  emit(input.code, {
    severity,
    entityType: input.entityType,
    entityId: input.entityId,
    message: `${input.leftLabel} ${verb} with ${input.rightLabel} per catalog compatibility.`
  });
}

function emitLibraryStatusIssues(
  emit: (
    code: RuleCode,
    issue: Omit<ValidationIssue, "code" | "severity"> & { severity?: ValidationIssue["severity"] }
  ) => void,
  input: {
    entityType: string;
    entityId: string;
    partLabel: string;
    component: LibraryComponentRecord;
  }
) {
  if (!input.component.isActive) {
    emit("RULE_LIBRARY_PART_INACTIVE", {
      entityType: input.entityType,
      entityId: input.entityId,
      message: `${input.partLabel} "${input.component.partNumber}" is inactive in the component library.`
    });
  }

  if (!input.component.isReviewed) {
    emit("RULE_LIBRARY_PART_UNREVIEWED", {
      entityType: input.entityType,
      entityId: input.entityId,
      message: `${input.partLabel} "${input.component.partNumber}" is unreviewed in the component library.`
    });
  }

  if (input.component.stockStatus === "out_of_stock") {
    emit("RULE_LIBRARY_PART_OUT_OF_STOCK", {
      entityType: input.entityType,
      entityId: input.entityId,
      message: `${input.partLabel} "${input.component.partNumber}" is out of stock in the component library.`
    });
  }
}
