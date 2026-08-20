import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireRole } from "../auth/rbac.js";
import { LIBRARY_CATEGORIES, isWirePart } from "../domain/library.js";
import type { WireAttributes } from "../domain/library.js";

const libraryCategorySchema = z.enum(LIBRARY_CATEGORIES);
const stockStatusSchema = z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]);
const compatStatusSchema = z.enum(["allowed", "forbidden", "review"]);

const listLibraryQuerySchema = z.object({
  q: z.string().optional(),
  category: libraryCategorySchema.optional(),
  family: z.string().optional(),
  awg: z.string().optional(),
  color: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional(),
  stockStatus: stockStatusSchema.optional(),
  partType: z.string().optional(),
  side: z.string().optional()
});

const aliasEntrySchema = z.object({
  codeSystem: z.string().min(1),
  code: z.string().min(1)
});

const moduleContactPositionSchema = z.object({
  contactSize: z.string().min(1),
  contactFamily: z.string().optional(),
  pinCount: z.number().int().positive()
});

const sleeveSizeRangeSchema = z.object({
  minDia: z.number(),
  maxDia: z.number(),
  relatedPartId: z.string().optional()
});

const backshellFitmentSchema = z.object({
  familyType: z.string().min(1),
  gender: z.string().optional(),
  backshellSize: z.string().optional(),
  emi: z.boolean().optional()
});

const moduleAttributesSchema = z.object({
  genre: z.string().optional(),
  gender: z.string().optional(),
  contactFamily1: z.string().optional(),
  pinCount: z.number().int().positive().optional(),
  contactFamily2: z.string().optional(),
  pinCount2: z.number().int().positive().optional(),
  emi: z.boolean().optional(),
  crimpGauge: z.string().optional(),
  contactSize: z.string().optional(),
  ampRating: z.string().optional(),
  operatingVoltage: z.string().optional(),
  operatingTemp: z.string().optional(),
  defaultProtectiveCoverPartId: z.string().optional(),
  insertArrangement: z.string().optional(),
  pinIds: z.array(z.string().min(1)).default([]),
  contactPositions: z.array(moduleContactPositionSchema).default([]),
  positionCount: z.number().int().nonnegative().optional(),
  simSlotCount: z.number().int().positive().optional(),
  simSlotSections: z.array(z.array(z.string())).default([]),
  slotOccupancy: z.number().int().positive().optional()
});

const contactAttributesSchema = z
  .object({
    genre: z.string().optional(),
    gender: z.string().optional(),
    awg: z.string().optional(),
    plating: z.string().optional(),
    termType: z.string().optional(),
    ssCompatible: z.boolean().optional(),
    lengthAdded: z.number().optional(),
    acceptedAwgMin: z.number().positive().optional(),
    acceptedAwgMax: z.number().positive().optional(),
    acceptedFamilies: z.array(z.string().min(1)).default([]),
    contactSize: z.string().optional(),
    studSize: z.string().optional(),
    tih: z.boolean().optional(),
    acceptedGauges: z.array(z.string().min(1)).default([]),
    wireInterface: z.string().optional()
  })
  .superRefine((value, context) => {
    if (
      value.acceptedAwgMin !== undefined &&
      value.acceptedAwgMax !== undefined &&
      value.acceptedAwgMin > value.acceptedAwgMax
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "acceptedAwgMin must be less than or equal to acceptedAwgMax",
        path: ["acceptedAwgMin"]
      });
    }
  });

const wireAttributesSchema = z.object({
  milSpec: z.string().optional(),
  awg: z.string().min(1),
  color: z.string().min(1),
  cma: z.number().optional(),
  wireType: z.string().optional(),
  insulationMaterial: z.string().optional(),
  overallDia: z.number().optional(),
  conductorDia: z.number().optional(),
  numberOfConductors: z.number().int().positive().optional(),
  tempMax: z.number().optional(),
  overallWireBraid: z.boolean().optional(),
  overallWireFoil: z.boolean().optional(),
  internalPairFoil: z.boolean().optional(),
  weightPerFt: z.number().optional(),
  k1: z.number().optional(),
  k2: z.number().optional(),
  lossCoefficient: z.number().optional(),
  maxFreq: z.number().optional(),
  impedance: z.number().optional(),
  maxVoltage: z.number().optional()
});

