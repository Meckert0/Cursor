import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireRole } from "../auth/rbac.js";
import { LIBRARY_CATEGORIES } from "../domain/library.js";

const libraryCategorySchema = z.enum(LIBRARY_CATEGORIES);

const listLibraryQuerySchema = z.object({
  q: z.string().optional(),
  category: libraryCategorySchema.optional(),
  family: z.string().optional(),
  awg: z.string().optional(),
  color: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional(),
  stockStatus: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional()
});

const ingestItemSchema = z
  .object({
    id: z.string().min(1).optional(),
    category: libraryCategorySchema,
    family: z.string().min(1),
    partNumber: z.string().min(1),
    description: z.string().min(1),
    awg: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    isActive: z.boolean().default(true),
    stockStatus: z.enum(["in_stock", "low_stock", "out_of_stock"]),
    compatibilityHints: z.array(z.string()).default([]),
    pinCount: z.number().int().positive().optional(),
    pinIds: z.array(z.string().min(1)).optional(),
    acceptedAwgMin: z.number().positive().optional(),
    acceptedAwgMax: z.number().positive().optional(),
    acceptedFamilies: z.array(z.string().min(1)).optional(),
    isReviewed: z.boolean().default(false),
    reviewedByUserId: z.string().optional(),
    reviewedAt: z.string().datetime().optional(),
    customFieldValues: z.record(z.string().min(1), z.string()).optional()
  })
  .superRefine((value, context) => {
    if (value.isReviewed && (!value.reviewedByUserId || !value.reviewedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reviewedByUserId and reviewedAt are required when isReviewed=true"
      });
    }
    if (
      value.acceptedAwgMin !== undefined &&
      value.acceptedAwgMax !== undefined &&
      value.acceptedAwgMin > value.acceptedAwgMax
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "acceptedAwgMin must be less than or equal to acceptedAwgMax"
      });
    }
    if (value.category === "wire") {
      if (!value.awg) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "awg is required when category=wire"
        });
      }
      if (!value.color) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "color is required when category=wire"
        });
      }
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

const updateActiveSchema = z.object({
  partNumber: z.string().min(1).optional(),
  family: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  awg: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  isReviewed: z.boolean().optional(),
  reviewedByUserId: z.string().min(1).optional(),
  reviewedAt: z.string().datetime().optional(),
  stockStatus: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional(),
  compatibilityHints: z.array(z.string()).optional(),
  pinCount: z.number().int().positive().nullable().optional(),
  pinIds: z.array(z.string().min(1)).optional(),
  acceptedAwgMin: z.number().positive().nullable().optional(),
  acceptedAwgMax: z.number().positive().nullable().optional(),
  acceptedFamilies: z.array(z.string().min(1)).optional(),
  createdByUserId: z.string().min(1).optional(),
  createdAt: z.string().datetime().optional(),
  lastEditedByUserId: z.string().min(1).optional(),
  lastEditedAt: z.string().datetime().optional(),
  customFieldValues: z.record(z.string().min(1), z.string()).optional()
});

const restoreComponentSchema = z.object({
  reactivate: z.boolean().optional()
});

const fieldDefinitionCategorySchema = libraryCategorySchema;

const fieldDefinitionByCategoryParamsSchema = z.object({
  category: fieldDefinitionCategorySchema
});

const fieldDefinitionByIdParamsSchema = z.object({
  fieldDefinitionId: z.string().trim().min(1)
});

const createFieldDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().trim().min(1).max(120),
  isVisibleInViewer: z.boolean().default(true),
  showOnAddForm: z.boolean().default(false),
  showInSearch: z.boolean().default(false)
});

const updateFieldDefinitionSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  isVisibleInViewer: z.boolean().optional(),
  showOnAddForm: z.boolean().optional(),
  showInSearch: z.boolean().optional()
});

