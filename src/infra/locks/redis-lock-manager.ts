import type { Redis } from "ioredis";
import type { LockInfo, LockManager } from "./lock-manager.js";

export class RedisLockManager implements LockManager {
  constructor(private readonly redis: Redis) {}

  async lock(designId: string, userId: string, ttlSeconds: number): Promise<LockInfo> {
    const key = `design:${designId}:lock`;
    const payload = JSON.stringify({ lockedBy: userId, createdAt: new Date().toISOString() });
    const acquired = await this.redis.set(key, payload, "EX", ttlSeconds, "NX");
    if (!acquired) {
      const existingRaw = await this.redis.get(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : { lockedBy: "unknown" };
      throw new Error(`LOCK_CONFLICT:${existing.lockedBy}`);
    }

    return {
      designId,
      lockedBy: userId,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
    };
  }

  async unlock(designId: string, userId: string): Promise<void> {
    const key = `design:${designId}:lock`;
    const raw = await this.redis.get(key);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as { lockedBy: string };
    if (parsed.lockedBy !== userId) {
      throw new Error("LOCK_CONFLICT");
    }
    await this.redis.del(key);
  }
}
