import type { Redis } from "ioredis";

export interface ExportJobLock {
  acquire(exportId: string, ttlSeconds: number): Promise<boolean>;
  release(exportId: string): Promise<void>;
}

export class RedisExportJobLock implements ExportJobLock {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = ""
  ) {}

  async acquire(exportId: string, ttlSeconds: number): Promise<boolean> {
    const acquired = await this.redis.set(this.key(exportId), "1", "EX", Math.max(1, ttlSeconds), "NX");
    return Boolean(acquired);
  }

  async release(exportId: string): Promise<void> {
    await this.redis.del(this.key(exportId));
  }

  private key(exportId: string): string {
    const prefix = this.keyPrefix ? `${this.keyPrefix}:` : "";
    return `${prefix}export:${exportId}:lock`;
  }
}
