import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep server-only secrets out of the browser bundle. The build also asserts
  // this in src/db/token-scope/no-public-service-role.test.ts (PLAN.md §7.6).
  poweredByHeader: false,
  serverExternalPackages: [],
};

export default nextConfig;
