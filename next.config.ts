import type { NextConfig } from "next";

const isSitesBuild = process.env.SITES_BUILD === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = isSitesBuild
  ? {}
  : {
      output: "export",
      basePath,
      images: {
        unoptimized: true,
      },
      typescript: {
        tsconfigPath: "./tsconfig.next.json",
      },
    };

export default nextConfig;