const labelAttributesSchema = z.object({
  series: z.string().optional(),
  awgMin: z.number().optional(),
  awgMax: z.number().optional(),
  lengthIn: z.number().optional(),
  diaIn: z.number().optional()
});

const sleeveTubeBraidAttributesSchema = z.object({
  sizeRanges: z.array(sleeveSizeRangeSchema).default([])
});

const backshellAttributesSchema = z.object({
  keyingPartId: z.string().optional(),
  lengthAdded: z.number().optional(),
  bundleAllowance: z.number().optional(),
  fitments: z.array(backshellFitmentSchema).default([])
});

const strainReliefAttributesSchema = z.object({
  gender: z.string().optional(),
  requiresBackshell: z.boolean().optional(),
  relatedModuleHintPartId: z.string().optional()
});

const spliceAttributesSchema = z.object({
  conductorCount: z.number().int().positive().optional(),
  awg: z.string().optional(),
  manufacturerPn: z.string().optional(),
  variant: z.string().optional(),
  cmaMin: z.number().optional(),
  cmaMax: z.number().optional()
});

const frameAttributesSchema = z.object({
  moduleCapacity: z.number().int().positive().optional(),
  slotIds: z.array(z.string().min(1)).default([])
});

const ingestCommonFields = {
  id: z.string().min(1).optional(),
  family: z.string().min(1),
  partNumber: z.string().min(1),
  description: z.string().min(1),
  isActive: z.boolean().default(true),
  stockStatus: stockStatusSchema,
  isReviewed: z.boolean().default(false),
  reviewedByUserId: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  partType: z.string().optional(),
  side: z.string().optional(),
  notes: z.string().optional(),
  electricalMode: z.string().optional(),
  extraAttributes: z.record(z.string(), z.unknown()).optional(),
  aliases: z.array(aliasEntrySchema).optional()
};

const ingestItemSchema = z
  .discriminatedUnion("category", [
    z.object({
      category: z.literal("module"),
      attributes: moduleAttributesSchema,
      ...ingestCommonFields
    }),
    z.object({
      category: z.literal("contact"),
      attributes: contactAttributesSchema,
      ...ingestCommonFields
    }),
    z.object({
      category: z.literal("wire"),
      attributes: wireAttributesSchema,
      ...ingestCommonFields
    }),
    z.object({
      category: z.literal("label"),
      attributes: labelAttributesSchema,
      ...ingestCommonFields
    }),
    z.object({
      category: z.literal("sleeve-tube-braid"),
      attributes: sleeveTubeBraidAttributesSchema,
      ...ingestCommonFields
    }),
    z.object({
      category: z.literal("backshell"),
      attributes: backshellAttributesSchema,
      ...ingestCommonFields
    }),
    z.object({
      category: z.literal("strain-relief"),
      attributes: strainReliefAttributesSchema,
      ...ingestCommonFields
    }),
    z.object({
      category: z.literal("splice"),
      attributes: spliceAttributesSchema,
      ...ingestCommonFields
    }),
    z.object({
      category: z.literal("frame"),
      attributes: frameAttributesSchema,
      ...ingestCommonFields
    })
  ])
  .superRefine((value, context) => {
    if (value.isReviewed && (!value.reviewedByUserId || !value.reviewedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reviewedByUserId and reviewedAt are required when isReviewed=true"
      });
    }
  });

const ingestRequestSchema = z.object({
  idempotencyKey: z.string().min(1).optional(),
  items: z.array(ingestItemSchema).min(1)
});

const updateReviewSchema = z.object({
  reviewedByUserId: z.string().min(1).optional(),
  reviewedAt: z.string().datetime().optional()
});

const reviewQueueQuerySchema = z.object({
  category: libraryCategorySchema.optional(),
  family: z.string().optional(),
  enteredByUserId: z.string().optional()
});

const tablePreferenceScopeSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9_-]+$/i);

const tablePreferenceParamsSchema = z.object({
  scope: tablePreferenceScopeSchema
});

const tablePreferenceBodySchema = z.object({
  columnOrder: z.array(z.string().trim().min(1)).max(100),
  columnWidths: z.record(z.string().trim().min(1), z.number().finite().min(60).max(560))
});

