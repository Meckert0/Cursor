import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["adm-zip"],
  turbopack: {
    // Explicit monorepo root so Next stops warning about multiple lockfiles.
    root: path.join(appDir, "../..")
  }
};

export default nextConfig;
