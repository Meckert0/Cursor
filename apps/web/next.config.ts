import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["adm-zip", "xlsx"],
  turbopack: {
    // Keep tracing inside the Next app so Vercel (Root Directory apps/web) does not
    // pull in the API package's node_modules.
    root: appDir
  }
};

export default nextConfig;
