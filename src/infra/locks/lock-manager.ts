export interface LockInfo {
  designId: string;
  lockedBy: string;
  expiresAt: string;
}

export interface LockManager {
  lock(designId: string, userId: string, ttlSeconds: number): Promise<LockInfo>;
  unlock(designId: string, userId: string): Promise<void>;
}
