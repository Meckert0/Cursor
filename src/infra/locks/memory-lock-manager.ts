import type { LockInfo, LockManager } from "./lock-manager.js";

type LockRow = {
  lockedBy: string;
  expiresAtMs: number;
};

export class MemoryLockManager implements LockManager {
  private readonly locks = new Map<string, LockRow>();

  async lock(designId: string, userId: string, ttlSeconds: number): Promise<LockInfo> {
    const now = Date.now();
    const existing = this.locks.get(designId);
    if (existing && existing.expiresAtMs > now && existing.lockedBy !== userId) {
      throw new Error("LOCK_CONFLICT");
    }

    const expiresAtMs = now + ttlSeconds * 1000;
    this.locks.set(designId, { lockedBy: userId, expiresAtMs });
    return {
      designId,
      lockedBy: userId,
      expiresAt: new Date(expiresAtMs).toISOString()
    };
  }

  async unlock(designId: string, userId: string): Promise<void> {
    const existing = this.locks.get(designId);
    if (!existing) {
      return;
    }
    if (existing.lockedBy !== userId) {
      throw new Error("LOCK_CONFLICT");
    }
    this.locks.delete(designId);
  }
}