function resolveActingUserId(request: { currentUser?: { id: string }; headers: Record<string, unknown> }): string {
  if (request.currentUser?.id) {
    return request.currentUser.id;
  }
  const headerUser = request.headers["x-user-id"];
  return (Array.isArray(headerUser) ? headerUser[0] : (headerUser as string | undefined)) ?? "system-user";
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
    const filtered = items.filter((component) => {
      if (query.category && component.category !== query.category) {
        return false;
      }
      if (query.family && component.family.toLowerCase() !== query.family.trim().toLowerCase()) {
        return false;
      }
      if (query.awg && (component.awg ?? "").toLowerCase() !== query.awg.trim().toLowerCase()) {
        return false;
      }
      if (query.color && (component.color ?? "").toLowerCase() !== query.color.trim().toLowerCase()) {
        return false;
      }
      if (query.isActive && component.isActive !== (query.isActive === "true")) {
        return false;
      }
      if (query.stockStatus && component.stockStatus !== query.stockStatus) {
        return false;
      }
      if (q) {
        const haystack = `${component.partNumber} ${component.description} ${component.family}`.toLowerCase();
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

  app.get("/v1/library/field-definitions/:category", async (request, reply) => {
    const auth = requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]);
    if (!auth.ok) {
      return;
    }
    const params = fieldDefinitionByCategoryParamsSchema.parse(request.params);
    const items = await app.store.listLibraryFieldDefinitions({ category: params.category });
    return { items };
  });

  app.post("/v1/library/field-definitions/:category", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const params = fieldDefinitionByCategoryParamsSchema.parse(request.params);
    const body = createFieldDefinitionSchema.parse(request.body);
    try {
      const created = await app.store.createLibraryFieldDefinition({
        category: params.category,
        key: body.key,
        label: body.label,
        valueType: "text",
        isVisibleInViewer: body.isVisibleInViewer,
        showOnAddForm: body.showOnAddForm,
        showInSearch: body.showInSearch,
        createdByUserId: resolveActingUserId(request)
      });
      return reply.code(201).send(created);
    } catch (error) {
      if (error instanceof Error && error.message === "FIELD_KEY_EXISTS") {
        return reply.conflict("Field key already exists for this category.");
      }
      if (error instanceof Error && error.message.includes("duplicate key value")) {
        return reply.conflict("Field key already exists for this category.");
      }
      throw error;
    }
  });

  app.patch("/v1/library/field-definitions/:fieldDefinitionId", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const params = fieldDefinitionByIdParamsSchema.parse(request.params);
    const body = updateFieldDefinitionSchema.parse(request.body);
    if (Object.values(body).every((value) => value === undefined)) {
      return reply.badRequest("At least one field is required.");
    }
    const updated = await app.store.updateLibraryFieldDefinition({
      fieldDefinitionId: params.fieldDefinitionId,
      label: body.label,
      isVisibleInViewer: body.isVisibleInViewer,
      showOnAddForm: body.showOnAddForm,
      showInSearch: body.showInSearch
    });
    if (!updated) {
      return reply.notFound("Field definition not found.");
    }
    return updated;
  });

  app.delete("/v1/library/field-definitions/:fieldDefinitionId", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const params = fieldDefinitionByIdParamsSchema.parse(request.params);
    const deleted = await app.store.deleteLibraryFieldDefinition({
      fieldDefinitionId: params.fieldDefinitionId
    });
    if (!deleted) {
      return reply.notFound("Field definition not found.");
    }
    return reply.code(204).send();
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
    const body = updateActiveSchema.parse(request.body);
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
    const nextAwg = body.awg ?? existing.awg;
    const nextColor = body.color ?? existing.color;
    if (existing.category === "wire" && (!nextAwg || !nextColor)) {
      return reply.badRequest("Wire components require awg and color.");
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
        awg: body.awg,
        color: body.color,
        isActive: body.isActive,
        isReviewed: body.isReviewed,
        reviewedByUserId: nextIsReviewed ? nextReviewedByUserId : undefined,
        reviewedAt: nextIsReviewed ? nextReviewedAt : undefined,
        stockStatus: body.stockStatus,
        compatibilityHints: body.compatibilityHints,
        pinCount: body.pinCount === null ? undefined : body.pinCount,
        pinIds: body.pinIds,
        acceptedAwgMin: body.acceptedAwgMin === null ? undefined : body.acceptedAwgMin,
        acceptedAwgMax: body.acceptedAwgMax === null ? undefined : body.acceptedAwgMax,
        acceptedFamilies: body.acceptedFamilies,
        createdByUserId: body.createdByUserId,
        createdAt: body.createdAt,
        lastEditedByUserId: body.lastEditedByUserId,
        lastEditedAt: body.lastEditedAt,
        editedByUserId: request.currentUser?.id,
        customFieldValues: body.customFieldValues
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
}