const updateAttributesSchema = z
  .object({
    genre: z.string().optional(),
    gender: z.string().optional(),
    contactFamily1: z.string().optional(),
    pinCount: z.number().int().positive().optional(),
    contactFamily2: z.string().optional(),
    pinCount2: z.number().int().positive().optional(),
    emi: z.boolean().optional(),
    crimpGauge: z.string().optional(),
    contactSize: z.string().optional(),
    ampRating: z.string().optional(),
    operatingVoltage: z.string().optional(),
    operatingTemp: z.string().optional(),
    defaultProtectiveCoverPartId: z.string().optional(),
    insertArrangement: z.string().optional(),
    pinIds: z.array(z.string().min(1)).optional(),
    contactPositions: z.array(moduleContactPositionSchema).optional(),
    positionCount: z.number().int().nonnegative().optional(),
    simSlotCount: z.number().int().positive().optional(),
    simSlotSections: z.array(z.array(z.string())).optional(),
    slotOccupancy: z.number().int().positive().optional(),
    awg: z.string().min(1).optional(),
    plating: z.string().optional(),
    termType: z.string().optional(),
    ssCompatible: z.boolean().optional(),
    lengthAdded: z.number().optional(),
    acceptedAwgMin: z.number().positive().optional(),
    acceptedAwgMax: z.number().positive().optional(),
    acceptedFamilies: z.array(z.string().min(1)).optional(),
    studSize: z.string().optional(),
    tih: z.boolean().optional(),
    acceptedGauges: z.array(z.string().min(1)).optional(),
    wireInterface: z.string().optional(),
    milSpec: z.string().optional(),
    color: z.string().min(1).optional(),
    cma: z.number().optional(),
    wireType: z.string().optional(),
    insulationMaterial: z.string().optional(),
    overallDia: z.number().optional(),
    conductorDia: z.number().optional(),
    numberOfConductors: z.number().int().positive().optional(),
    tempMax: z.number().optional(),
    overallWireBraid: z.boolean().optional(),
    overallWireFoil: z.boolean().optional(),
    internalPairFoil: z.boolean().optional(),
    weightPerFt: z.number().optional(),
    k1: z.number().optional(),
    k2: z.number().optional(),
    lossCoefficient: z.number().optional(),
    maxFreq: z.number().optional(),
    impedance: z.number().optional(),
    maxVoltage: z.number().optional(),
    series: z.string().optional(),
    awgMin: z.number().optional(),
    awgMax: z.number().optional(),
    lengthIn: z.number().optional(),
    diaIn: z.number().optional(),
    sizeRanges: z.array(sleeveSizeRangeSchema).optional(),
    keyingPartId: z.string().optional(),
    bundleAllowance: z.number().optional(),
    fitments: z.array(backshellFitmentSchema).optional(),
    requiresBackshell: z.boolean().optional(),
    relatedModuleHintPartId: z.string().optional(),
    conductorCount: z.number().int().positive().optional(),
    manufacturerPn: z.string().optional(),
    variant: z.string().optional(),
    cmaMin: z.number().optional(),
    cmaMax: z.number().optional(),
    moduleCapacity: z.number().int().positive().optional(),
    slotIds: z.array(z.string().min(1)).optional()
  })
  .superRefine((value, context) => {
    if (
      value.acceptedAwgMin !== undefined &&
      value.acceptedAwgMax !== undefined &&
      value.acceptedAwgMin > value.acceptedAwgMax
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "acceptedAwgMin must be less than or equal to acceptedAwgMax",
        path: ["acceptedAwgMin"]
      });
    }
  });

const updatePartSchema = z.object({
  partNumber: z.string().min(1).optional(),
  family: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  isReviewed: z.boolean().optional(),
  reviewedByUserId: z.string().min(1).optional(),
  reviewedAt: z.string().datetime().optional(),
  stockStatus: stockStatusSchema.optional(),
  createdByUserId: z.string().min(1).optional(),
  createdAt: z.string().datetime().optional(),
  lastEditedByUserId: z.string().min(1).optional(),
  lastEditedAt: z.string().datetime().optional(),
  partType: z.string().optional(),
  side: z.string().optional(),
  notes: z.string().optional(),
  electricalMode: z.string().optional(),
  extraAttributes: z.record(z.string(), z.unknown()).optional(),
  attributes: updateAttributesSchema.optional()
});

