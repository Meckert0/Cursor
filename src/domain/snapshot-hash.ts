import { createHash } from "node:crypto";
import type { DesignSnapshot } from "./types.js";

export function hashDesignSnapshot(snapshot: DesignSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
