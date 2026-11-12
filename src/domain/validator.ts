import { compatibilityStatus } from "./compatibility-rules.js";
import { moduleAccessoryStatus } from "./module-accessory-compatibility.js";
import type { LibraryLookup } from "./bom.js";
import type { CompatLookup } from "./compat-lookup.js";
import {
  isFrameHousingConnector,
  isSlotPopulated,
  modulesAllowedForFrameSlot,
  flattenFramePins,
  slotForPinId,
  type FrameModuleRelationship
} from "./connector-frames.js";
import { catalogModulePins, isSimHost, isSimInsert, simAssignmentValid, simSlotIds, simSlotCapacity, usableSimPins } from "./sim-modules.js";
import { isWirePart, type CompatStatus, type LibraryComponentRecord } from "./library.js";
import {
  contactWireFit,
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
import type { ConnectorPin, DesignSnapshot, SimInsertAssignment, ValidationIssue, ValidationReport } from "./types.js";

export interface ValidateSnapshotOptions {
  libraryLookup?: LibraryLookup;
  compatLookup?: CompatLookup;
  partRelationships?: FrameModuleRelationship[];
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

function emitModulePinIssues(
  emit: (
    code: RuleCode,
    issue: Omit<ValidationIssue, "code" | "severity"> & { severity?: ValidationIssue["severity"] }
  ) => void,
  connectorId: string,
  pins: ConnectorPin[],
  component: LibraryComponentRecord
) {
  const compatibility = resolveLibraryCompatibility(component);
  if (compatibility.pinCount !== undefined && pins.length !== compatibility.pinCount) {
    emit("RULE_CONNECTOR_PIN_COUNT_MISMATCH", {
      entityType: "connector",
      entityId: connectorId,
      message: `Connector pin count ${pins.length} does not match library definition pin count ${compatibility.pinCount}.`
    });
  }

  if (compatibility.pinIds && compatibility.pinIds.length > 0) {
    const allowed = new Set(compatibility.pinIds.map((id) => id.trim()));
    for (const pin of pins) {
      if (!allowed.has(pin.id) && !allowed.has(pin.number)) {
        emit("RULE_CONNECTOR_PIN_ID_UNKNOWN", {
          entityType: "connector",
          entityId: connectorId,
          message: `Connector pin "${pin.number}" is not defined on library part "${component.partNumber}".`
        });
      }
    }
  }
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
    const pinsKey = (pins: ConnectorPin[]) => pins.map(pin => `${pin.id}\0${pin.number}`).sort().join("\n");
    const checkModule = (connectorId: string, label: string, module: { pins: ConnectorPin[]; simInserts?: SimInsertAssignment[] }, component: LibraryComponentRecord) => {
      if (isSimInsert(component)) {
        emit("RULE_SIM_INSERT_INVALID", { entityType: "connector", entityId: connectorId, message: `${label} is a SIM insert and must be placed inside a SIM module.` });
        return true;
      }
      if (!isSimHost(component) && !module.simInserts?.length) {
        emitModulePinIssues(emit, connectorId, module.pins, component);
        return false;
      }
      const assignments = module.simInserts ?? [];
      const parts = assignments.map(item => resolveComponent(lookup, { ...item, categories: "module" })).filter((part): part is LibraryComponentRecord => !!part);
      const ids = simSlotIds(component);
      const filled = new Set<string>();
      const starts = new Set<string>();
      for (const item of assignments) {
        const insert = resolveComponent(lookup, { ...item, categories: "module" });
        if (!insert) {
          emit("RULE_LIBRARY_PART_NOT_FOUND", { entityType: "connector", entityId: connectorId, message: `${label} SIM insert "${item.partNumber}" was not found in the library.` });
          continue;
        }
        emitLibraryStatusIssues(emit, { entityType: "connector", entityId: connectorId, partLabel: `${label} SIM insert`, component: insert });
        const start = item.slotId.trim().toUpperCase();
        if (starts.has(start) || !isSimInsert(insert) || !simAssignmentValid(component, item, assignments, parts, options.partRelationships ?? [])) {
          emit("RULE_SIM_INSERT_INVALID", { entityType: "connector", entityId: connectorId, message: `${label}: insert ${item.partNumber} does not fit or is not allowed at SIM slot ${item.slotId}, or overlaps another insert.` });
        } else {
          item.occupiedSlotIds.forEach(id => filled.add(id.trim().toUpperCase()));
        }
        starts.add(start);
        if (pinsKey(item.pins) !== pinsKey(catalogModulePins(insert))) {
          emit("RULE_SIM_INSERT_PINS", { entityType: "connector", entityId: connectorId, message: `${label}: SIM insert ${item.partNumber} pins do not match its library definition.` });
        }
      }
      if (!isSimHost(component) || !ids.length || ids.length !== simSlotCapacity(component)) {
        emit("RULE_SIM_INSERT_INVALID", { entityType: "connector", entityId: connectorId, message: `${label} needs a complete SIM host slot layout in the library.` });
      }
      const empty = ids.filter(id => !filled.has(id.trim().toUpperCase()));
      if (empty.length) {
        emit("RULE_SIM_INSERT_INCOMPLETE", { entityType: "connector", entityId: connectorId, message: `${label} has unfilled SIM slots: ${empty.join(", ")}.` });
      }
      const expected = usableSimPins(component, assignments.map(item => {
        const insert = parts.find(part => part.id === item.libraryComponentId);
        return insert ? { ...item, pins: catalogModulePins(insert) } : item;
      }), parts, options.partRelationships ?? []);
      if (isSimHost(component) && pinsKey(module.pins) !== pinsKey(expected)) {
        emit("RULE_SIM_INSERT_PINS", { entityType: "connector", entityId: connectorId, message: `${label} usable pins do not match the selected SIM inserts.` });
      }
      return true;
    };

    for (const connector of snapshot.connectors) {
      const isFrame = isFrameHousingConnector(connector);
      const component = resolveComponent(lookup, {
        libraryComponentId: connector.libraryComponentId,
        partNumber: connector.partNumber,
        categories: isFrame ? ["frame", "module", "contact"] : ["module", "contact"]
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
            partLabel: isFrame ? "Frame part" : "Connector part",
            component
          });

          if (!isFrame) {
            checkModule(connector.id, connector.reference, connector, component);
          }
        }
      }

      if (isFrame) {
        let hasSimModule = false;
        for (const slot of connector.slots ?? []) {
          if (!isSlotPopulated(slot)) {
            continue;
          }
          const slotModule = resolveComponent(lookup, {
            libraryComponentId: slot.libraryComponentId,
            partNumber: slot.partNumber,
            categories: "module"
          });
          if (!slotModule) {
            emit("RULE_LIBRARY_PART_NOT_FOUND", {
              entityType: "connector",
              entityId: connector.id,
              message: `Slot ${slot.slotId} module "${slot.partNumber ?? slot.libraryComponentId}" was not found in the component library.`
            });
            continue;
          }
          emitLibraryStatusIssues(emit, {
            entityType: "connector",
            entityId: connector.id,
            partLabel: `Slot ${slot.slotId} module`,
            component: slotModule
          });
          hasSimModule = checkModule(connector.id, slot.reference, slot, slotModule) || hasSimModule;

          if (component?.category === "frame" && options.partRelationships) {
            const allowed = modulesAllowedForFrameSlot(
              component.id,
              slot.slotId,
              options.partRelationships,
              [slotModule],
              component
            );
            if (allowed.length === 0) {
              emit("RULE_COMPAT_FRAME_MODULE", {
                entityType: "connector",
                entityId: connector.id,
                message: `Module "${slotModule.partNumber}" is not allowed in slot ${slot.slotId} of frame "${component.partNumber}".`
              });
            }
          }
        }
        if (hasSimModule && pinsKey(connector.pins) !== pinsKey(flattenFramePins(connector.slots ?? []))) {
          emit("RULE_SIM_INSERT_PINS", { entityType: "connector", entityId: connector.id, message: `Frame ${connector.reference} pins do not match its modules and SIM inserts.` });
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

      if (path.labelPartNumber?.trim() || path.labelComponentId) {
        const labelComponent = resolveComponent(lookup, {
          libraryComponentId: path.labelComponentId,
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
          categories: ["frame", "module", "contact"]
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
        if (wireComponent && isWirePart(wireComponent) && contactWireFit(compatibility, wireComponent.attributes, wireComponent.family, path.wireAwg) === "incompatible") {
          emit("RULE_WIRE_AWG_INCOMPATIBLE", {
            entityType: "path", entityId: path.id,
            message: `Wire "${wireComponent.partNumber}" does not meet contact "${contactComponent.partNumber}" gauge, media, family, or insulation-diameter requirements.`
          });
        } else if (!wireComponent && wireAwg !== undefined && !awgInAcceptedRange(wireAwg, compatibility)) {
          emit("RULE_WIRE_AWG_INCOMPATIBLE", { entityType: "path", entityId: path.id, message: `Wire AWG ${wireAwg} is outside accepted range for contact "${contactComponent.partNumber}".` });
        }
        if (wireComponent && options.compatLookup) {
          emitCompatFinding(emit, {
            code: "RULE_COMPAT_CONTACT_WIRE",
            status: compatibilityStatus({ rules: options.partRelationships ?? [], parentPartId: contactComponent.id, relationshipType: "WIRE_ALLOWED", targetPartId: wireComponent.id, targetPartNumber: wireComponent.partNumber }) ?? options.compatLookup.contactWire(contactComponent.id, wireComponent.id),
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
        const mapping = snapshot.pinMappings.find((entry) => entry.pathId === path.id);
        const mappingPinId =
          mapping?.fromConnectorId === connectorId
            ? mapping.fromPinId
            : mapping?.toConnectorId === connectorId
              ? mapping.toPinId
              : "";
        const slot = mappingPinId ? slotForPinId(connector, mappingPinId) : undefined;
        const localPinId = slot ? mappingPinId.slice(slot.slotId.length + 1) : mappingPinId;
        const simInsert = (slot ?? connector).simInserts?.find(item => localPinId.startsWith(`${item.slotId}:`));
        const moduleComponent = resolveComponent(lookup, {
          libraryComponentId: simInsert?.libraryComponentId ?? slot?.libraryComponentId ?? connector.libraryComponentId,
          partNumber: simInsert?.partNumber ?? slot?.partNumber ?? connector.partNumber,
          categories: "module"
        });
        if (!moduleComponent || moduleComponent.category !== "module") {
          continue;
        }
        for (const contactPartNumber of [connectorId === path.fromConnectorId ? path.fromContact : path.toContact]) {
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
          const contactRules = (options.partRelationships ?? []).filter(rule => rule.parentPartId === moduleComponent.id && rule.relationshipType === "CONTACT_ALLOWED");
          const pin = simInsert ? localPinId.slice(simInsert.slotId.length + 1) : localPinId;
          const status = compatibilityStatus({
            rules: contactRules, parentPartId: moduleComponent.id, relationshipType: "CONTACT_ALLOWED",
            targetPartId: contactComponent.id, targetPartNumber: contactComponent.partNumber, position: pin,
            requireAllowance: contactRules.some(rule => rule.isExhaustive !== false)
          }) ?? options.compatLookup.moduleContact(moduleComponent.id, contactComponent.id);
          emitCompatFinding(emit, {
            code: "RULE_COMPAT_MODULE_CONTACT",
            status,
            entityType: "path",
            entityId: path.id,
            leftLabel: `Module "${moduleComponent.partNumber}"`,
            rightLabel: `contact "${contactComponent.partNumber}"`
          });
        }
      }
    }

    // Module ↔ accessory (backshell / strain-relief) pairs on connectors or frame slots.
    for (const connector of snapshot.connectors) {
      const accessoryUnits = isFrameHousingConnector(connector)
        ? (connector.slots ?? []).filter(isSlotPopulated).map((slot) => ({
            libraryComponentId: slot.libraryComponentId,
            partNumber: slot.partNumber,
            backshellLibraryComponentId: slot.backshellLibraryComponentId,
            backshellPartNumber: slot.backshellPartNumber,
            strainReliefLibraryComponentId: slot.strainReliefLibraryComponentId,
            strainReliefPartNumber: slot.strainReliefPartNumber
          }))
        : [
            {
              libraryComponentId: connector.libraryComponentId,
              partNumber: connector.partNumber,
              backshellLibraryComponentId: connector.backshellLibraryComponentId,
              backshellPartNumber: connector.backshellPartNumber,
              strainReliefLibraryComponentId: connector.strainReliefLibraryComponentId,
              strainReliefPartNumber: connector.strainReliefPartNumber
            }
          ];

      for (const unit of accessoryUnits) {
        const moduleComponent = resolveComponent(lookup, {
          libraryComponentId: unit.libraryComponentId,
          partNumber: unit.partNumber,
          categories: "module"
        });
        if (!moduleComponent || moduleComponent.category !== "module") {
          continue;
        }

        if (unit.backshellLibraryComponentId || unit.backshellPartNumber?.trim()) {
          const backshell = resolveComponent(lookup, {
            libraryComponentId: unit.backshellLibraryComponentId,
            partNumber: unit.backshellPartNumber,
            categories: "backshell"
          });
          if (backshell) {
            emitCompatFinding(emit, {
              code: "RULE_COMPAT_MODULE_BACKSHELL",
              status: moduleAccessoryStatus(moduleComponent, backshell, options.partRelationships ?? [])
                ?? options.compatLookup?.moduleBackshell(moduleComponent.id, backshell.id),
              entityType: "connector",
              entityId: connector.id,
              leftLabel: `Module "${moduleComponent.partNumber}"`,
              rightLabel: `backshell "${backshell.partNumber}"`
            });
          }
        }

        if (unit.strainReliefLibraryComponentId || unit.strainReliefPartNumber?.trim()) {
          const strainRelief = resolveComponent(lookup, {
            libraryComponentId: unit.strainReliefLibraryComponentId,
            partNumber: unit.strainReliefPartNumber,
            categories: "strain-relief"
          });
          if (strainRelief) {
            emitCompatFinding(emit, {
              code: "RULE_COMPAT_MODULE_STRAIN_RELIEF",
              status: moduleAccessoryStatus(moduleComponent, strainRelief, options.partRelationships ?? [])
                ?? options.compatLookup?.moduleStrainRelief(moduleComponent.id, strainRelief.id),
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
      | "RULE_COMPAT_MODULE_STRAIN_RELIEF"
      | "RULE_COMPAT_FRAME_MODULE";
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