const restoreComponentSchema = z.object({
  reactivate: z.boolean().optional()
});

const contactWireCompatSchema = z.object({
  contactPartId: z.string().min(1),
  wirePartId: z.string().min(1),
  status: compatStatusSchema,
  notes: z.string().optional(),
  crimpClass: z.string().optional()
});

const moduleContactCompatSchema = z.object({
  modulePartId: z.string().min(1),
  contactPartId: z.string().min(1),
  status: compatStatusSchema,
  notes: z.string().optional(),
  source: z.string().optional()
});

const moduleBackshellCompatSchema = z.object({
  modulePartId: z.string().min(1),
  backshellPartId: z.string().min(1),
  status: compatStatusSchema,
  notes: z.string().optional(),
  source: z.string().optional()
});

const moduleStrainReliefCompatSchema = z.object({
  modulePartId: z.string().min(1),
  strainReliefPartId: z.string().min(1),
  status: compatStatusSchema,
  notes: z.string().optional(),
  source: z.string().optional()
});

const partAliasSchema = z.object({
  partId: z.string().min(1),
  codeSystem: z.string().min(1),
  code: z.string().min(1)
});

const bulkContactWireCompatSchema = z.object({
  rows: z.array(contactWireCompatSchema).min(1)
});

const bulkModuleContactCompatSchema = z.object({
  rows: z.array(moduleContactCompatSchema).min(1)
});

const bulkModuleBackshellCompatSchema = z.object({
  rows: z.array(moduleBackshellCompatSchema).min(1)
});

const bulkModuleStrainReliefCompatSchema = z.object({
  rows: z.array(moduleStrainReliefCompatSchema).min(1)
});

const partRelationshipSchema = z
  .object({
    id: z.string().min(1).optional(),
    parentPartId: z.string().min(1),
    childPartId: z.string().min(1).optional(),
    relationshipType: z.string().min(1),
    positionType: z.string().min(1).optional(),
    parentPositions: z.array(z.string().min(1)).default([]),
    status: compatStatusSchema,
    sourceStatus: z.string().optional(),
    notes: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional()
  })
  .superRefine((value, context) => {
    if (value.childPartId && value.childPartId === value.parentPartId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "childPartId must differ from parentPartId",
        path: ["childPartId"]
      });
    }
  });

const bulkPartRelationshipSchema = z.object({
  rows: z.array(partRelationshipSchema).min(1)
});

const listRelationshipsQuerySchema = z.object({
  parentPartId: z.string().min(1).optional(),
  childPartId: z.string().min(1).optional(),
  relationshipType: z.string().min(1).optional()
});

const bulkReviewSchema = z.object({
  componentIds: z.array(z.string().min(1)).min(1),
  reviewedByUserId: z.string().min(1).optional(),
  reviewedAt: z.string().datetime().optional()
});

const awgCmaReferenceSchema = z.object({
  rows: z.array(z.object({ awg: z.string().min(1), cma: z.number().positive() })).min(1)
});

const aliasesListQuerySchema = z.object({
  partId: z.string().min(1).optional()
});

const deleteAliasQuerySchema = z.object({
  codeSystem: z.string().min(1),
  code: z.string().min(1)
});

function resolveActingUserId(request: { currentUser?: { id: string }; headers: Record<string, unknown> }): string {
  if (request.currentUser?.id) {
    return request.currentUser.id;
  }
  const headerUser = request.headers["x-user-id"];
  return (Array.isArray(headerUser) ? headerUser[0] : (headerUser as string | undefined)) ?? "system-user";
}

function wireAttrString(attributes: WireAttributes, key: "awg" | "color"): string {
  return String(attributes[key] ?? "").trim().toLowerCase();
}

