import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  // Browser automation / some hosts hit HMR as 127.0.0.1 while the app is localhost.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      tailwindcss: path.join(projectRoot, "node_modules/tailwindcss"),
    },
  },
};

export default nextConfig;
