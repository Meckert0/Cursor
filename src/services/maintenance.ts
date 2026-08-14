import type { AuthStore } from "../infra/auth/auth-store.js";
import type { ExportQueueService } from "./export-queue.js";

export type MaintenanceResult = {
  recovery: { recovered: number };
  due: { processed: number };
  retention: { deleted: number };
  adminSync: boolean;
};

export async function runMaintenance(input: {
  exportQueue: ExportQueueService;
  authStore: AuthStore;
}): Promise<MaintenanceResult> {
  const recovery = await input.exportQueue.recoverOrphanedExports();
  const due = await input.exportQueue.processDueExports();
  const retention = await input.exportQueue.runRetentionCleanup();
  let adminSync = false;
  if (typeof input.authStore.syncAdminRolesFromEnv === "function") {
    await input.authStore.syncAdminRolesFromEnv();
    adminSync = true;
  }
  return { recovery, due, retention, adminSync };
}