export function registerLibraryRoutes(app: FastifyInstance) {
  app.get("/v1/library/components", async (request, reply) => {
    const auth = requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]);
    if (!auth.ok) {
      return;
    }
    const query = listLibraryQuerySchema.parse(request.query);
    const requestingUserId = resolveActingUserId(request);
    const isAdminAccount = request.currentUser?.accountRole === "admin";
    const canViewInactive = isAdminAccount;
    const q = query.q?.trim().toLowerCase();
    const items = await app.store.listLibraryComponents({
      requestingUserId,
      canViewAllUnreviewed: isAdminAccount,
      canViewInactive
    });
    const filtered = items.filter((part) => {
      if (query.category && part.category !== query.category) {
        return false;
      }
      if (query.family && part.family.toLowerCase() !== query.family.trim().toLowerCase()) {
        return false;
      }
      if (query.awg) {
        if (!isWirePart(part) || wireAttrString(part.attributes, "awg") !== query.awg.trim().toLowerCase()) {
          return false;
        }
      }
      if (query.color) {
        if (!isWirePart(part) || wireAttrString(part.attributes, "color") !== query.color.trim().toLowerCase()) {
          return false;
        }
      }
      if (query.isActive && part.isActive !== (query.isActive === "true")) {
        return false;
      }
      if (query.stockStatus && part.stockStatus !== query.stockStatus) {
        return false;
      }
      if (query.partType && (part.partType ?? "").trim().toLowerCase() !== query.partType.trim().toLowerCase()) {
        return false;
      }
      if (query.side && (part.side ?? "").trim().toLowerCase() !== query.side.trim().toLowerCase()) {
        return false;
      }
      if (q) {
        const haystack = `${part.partNumber} ${part.description} ${part.family} ${part.partType ?? ""} ${part.side ?? ""} ${part.notes ?? ""}`.toLowerCase();
        return haystack.includes(q);
      }
      return true;
    });
    return { items: filtered };
  });

  app.get("/v1/library/components/archived", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const items = await app.store.listArchivedLibraryComponents();
    return { items };
  });

  app.get("/v1/library/components/:componentId", async (request, reply) => {
    const auth = requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]);
    if (!auth.ok) {
      return;
    }
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    const requestingUserId = resolveActingUserId(request);
    const isAdminAccount = request.currentUser?.accountRole === "admin";
    const canViewInactive = isAdminAccount;
    const component = await app.store.getLibraryComponent({
      componentId: params.componentId,
      requestingUserId,
      canViewAllUnreviewed: isAdminAccount,
      canViewInactive
    });
    if (!component) {
      return reply.notFound("Component not found.");
    }
    return component;
  });

  app.get("/v1/library/table-preferences/:scope", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const params = tablePreferenceParamsSchema.parse(request.params);
    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.unauthorized("Authentication required.");
    }
    const preference = await app.store.getUserTablePreferences({
      userId,
      scope: params.scope
    });
    if (!preference) {
      return null;
    }
    return {
      scope: preference.scope,
      columnOrder: preference.columnOrder,
      columnWidths: preference.columnWidths,
      updatedAt: preference.updatedAt
    };
  });

  app.put("/v1/library/table-preferences/:scope", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const params = tablePreferenceParamsSchema.parse(request.params);
    const body = tablePreferenceBodySchema.parse(request.body);
    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.unauthorized("Authentication required.");
    }
    const uniqueOrder = Array.from(new Set(body.columnOrder));
    const widthsForKnownColumns = Object.fromEntries(
      Object.entries(body.columnWidths).filter(([columnId]) => uniqueOrder.includes(columnId))
    );
    const saved = await app.store.upsertUserTablePreferences({
      userId,
      scope: params.scope,
      columnOrder: uniqueOrder,
      columnWidths: widthsForKnownColumns
    });
    return {
      scope: saved.scope,
      columnOrder: saved.columnOrder,
      columnWidths: saved.columnWidths,
      updatedAt: saved.updatedAt
    };
  });

  app.post("/v1/library/components/ingest/dry-run", async (request, reply) => {
    const auth = requireRole(request, reply, ["editor", "owner"]);
    if (!auth.ok) {
      return;
    }
    const parsedBody = ingestRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest(parsedBody.error.issues.map((issue) => issue.message).join("; "));
    }
    const body = parsedBody.data;
    if (body.items.some((item) => item.isReviewed)) {
      return reply.conflict("Ingest creates unreviewed entries only. Use review endpoint for approval.");
    }
    const normalizedUserId = resolveActingUserId(request);
    const result = await app.store.ingestLibraryComponents({
      items: body.items,
      requestedByUserId: normalizedUserId,
      dryRun: true,
      idempotencyKey: body.idempotencyKey
    });
    return result;
  });

  app.post("/v1/library/components/ingest", async (request, reply) => {
    const auth = requireRole(request, reply, ["editor", "owner"]);
    if (!auth.ok) {
      return;
    }
    const parsedBody = ingestRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest(parsedBody.error.issues.map((issue) => issue.message).join("; "));
    }
    const body = parsedBody.data;
    if (body.items.some((item) => item.isReviewed)) {
      return reply.conflict("Ingest creates unreviewed entries only. Use review endpoint for approval.");
    }
    const normalizedUserId = resolveActingUserId(request);
    const result = await app.store.ingestLibraryComponents({
      items: body.items,
      requestedByUserId: normalizedUserId,
      dryRun: false,
      idempotencyKey: body.idempotencyKey
    });
    return reply.code(201).send(result);
  });

  app.post("/v1/library/components/:componentId/review", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    const body = updateReviewSchema.parse(request.body);
    const fallbackUserId = resolveActingUserId(request);
    const reviewed = await app.store.setLibraryComponentReview({
      componentId: params.componentId,
      isReviewed: true,
      reviewedByUserId: body.reviewedByUserId ?? fallbackUserId,
      reviewedAt: body.reviewedAt
    });
    if (!reviewed) {
      return reply.notFound("Component not found.");
    }
    return reviewed;
  });

  app.post("/v1/library/components/:componentId/unreview", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    const updated = await app.store.setLibraryComponentReview({
      componentId: params.componentId,
      isReviewed: false
    });
    if (!updated) {
      return reply.notFound("Component not found.");
    }
    return updated;
  });

  app.post("/v1/library/components/:componentId/archive", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    const archivedByUserId = resolveActingUserId(request);
    const archived = await app.store.archiveLibraryComponent({
      componentId: params.componentId,
      archivedByUserId
    });
    if (!archived) {
      return reply.notFound("Component not found.");
    }
    return archived;
  });

  app.post("/v1/library/components/:componentId/restore", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    const body = restoreComponentSchema.parse(request.body ?? {});
    const restored = await app.store.restoreLibraryComponent({
      componentId: params.componentId,
      restoredByUserId: resolveActingUserId(request),
      reactivate: body.reactivate
    });
    if (!restored) {
      return reply.notFound("Archived component not found.");
    }
    return restored;
  });

  app.delete("/v1/library/components/:componentId", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    const deleted = await app.store.deleteLibraryComponent({
      componentId: params.componentId
    });
    if (!deleted) {
      return reply.notFound("Component not found.");
    }
    return reply.code(204).send();
  });

  app.patch("/v1/library/components/:componentId", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const params = z.object({ componentId: z.string().min(1) }).parse(request.params);
    const body = updatePartSchema.parse(request.body);
    if (Object.values(body).every((value) => value === undefined)) {
      return reply.badRequest("At least one field is required.");
    }
    const existing = await app.store.getLibraryComponent({
      componentId: params.componentId,
      requestingUserId: resolveActingUserId(request),
      canViewAllUnreviewed: true,
      canViewInactive: true
    });
    if (!existing) {
      return reply.notFound("Component not found.");
    }
    const nextAttributes = {
      ...existing.attributes,
      ...(body.attributes ?? {})
    };
    if (existing.category === "wire") {
      const awg = "awg" in nextAttributes ? String(nextAttributes.awg ?? "").trim() : "";
      const color = "color" in nextAttributes ? String(nextAttributes.color ?? "").trim() : "";
      if (!awg || !color) {
        return reply.badRequest("Wire components require awg and color.");
      }
    }
    if (
      existing.category === "contact" &&
      "acceptedAwgMin" in nextAttributes &&
      "acceptedAwgMax" in nextAttributes
    ) {
      const min = nextAttributes.acceptedAwgMin;
      const max = nextAttributes.acceptedAwgMax;
      if (typeof min === "number" && typeof max === "number" && min > max) {
        return reply.badRequest("acceptedAwgMin must be less than or equal to acceptedAwgMax.");
      }
    }
    const nextIsReviewed = body.isReviewed ?? existing.isReviewed;
    const nextReviewedByUserId = nextIsReviewed ? (body.reviewedByUserId ?? existing.reviewedByUserId) : undefined;
    const nextReviewedAt = nextIsReviewed ? (body.reviewedAt ?? existing.reviewedAt) : undefined;
    if (nextIsReviewed && (!nextReviewedByUserId || !nextReviewedAt)) {
      return reply.badRequest("reviewedByUserId and reviewedAt are required when isReviewed=true.");
    }
    let updated;
    try {
      updated = await app.store.updateLibraryComponent({
        componentId: params.componentId,
        partNumber: body.partNumber,
        family: body.family,
        description: body.description,
        isActive: body.isActive,
        isReviewed: body.isReviewed,
        reviewedByUserId: nextIsReviewed ? nextReviewedByUserId : undefined,
        reviewedAt: nextIsReviewed ? nextReviewedAt : undefined,
        stockStatus: body.stockStatus,
        createdByUserId: body.createdByUserId,
        createdAt: body.createdAt,
        lastEditedByUserId: body.lastEditedByUserId,
        lastEditedAt: body.lastEditedAt,
        editedByUserId: request.currentUser?.id,
        partType: body.partType,
        side: body.side,
        notes: body.notes,
        electricalMode: body.electricalMode,
        extraAttributes: body.extraAttributes,
        attributes: body.attributes
      });
    } catch (error) {
      if (error instanceof Error && error.message === "WIRE_FIELDS_REQUIRED") {
        return reply.badRequest("Wire components require awg and color.");
      }
      throw error;
    }
    if (!updated) {
      return reply.notFound("Component not found.");
    }
    return updated;
  });

  app.get("/v1/library/components/review-queue", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const query = reviewQueueQuerySchema.parse(request.query);
    const items = await app.store.listLibraryReviewQueue({
      category: query.category,
      family: query.family,
      enteredByUserId: query.enteredByUserId
    });
    return { items };
  });

  app.post("/v1/library/components/review/bulk", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = bulkReviewSchema.parse(request.body);
    const fallbackUserId = resolveActingUserId(request);
    const result = await app.store.bulkSetLibraryComponentReview({
      componentIds: body.componentIds,
      reviewedByUserId: body.reviewedByUserId ?? fallbackUserId,
      reviewedAt: body.reviewedAt
    });
    return result;
  });

  app.get("/v1/library/compat/contact-wire", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const items = await app.store.listContactWireCompat();
    return { items };
  });

  app.put("/v1/library/compat/contact-wire", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = contactWireCompatSchema.parse(request.body);
    return app.store.upsertContactWireCompat(body);
  });

  app.post("/v1/library/compat/contact-wire/bulk", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = bulkContactWireCompatSchema.parse(request.body);
    return app.store.bulkUpsertContactWireCompat({ rows: body.rows });
  });

  app.delete("/v1/library/compat/contact-wire", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const query = z
      .object({
        contactPartId: z.string().min(1),
        wirePartId: z.string().min(1)
      })
      .parse(request.query);
    const deleted = await app.store.deleteContactWireCompat(query);
    if (!deleted) {
      return reply.notFound("Compat row not found.");
    }
    return reply.code(204).send();
  });

  app.get("/v1/library/compat/module-contact", async (request, reply) => {
    // Readable by designers so wirelist verifier can shade contact P/Ns; writes stay admin-only.
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const items = await app.store.listModuleContactCompat();
    return { items };
  });

  app.put("/v1/library/compat/module-contact", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = moduleContactCompatSchema.parse(request.body);
    return app.store.upsertModuleContactCompat(body);
  });

  app.post("/v1/library/compat/module-contact/bulk", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = bulkModuleContactCompatSchema.parse(request.body);
    return app.store.bulkUpsertModuleContactCompat({ rows: body.rows });
  });

  app.delete("/v1/library/compat/module-contact", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const query = z
      .object({
        modulePartId: z.string().min(1),
        contactPartId: z.string().min(1)
      })
      .parse(request.query);
    const deleted = await app.store.deleteModuleContactCompat(query);
    if (!deleted) {
      return reply.notFound("Compat row not found.");
    }
    return reply.code(204).send();
  });

  app.get("/v1/library/compat/module-backshell", async (request, reply) => {
    // Readable by designers so canvas can filter accessory pickers; writes stay admin-only.
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const items = await app.store.listModuleBackshellCompat();
    return { items };
  });


  app.put("/v1/library/compat/module-backshell", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = moduleBackshellCompatSchema.parse(request.body);
    return app.store.upsertModuleBackshellCompat(body);
  });

  app.post("/v1/library/compat/module-backshell/bulk", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = bulkModuleBackshellCompatSchema.parse(request.body);
    return app.store.bulkUpsertModuleBackshellCompat({ rows: body.rows });
  });

  app.delete("/v1/library/compat/module-backshell", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const query = z
      .object({
        modulePartId: z.string().min(1),
        backshellPartId: z.string().min(1)
      })
      .parse(request.query);
    const deleted = await app.store.deleteModuleBackshellCompat(query);
    if (!deleted) {
      return reply.notFound("Compat row not found.");
    }
    return reply.code(204).send();
  });

  app.get("/v1/library/compat/module-strain-relief", async (request, reply) => {
    // Readable by designers so canvas can filter accessory pickers; writes stay admin-only.
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const items = await app.store.listModuleStrainReliefCompat();
    return { items };
  });


  app.put("/v1/library/compat/module-strain-relief", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = moduleStrainReliefCompatSchema.parse(request.body);
    return app.store.upsertModuleStrainReliefCompat(body);
  });

  app.post("/v1/library/compat/module-strain-relief/bulk", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = bulkModuleStrainReliefCompatSchema.parse(request.body);
    return app.store.bulkUpsertModuleStrainReliefCompat({ rows: body.rows });
  });

  app.delete("/v1/library/compat/module-strain-relief", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const query = z
      .object({
        modulePartId: z.string().min(1),
        strainReliefPartId: z.string().min(1)
      })
      .parse(request.query);
    const deleted = await app.store.deleteModuleStrainReliefCompat(query);
    if (!deleted) {
      return reply.notFound("Compat row not found.");
    }
    return reply.code(204).send();
  });

  app.get("/v1/library/awg-cma-reference", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const items = await app.store.listAwgCmaReference();
    return { items };
  });

  app.put("/v1/library/awg-cma-reference", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = awgCmaReferenceSchema.parse(request.body);
    return app.store.bulkUpsertAwgCmaReference({ rows: body.rows });
  });

  app.get("/v1/library/aliases", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const query = aliasesListQuerySchema.parse(request.query);
    const items = await app.store.listPartAliases(
      query.partId ? { partId: query.partId } : undefined
    );
    return { items };
  });

  app.put("/v1/library/aliases", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = partAliasSchema.parse(request.body);
    return app.store.upsertPartAlias(body);
  });

  app.delete("/v1/library/aliases", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const query = deleteAliasQuerySchema.parse(request.query);
    const deleted = await app.store.deletePartAlias(query);
    if (!deleted) {
      return reply.notFound("Alias not found.");
    }
    return reply.code(204).send();
  });

  app.get("/v1/library/relationships", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const query = listRelationshipsQuerySchema.parse(request.query);
    const items = await app.store.listPartRelationships({
      parentPartId: query.parentPartId,
      childPartId: query.childPartId,
      relationshipType: query.relationshipType
    });
    return { items };
  });

  app.put("/v1/library/relationships", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const parsedBody = partRelationshipSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.badRequest(parsedBody.error.issues.map((issue) => issue.message).join("; "));
    }
    try {
      return await app.store.upsertPartRelationship(parsedBody.data);
    } catch (error) {
      if (error instanceof Error && error.message === "RELATIONSHIP_SELF_REFERENCE") {
        return reply.badRequest("childPartId must differ from parentPartId.");
      }
      throw error;
    }
  });

  app.post("/v1/library/relationships/bulk", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = bulkPartRelationshipSchema.parse(request.body);
    try {
      return await app.store.bulkUpsertPartRelationships({ rows: body.rows });
    } catch (error) {
      if (error instanceof Error && error.message === "RELATIONSHIP_SELF_REFERENCE") {
        return reply.badRequest("childPartId must differ from parentPartId.");
      }
      throw error;
    }
  });

  app.delete("/v1/library/relationships", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const query = z.object({ id: z.string().min(1) }).parse(request.query);
    const deleted = await app.store.deletePartRelationship(query);
    if (!deleted) {
      return reply.notFound("Relationship not found.");
    }
    return reply.code(204).send();
  });
}
